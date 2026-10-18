use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::{
    env,
    error::Error,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{net::TcpListener, signal};
use uuid::Uuid;

const COOKIE_NAME: &str = "visitor";
const COOKIE_MAX_AGE: u64 = 60 * 60 * 24 * 365; // 3am
// I should changes this every time I add a page :<
const PAGES: &[&str] = &["/", "/about", "/projects", "/minecraft", "/visitors"];

struct AppState {
    db: Mutex<Connection>,
}

#[derive(Deserialize)]
struct VisitInput {
    path: String,
}

#[derive(Serialize)]
struct Stats {
    unique_visitors: i64,
    total_visits: i64,
    pages: Vec<PageStats>,
}

#[derive(Serialize)]
struct PageStats {
    path: String,
    views: i64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let address: SocketAddr = env::var("VISITORS_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8787".to_owned())
        .parse()?;

    let database =
        PathBuf::from(env::var_os("VISITORS_DB").unwrap_or_else(|| "visitors.sqlite3".into()));

    if let Some(parent) = database
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }

    let db = Connection::open(database)?;
    db.busy_timeout(std::time::Duration::from_secs(5))?;
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

    let state = Arc::new(AppState { db: Mutex::new(db) });

    let app = Router::new()
        .route("/api/visit", post(record_visit))
        .route("/api/visitors", get(read_stats))
        .layer(DefaultBodyLimit::max(1024))
        .with_state(state);

    let listener = TcpListener::bind(address).await?;
    println!("visitor counter listening on {address}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn record_visit(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(input): Json<VisitInput>,
) -> Result<Response, StatusCode> {
    let Some(path) = canonical_path(&input.path) else {
        return Err(StatusCode::BAD_REQUEST);
    };

    let (visitor_id, new_cookie) = match read_visitor_cookie(&headers) {
        Some(id) => (id, false),
        None => (Uuid::new_v4().simple().to_string(), true),
    };

    let now = unix_time()?;
    let db = state
        .db
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let transaction = db.unchecked_transaction().map_err(database_error)?;

    transaction
        .execute(
            "INSERT OR IGNORE INTO visitors (id, first_seen)
             VALUES (?1, ?2)",
            params![visitor_id, now],
        )
        .map_err(database_error)?;

    transaction
        .execute(
            "INSERT INTO page_views (path, views, last_seen)
             VALUES (?1, 1, ?2)
             ON CONFLICT(path) DO UPDATE SET
                 views = page_views.views + 1,
                 last_seen = excluded.last_seen",
            params![path, now],
        )
        .map_err(database_error)?;

    transaction.commit().map_err(database_error)?;

    let stats = query_stats(&db).map_err(database_error)?;
    drop(db);

    let mut response = (StatusCode::OK, Json(stats)).into_response();

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));

    if new_cookie {
        let value = format!(
            "{COOKIE_NAME}={visitor_id}; Path=/; Max-Age={COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax"
        );

        let value = HeaderValue::from_bytes(value.as_bytes())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        response.headers_mut().insert(header::SET_COOKIE, value);
    }

    Ok(response)
}

async fn read_stats(State(state): State<Arc<AppState>>) -> Result<Response, StatusCode> {
    let db = state
        .db
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let stats = query_stats(&db).map_err(database_error)?;
    let mut response = Json(stats).into_response();

    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));

    Ok(response)
}

fn query_stats(db: &Connection) -> rusqlite::Result<Stats> {
    let unique_visitors = db.query_row("SELECT COUNT(*) FROM visitors", [], |row| row.get(0))?;

    let total_visits = db.query_row(
        "SELECT COALESCE(SUM(views), 0) FROM page_views",
        [],
        |row| row.get(0),
    )?;

    let mut statement = db.prepare(
        "SELECT path, views
         FROM page_views
         ORDER BY views DESC, path ASC",
    )?;

    let rows = statement.query_map([], |row| {
        Ok(PageStats {
            path: row.get(0)?,
            views: row.get(1)?,
        })
    })?;

    let mut pages = Vec::new();

    for page in rows {
        pages.push(page?);
    }

    Ok(Stats {
        unique_visitors,
        total_visits,
        pages,
    })
}

fn read_visitor_cookie(headers: &HeaderMap) -> Option<String> {
    let cookies = headers.get(header::COOKIE)?.to_str().ok()?;

    cookies.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;

        if name == COOKIE_NAME && valid_visitor_id(value) {
            Some(value.to_ascii_lowercase())
        } else {
            None
        }
    })
}

fn valid_visitor_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn unix_time() -> Result<i64, StatusCode> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .as_secs();

    i64::try_from(seconds).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn database_error(_: rusqlite::Error) -> StatusCode {
    StatusCode::INTERNAL_SERVER_ERROR
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = signal::ctrl_c() => {},
                    _ = terminate.recv() => {},
                }
            }
            Err(_) => {
                let _ = signal::ctrl_c().await;
            }
        }
    }

    #[cfg(not(unix))]
    {
        let _ = signal::ctrl_c().await;
    }
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
