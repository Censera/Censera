const CFG = {
  histCap: 3000,
  maxProbe: 500,
  probeBatch: 8,
  maxStack: 256,
  fetchMs: 8000,
  loaderDelay: 150,
  cellScale: 1.25,
  tMax: 40,
  histShow: 80,
};
const SPEEDS = [0.5, 1, 2, 4, 8, 12, 67];
const ANGLE = { right: 0, down: 90, left: 180, up: 270 };
const TURN_LEFT = { up: "left", down: "right", left: "down", right: "up" };
const TURN_RIGHT = { up: "right", down: "left", left: "up", right: "down" };
const COLOR_OF = { b: "blue", r: "red", g: "green" };
const FILL = {
  fillR: ["r", "red"],
  fillG: ["g", "green"],
  fillB: ["b", "blue"],
};
const isTile = (c) => !!c && "rgbRGB".includes(c);
const $ = (id) => document.getElementById(id);
const icon = (id, cls, style) =>
  `<svg class="ic${cls ? " " + cls : ""}"${style ? ' style="' + style + '"' : ""}><use href="#i-${id}"/></svg>`;

const asArray = (v) => (Array.isArray(v) ? v : []);
const fail = (e) => console.warn(e);

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("rz2:" + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("rz2:" + k, JSON.stringify(v));
    } catch {}
  },
};

const S = {
  ids: [],
  level: null,
  data: null,
  program: [],
  fill: false,
  selected: null,
  M: null,
  hist: [],
  log: [],
  cur: null,
  running: false,
  timer: 0,
  dims: { rows: 0, cols: 0 },
  cells: [],
  slotEls: [],
  curEl: null,
  req: 0,
  cache: new Map(),
  loadTimer: 0,
  solved: new Set(
    asArray(store.get("solved", [])).map(Number).filter(Number.isFinite),
  ),
  speedIdx: (() => {
    const v = Number(store.get("speed", 1));
    return Number.isInteger(v) && v >= 0 ? Math.min(v, SPEEDS.length - 1) : 1;
  })(),
};

const countStars = (m) =>
  m.reduce((n, row) => n + [...row].filter((c) => "BRG".includes(c)).length, 0);
const delayOf = (info) => (info.delay * 1000) / SPEEDS[S.speedIdx];

function newMachine() {
  const sp = S.data.starting_pos;
  return {
    map: [...S.data.map],
    robot: { x: sp.x, y: sp.y, dir: sp.dir },
    stars: countStars(S.data.map),
    stack: S.program.length ? [{ f: 0, i: 0 }] : [],
    result: null,
    steps: 0,
  };
}

function snapshot(M) {
  return {
    map: [...M.map],
    robot: { ...M.robot },
    stars: M.stars,
    stack: M.stack.map((fr) => ({ ...fr })),
    result: M.result,
    steps: M.steps,
  };
}

function outOfMap(M) {
  const { x, y } = M.robot;
  return x < 0 || y < 0 || y >= M.map.length || !isTile(M.map[y][x]);
}

function matches(M, color) {
  return (
    color === null ||
    COLOR_OF[M.map[M.robot.y][M.robot.x].toLowerCase()] === color
  );
}

function moveRobot(M) {
  const r = M.robot;
  if (r.dir === "up") r.y--;
  else if (r.dir === "down") r.y++;
  else if (r.dir === "left") r.x--;
  else if (r.dir === "right") r.x++;
}

function fillTile(M, key) {
  const { x, y } = M.robot;
  M.map[y] = M.map[y].slice(0, x) + FILL[key][0] + M.map[y].slice(x + 1);
}

function collect(M) {
  const { x, y } = M.robot;
  const c = M.map[y][x];
  if ("BRG".includes(c))
    M.map[y] = M.map[y].slice(0, x) + c.toLowerCase() + M.map[y].slice(x + 1);
  M.stars = countStars(M.map);
}

