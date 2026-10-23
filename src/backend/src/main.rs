use rusqlite::{Connection, params};
use std::{
    env,
    error::Error,
    fs,
    io::Read,
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tiny_http::{Header, Method, Request, Response, ResponseBox, Server, StatusCode};
use uuid::Uuid;

const COOKIE_NAME: &str = "visitor";
const COOKIE_MAX_AGE: u64 = 60 * 60 * 24 * 365;
const MAX_BODY: usize = 1024;
const PAGES: &[&str] = &["/", "/about", "/projects", "/minecraft"];

fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let address =
        env::var("VISITORS_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".to_owned());

    let database = PathBuf::from(
        env::var_os("VISITORS_DB").unwrap_or_else(|| "visitors.sqlite3".into()),
    );

    if let Some(parent) = database
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }

    let mut db = Connection::open(database)?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.pragma_update(None, "journal_mode", "WAL")?;

    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS visitors (
            id TEXT PRIMARY KEY,
            first_seen INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS page_views (
            path TEXT PRIMARY KEY,
            views INTEGER NOT NULL DEFAULT 0,
            last_seen INTEGER NOT NULL
        ) WITHOUT ROWID;",
    )?;

    let server = Server::http(&address)?;
    println!("visitor counter listening on {address}");

    for request in server.incoming_requests() {
        handle(request, &mut db);
    }

    Ok(())
}

fn handle(mut request: Request, db: &mut Connection) {
    let method = request.method().clone();
    let path = request
        .url()
        .split('?')
        .next()
        .unwrap_or("/")
        .to_owned();

    let response = match (method, path.as_str()) {
        (Method::Post, "/api/visit") => record_visit(&mut request, db),

        (Method::Get, "/api/visitors") => match query_stats(db) {
            Ok((unique_visitors, total_visits)) => {
                let body = format!(
                    r#"{{"unique_visitors":{unique_visitors},"total_visits":{total_visits}}}"#
                );

                json_response(body)
            }
            Err(error) => {
                eprintln!("database error: {error}");
                empty_response(500)
            }
        },

        (_, route) if route == "/api/visit" || route == "/api/visitors" => {
            empty_response(405)
        }

        _ => empty_response(404),
    };

    if let Err(error) = request.respond(response) {
        eprintln!("response error: {error}");
    }
}

fn record_visit(request: &mut Request, db: &mut Connection) -> ResponseBox {
    if !has_json_content_type(request.headers()) {
        return empty_response(415);
    }

    if request
        .body_length()
        .is_some_and(|length| length > MAX_BODY)
    {
        return empty_response(413);
    }

    let mut body = Vec::new();

    if request
        .as_reader()
        .take((MAX_BODY + 1) as u64)
        .read_to_end(&mut body)
        .is_err()
    {
        return empty_response(400);
    }

    if body.len() > MAX_BODY {
        return empty_response(413);
    }

    let input: serde_json::Value =
        match serde_json::from_slice(&body) {
            Ok(input) => input,
            Err(_) => return empty_response(400),
        };

    let Some(path) = input
        .get("path")
        .and_then(|value| value.as_str())
        .and_then(canonical_path)
    else {
        return empty_response(400);
    };

    let existing_id = read_visitor_cookie(request.headers());
    let new_cookie = existing_id.is_none();

    let visitor_id =
        existing_id.unwrap_or_else(|| Uuid::new_v4().simple().to_string());

    let Some(now) = unix_time() else {
        return empty_response(500);
    };

    if let Err(error) = write_visit(db, &visitor_id, path, now) {
        eprintln!("database error: {error}");
        return empty_response(500);
    }

    let mut response = Response::empty(StatusCode(204))
        .with_header(header(b"Cache-Control", b"no-store"));

    if new_cookie {
        let cookie = format!(
            "{COOKIE_NAME}={visitor_id}; Path=/; \
             Max-Age={COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax"
        );

        response = response.with_header(header(
            b"Set-Cookie",
            cookie.as_bytes(),
        ));
    }

    response.boxed()
}

fn write_visit(
    db: &mut Connection,
    visitor_id: &str,
    path: &str,
    now: i64,
) -> rusqlite::Result<()> {
    let transaction = db.transaction()?;

    transaction.execute(
        "INSERT OR IGNORE INTO visitors (id, first_seen)
         VALUES (?1, ?2)",
        params![visitor_id, now],
    )?;

    transaction.execute(
        "INSERT INTO page_views (path, views, last_seen)
         VALUES (?1, 1, ?2)
         ON CONFLICT(path) DO UPDATE SET
             views = page_views.views + 1,
             last_seen = excluded.last_seen",
        params![path, now],
    )?;

    transaction.commit()
}

fn query_stats(db: &Connection) -> rusqlite::Result<(i64, i64)> {
    let unique_visitors: i64 =
        db.query_row("SELECT COUNT(*) FROM visitors", [], |row| row.get(0))?;

    let total_visits: i64 = db.query_row(
        "SELECT COALESCE(SUM(views), 0) FROM page_views",
        [],
        |row| row.get(0),
    )?;

    Ok((unique_visitors, total_visits))
}

fn read_visitor_cookie(headers: &[Header]) -> Option<String> {
    headers
        .iter()
        .filter(|header| header.field.equiv("Cookie"))
        .find_map(|header| {
            header.value.as_str().split(';').find_map(|part| {
                let (name, value) = part.trim().split_once('=')?;

                if name == COOKIE_NAME && valid_visitor_id(value) {
                    Some(value.to_ascii_lowercase())
                } else {
                    None
                }
            })
        })
}

fn valid_visitor_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn has_json_content_type(headers: &[Header]) -> bool {
    headers
        .iter()
        .find(|header| header.field.equiv("Content-Type"))
        .and_then(|header| header.value.as_str().split(';').next())
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
}

fn unix_time() -> Option<i64> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();

    i64::try_from(seconds).ok()
}

fn canonical_path(path: &str) -> Option<&'static str> {
    let path = path.strip_suffix(".html").unwrap_or(path);
    let path = if path == "/index" { "/" } else { path };
    let path = if path.len() > 1 {
        path.trim_end_matches('/')
    } else {
        path
    };

    PAGES.iter().copied().find(|page| *page == path)
}

fn json_response(body: String) -> ResponseBox {
    Response::from_string(body)
        .with_status_code(StatusCode(200))
        .with_header(header(
            b"Content-Type",
            b"application/json; charset=utf-8",
        ))
        .with_header(header(b"Cache-Control", b"no-store"))
        .boxed()
}

fn empty_response(status: u16) -> ResponseBox {
    Response::empty(StatusCode(status))
        .with_header(header(b"Cache-Control", b"no-store"))
        .boxed()
}

fn header(name: &[u8], value: &[u8]) -> Header {
    Header::from_bytes(name, value).expect("valid HTTP header")
}