function settle(st) {
  while (st.length) {
    const top = st[st.length - 1];
    const fn = S.program[top.f];
    while (top.i < fn.length && fn[top.i].movement === null) top.i++;
    if (top.i < fn.length) return;
    st.pop();
  }
}

function step(M) {
  if (M.result !== null) return null;
  const st = M.stack;
  settle(st);
  if (!st.length) {
    M.result = M.stars ? 1 : 0;
    return null;
  }
  const fr = st[st.length - 1];
  const f = fr.f,
    i = fr.i,
    s = S.program[f][i];
  fr.i++;
  const info = {
    f,
    i,
    mv: s.movement,
    color: s.color,
    delay: 1,
    skipped: false,
  };
  if (matches(M, s.color)) {
    const mv = s.movement;
    if (mv === "forward") moveRobot(M);
    else if (mv === "left") M.robot.dir = TURN_LEFT[M.robot.dir];
    else if (mv === "right") M.robot.dir = TURN_RIGHT[M.robot.dir];
    else if (FILL[mv]) fillTile(M, mv);
    else if (typeof mv === "number") {
      settle(st);
      if (st.length >= CFG.maxStack) M.result = 3;
      else st.push({ f: mv, i: 0 });
      info.delay = 0.25;
    }
  } else {
    info.skipped = true;
    info.delay = 0.25;
  }
  M.steps++;
  if (outOfMap(M)) M.result = 2;
  else {
    collect(M);
    if (M.stars === 0) M.result = 0;
  }
  return info;
}

function onWin() {
  S.solved.add(S.level);
  store.set("solved", [...S.solved]);
}

function pause() {
  clearTimeout(S.timer);
  S.running = false;
  renderCtl();
}

function resetMachine() {
  clearTimeout(S.timer);
  S.running = false;
  S.M = S.data ? newMachine() : null;
  S.hist = [];
  S.log = [];
  S.cur = null;
  renderStep();
}

function doStep() {
  S.hist.push(snapshot(S.M));
  const info = step(S.M);
  if (!info) {
    S.hist.pop();
    renderStep();
    return null;
  }
  S.cur = { f: info.f, i: info.i };
  S.log.push({
    f: info.f,
    i: info.i,
    mv: info.mv,
    color: info.color,
    skip: info.skipped,
  });
  if (S.hist.length > CFG.histCap) {
    S.hist.shift();
    S.log.shift();
  }
  renderStep();
  if (S.M.result === 0) onWin();
  return info;
}

function tick() {
  if (!S.running) return;
  const info = doStep();
  if (!info || S.M.result !== null) {
    S.running = false;
    renderCtl();
    return;
  }
  S.timer = setTimeout(tick, delayOf(info));
}

function play() {
  if (!S.data) return;
  if (S.running) {
    pause();
    return;
  }
  if (S.M.result !== null) resetMachine();
  S.running = true;
  renderCtl();
  tick();
}

function stop() {
  if (!S.data) return;
  pause();
  resetMachine();
}

function stepForward() {
  if (!S.data) return;
  pause();
  if (S.M.result === null) doStep();
}

function stepBack() {
  if (!S.data) return;
  pause();
  const snap = S.hist.pop();
  if (!snap) return;
  S.M = {
    ...snap,
    map: [...snap.map],
    robot: { ...snap.robot },
    stack: snap.stack.map((fr) => ({ ...fr })),
  };
  S.log.pop();
  const last = S.log[S.log.length - 1];
  S.cur = last ? { f: last.f, i: last.i } : null;
  renderStep();
}

async function getJSON(url) {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(CFG.fetchMs),
  });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

function validLevel(d) {
  return (
    !!d &&
    Array.isArray(d.map) &&
    d.map.length > 0 &&
    d.map.every((r) => typeof r === "string") &&
    !!d.starting_pos &&
    Number.isInteger(d.starting_pos.x) &&
    Number.isInteger(d.starting_pos.y) &&
    Object.hasOwn(ANGLE, d.starting_pos.dir) &&
    Array.isArray(d.functions) &&
    d.functions.length > 0 &&
    d.functions.every((n) => Number.isInteger(n) && n >= 0)
  );
}

async function fetchLevel(n) {
  const d = await getJSON(`./maps/level_${n}.json`);
  if (!validLevel(d)) throw new Error("invalid level " + n);
  return d;
}

async function discoverLevels() {
  try {
    const j = await getJSON("./maps/index.json");
    const ids = (Array.isArray(j) ? j : j.levels || [])
      .map(Number)
      .filter(Number.isFinite);
    if (ids.length) return [...new Set(ids)].sort((a, b) => a - b);
  } catch (e) {
    fail(e);
  }
  const ids = [];
  for (let n = 1; n <= CFG.maxProbe; n += CFG.probeBatch) {
    const batch = Array.from(
      { length: CFG.probeBatch },
      (_, k) => n + k,
    ).filter((id) => id <= CFG.maxProbe);
    const res = await Promise.all(
      batch.map((id) =>
        fetchLevel(id).then(
          (d) => [id, d],
          () => null,
        ),
      ),
    );
    for (const hit of res) {
      if (!hit) return ids;
      S.cache.set(hit[0], hit[1]);
      ids.push(hit[0]);
    }
  }
  return ids;
}

function loading(on) {
  const el = $("loader");
  if (!on) {
    clearTimeout(S.loadTimer);
    S.loadTimer = 0;
    el.hidden = true;
    $("app").inert = false;
    return;
  }
  $("app").inert = true;
  if (!S.loadTimer && el.hidden)
    S.loadTimer = setTimeout(() => {
      S.loadTimer = 0;
      el.hidden = false;
    }, CFG.loaderDelay);
}

function showScreen(name) {
  $("levels").hidden = name !== "levels";
  $("game").hidden = name !== "game";
  renderHeader();
}

function goLevels() {
  S.req++;
  loading(false);
  pause();
  store.set("open", false);
  showScreen("levels");
  renderLevels();
}

function validMove(mv, count) {
  return (
    mv === null ||
    mv === "forward" ||
    mv === "left" ||
    mv === "right" ||
    (S.fill && !!FILL[mv]) ||
    (Number.isInteger(mv) && mv >= 0 && mv < count)
  );
}

function buildProgram(lens) {
  const saved = store.get("prog:" + S.level, null);
  return lens.map((len, f) =>
    Array.from({ length: len }, (_, i) => {
      const sv = saved?.[f]?.[i];
      const mv = sv ? sv[0] : null,
        color = sv ? sv[1] : null;
      return {
        movement: validMove(mv, lens.length) ? mv : null,
        color: ["red", "green", "blue"].includes(color) ? color : null,
      };
    }),
  );
}

function saveProgram() {
  store.set(
    "prog:" + S.level,
    S.program.map((fn) => fn.map((s) => [s.movement, s.color])),
  );
}

async function loadLevel(n) {
  pause();
  const req = ++S.req;
  loading(true);
  let data = null;
  try {
    data = S.cache.get(n) || (await fetchLevel(n));
    S.cache.delete(n);
  } catch (e) {
    fail(e);
  }
  if (req !== S.req) return;
  loading(false);
  if (!data) {
    goLevels();
    return;
  }
  S.level = n;
  store.set("level", n);
  store.set("open", true);
  S.data = data;
  S.fill = data.fill === true;
  S.program = buildProgram(data.functions);
  S.selected = null;
  S.M = newMachine();
  S.hist = [];
  S.log = [];
  S.cur = null;
  buildMap();
  renderProgram();
  renderPalette();
  renderStep();
  showScreen("game");
  fitUI();
  if (document.fonts) document.fonts.ready.then(fitUI);
}

function renderHeader() {
  const onGame = !$("game").hidden;
  $("topRight").innerHTML = onGame
    ? `<span>Level: ${S.level}</span>`
    : `${icon("trophy")}<span>${S.ids.filter((n) => S.solved.has(n)).length} / ${S.ids.length}</span>`;
}

function renderLevels() {
  const last = store.get("level", null);
  $("grid").innerHTML = S.ids
    .map(
      (n) =>
        `<button class="lt${S.solved.has(n) ? " done" : ""}${n === last ? " last" : ""}" data-n="${n}" aria-label="Level ${n}">${n}</button>`,
    )
    .join("");
  $("empty").hidden = S.ids.length > 0;
  renderHeader();
  fitLevels();
}

function fitLevels() {
  const g = $("grid"),
    n = S.ids.length;
  if (!n || $("levels").hidden) return;
  const W = g.clientWidth,
    H = g.clientHeight,
    gap = 10;
  let best = 0,
    cols = 1;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const s = Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / r);
    if (s > best) {
      best = s;
      cols = c;
    }
  }
  best = Math.floor(Math.max(18, Math.min(best, 88)));
  g.style.gridTemplateColumns = `repeat(${cols},${best}px)`;
  g.style.gridAutoRows = `${best}px`;
  g.style.fontSize = `${Math.max(10, Math.round(best * 0.38))}px`;
}

function buildMap() {
  const m = $("map");
  S.cells = [];
  m.classList.remove("ready");

  if (!S.M) {
    m.innerHTML = "";
    S.dims = { rows: 0, cols: 0 };
    return;
  }

  const rows = S.M.map.length;
  const cols = Math.max(...S.M.map.map((r) => r.length));

  S.dims = { rows, cols };

  m.innerHTML = '<div class="cell"></div>'.repeat(rows * cols);
  S.cells = [...m.children].map((el) => ({ el, sig: null }));
}

function updateMap() {
  if (!S.M) return;
  const M = S.M,
    { rows, cols } = S.dims;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = M.map[y][x] ?? " ";
      const here = x === M.robot.x && y === M.robot.y;
      const sig = c + (here ? "@" + M.robot.dir : "");
      const cell = S.cells[y * cols + x];
      if (cell.sig === sig) continue;
      cell.sig = sig;
      const bot = here
        ? icon("bot", "bot", `transform:rotate(${ANGLE[M.robot.dir] + 45}deg)`)
        : "";
      if (!isTile(c)) {
        cell.el.className = "cell void";
        cell.el.innerHTML = bot;
      } else {
        cell.el.className = `cell c-${COLOR_OF[c.toLowerCase()]}`;
        cell.el.innerHTML = bot || ("BRG".includes(c) ? icon("star") : "");
      }
    }
  }
}

function fitMap() {
  if (!S.M || $("game").hidden) return;

  const { rows, cols } = S.dims;
  const wrap = $("mapWrap");
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;

  if (!w || !h || !rows || !cols) return;

  const slot =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--t"),
    ) || 38;

  const gap = 2;

  const cell = Math.max(
    1,
    Math.floor(
      Math.min(
        (w - gap * (cols - 1)) / cols,
        (h - gap * (rows - 1)) / rows,
        slot * CFG.cellScale,
      ),
    ),
  );

  const m = $("map");

  m.style.gap = `${gap}px`;
  m.style.gridTemplateColumns = `repeat(${cols}, ${cell}px)`;
  m.style.gridTemplateRows = `repeat(${rows}, ${cell}px)`;
  m.style.width = `${cols * cell + (cols - 1) * gap}px`;
  m.style.height = `${rows * cell + (rows - 1) * gap}px`;

  m.classList.add("ready");
}
function fitUI() {
  if ($("game").hidden) return;

  const t = CFG.tMax;
  const slots = Math.max(6, ...S.program.map((f) => f.length));
  const cap = $("app").clientWidth * 0.55;

  const sideWidth = Math.min(Math.ceil((slots + 1) * t + slots * 4 + 6), cap);

  const root = document.documentElement;
  root.style.setProperty("--t", `${t}px`);
  root.style.setProperty("--sidew", `${sideWidth}px`);

  fitMap();
}

function tile(mv, color, cls, tag, attrs) {
  let inner = "";
  if (mv === "forward") inner = icon("up");
  else if (mv === "left") inner = icon("left");
  else if (mv === "right") inner = icon("right");
  else if (FILL[mv]) inner = icon("fill", `fc ${FILL[mv][1]}`);
  else if (typeof mv === "number") inner = `ƒ${mv + 1}`;
  tag = tag || "span";
  return `<${tag} class="slot${color ? " " + color : ""}${cls ? " " + cls : ""}"${attrs || ""}>${inner}</${tag}>`;
}

function renderProgram() {
  $("funcs").innerHTML = S.program
    .map(
      (fn, f) =>
        `<div class="frow"><span class="fl">ƒ${f + 1}</span>` +
        fn
          .map((s, i) =>
            tile(
              s.movement,
              s.color,
              "",
              "button",
              ` data-f="${f}" data-i="${i}" aria-label="Function ${f + 1} slot ${i + 1}"`,
            ),
          )
          .join("") +
        "</div>",
    )
    .join("");
  S.slotEls = S.program.map(() => []);
  $("funcs")
    .querySelectorAll(".slot")
    .forEach((el) => {
      S.slotEls[Number(el.dataset.f)][Number(el.dataset.i)] = el;
    });
  S.curEl = null;
  markCur();
}

function markCur() {
  if (S.curEl) S.curEl.classList.remove("cur");
  S.curEl = null;
  const el = S.cur && S.slotEls[S.cur.f]?.[S.cur.i];
  if (el) {
    el.classList.add("cur");
    S.curEl = el;
  }
}

function renderPalette() {
  const sel = (k) => (S.selected === k ? " sel" : "");
  const cmd = (k, inner, label) =>
    `<button class="cmd${sel(k)}" data-k="${k}" aria-label="${label}" title="${label}">${inner}</button>`;
  const has = !!S.data;
  $("dirs").innerHTML = has
    ? cmd("forward", icon("up"), "Forward") +
      cmd("left", icon("left"), "Turn left") +
      cmd("right", icon("right"), "Turn right") +
      cmd("clear", icon("x"), "Delete")
    : "";
  $("calls").innerHTML = has
    ? S.program
        .map((_, i) => cmd(`F${i + 1}`, `F${i + 1}`, `Call function ${i + 1}`))
        .join("")
    : "";
  $("conds").innerHTML = has
    ? ["red", "blue", "green"]
        .map(
          (c) =>
            `<button class="cond ${c}${sel(c)}" data-k="${c}" aria-label="If ${c}" title="If ${c}"></button>`,
        )
        .join("")
    : "";
  $("fillBox").hidden = !(has && S.fill);
  $("fills").innerHTML =
    has && S.fill
      ? Object.keys(FILL)
          .map((k) =>
            cmd(k, icon("fill", `fc ${FILL[k][1]}`), `Fill ${FILL[k][1]}`),
          )
          .join("")
      : "";
}

function renderHist() {
  const box = $("hist");
  const list = S.log.slice(-CFG.histShow);
  let html = "",
    prev = -1;
  list.forEach((e, n) => {
    if (e.f !== prev) {
      html += `<span class="fl sm">ƒ${e.f + 1}</span>`;
      prev = e.f;
    }
    html += tile(
      e.mv,
      e.color,
      `h${e.skip ? " skip" : ""}${n === list.length - 1 ? " cur" : ""}`,
    );
  });
  const r = S.M ? S.M.result : null;
  if (r === 0) {
    const next = S.ids[S.ids.indexOf(S.level) + 1];
    html += `<span class="res ok">Level solved · ${S.M.steps} steps</span><button class="next" id="nextBtn">${next !== undefined ? "Next level" : "Levels"}</button>`;
  } else if (r === 1) html += '<span class="res bad">Function over</span>';
  else if (r === 3) html += '<span class="res bad">Too many calls</span>';
  else if (r === 2) html += '<span class="res bad">Out of the map</span>';
  box.innerHTML = html || '<span class="hint">Press play or step</span>';
}

function renderCtl() {
  const has = !!S.data;
  const state = S.running ? "pause" : "play";
  const p = $("bPlay");
  if (p.dataset.state !== state) {
    p.dataset.state = state;
    p.innerHTML = icon(state);
    p.setAttribute("aria-label", S.running ? "Pause" : "Play");
  }
  p.disabled = !has;
  $("bStop").disabled = !has || (!S.running && !S.hist.length);
  $("bBack").disabled = !has || !S.hist.length;
  $("bFwd").disabled = !has || (S.M !== null && S.M.result !== null);
  $("spd").textContent = `x${SPEEDS[S.speedIdx]}`;
}

function renderStep() {
  updateMap();
  markCur();
  renderHist();
  renderCtl();
}

function applyToSlot(f, i) {
  const s = S.program[f][i],
    k = S.selected;
  if (!k) return;
  if (["red", "blue", "green"].includes(k)) s.color = s.color === k ? null : k;
  else if (k === "clear") {
    s.movement = null;
    s.color = null;
  } else if (["forward", "left", "right"].includes(k) || FILL[k])
    s.movement = k;
  else if (k[0] === "F") s.movement = Number(k.slice(1)) - 1;
  saveProgram();
  resetMachine();
  renderProgram();
}

function clearSlot(f, i) {
  S.program[f][i].movement = null;
  S.program[f][i].color = null;
  saveProgram();
  resetMachine();
  renderProgram();
}

$("hist").addEventListener("click", (e) => {
  if (!e.target.closest(".next")) return;
  const next = S.ids[S.ids.indexOf(S.level) + 1];
  if (next !== undefined) loadLevel(next);
  else goLevels();
});

$("grid").addEventListener("click", (e) => {
  const b = e.target.closest(".lt");
  if (b) loadLevel(Number(b.dataset.n));
});

$("funcs").addEventListener("click", (e) => {
  const b = e.target.closest(".slot");
  if (b) applyToSlot(Number(b.dataset.f), Number(b.dataset.i));
});

$("funcs").addEventListener("contextmenu", (e) => {
  const b = e.target.closest(".slot");
  if (!b) return;
  e.preventDefault();
  clearSlot(Number(b.dataset.f), Number(b.dataset.i));
});

function pickTool(e) {
  const b = e.target.closest("[data-k]");
  if (!b) return;
  S.selected = S.selected === b.dataset.k ? null : b.dataset.k;
  renderPalette();
}

$("dirs").addEventListener("click", pickTool);
$("calls").addEventListener("click", pickTool);
$("conds").addEventListener("click", pickTool);
$("fills").addEventListener("click", pickTool);
$("bPlay").addEventListener("click", play);
$("bStop").addEventListener("click", stop);
$("bFwd").addEventListener("click", stepForward);
$("bBack").addEventListener("click", stepBack);
$("bSpeed").addEventListener("click", () => {
  S.speedIdx = (S.speedIdx + 1) % SPEEDS.length;
  store.set("speed", S.speedIdx);
  renderCtl();
});

$("back").addEventListener("click", (e) => {
  if ($("game").hidden) return;
  e.preventDefault();
  goLevels();
});

document.addEventListener("keydown", (e) => {
  if ($("game").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  if (e.key === " ") {
    if (t !== document.body) return;
    e.preventDefault();
    play();
  } else if (e.key === "ArrowRight") stepForward();
  else if (e.key === "ArrowLeft") stepBack();
  else if (e.key === "Escape") stop();
});

window.addEventListener("resize", () => {
  fitUI();
  fitLevels();
});
showScreen("levels");
loading(true);
discoverLevels()
  .catch((e) => {
    fail(e);
    return [];
  })
  .then(async (ids) => {
    S.ids = ids;
    renderLevels();
    const last = store.get("level", null);
    if (store.get("open", false) && last !== null && ids.includes(last))
      await loadLevel(last);
  })
  .finally(() => loading(false));
