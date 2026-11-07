const CFG = {
    maxLevel: 20,
    size: (L) => L + 1,
    flashMs: 1000,
    gapMs: 0,
    recallMs: (L) => (L + 1) * 1000,
    targets: (L) => L + 1,
    misses: (L) => Math.round((L - 1) / 2 + 1),
    betweenMs: 900,
};
const rng = Math.random;
const $ = (id) => document.getElementById(id);
const board = $("board"),
    status = $("status");
const S = {
    phase: "ready",
    level: 1,
    targets: new Set(),
    found: 0,
    wrong: 0,
    allowed: 1,
    tiles: [],
    timers: [],
    done: new Set(),
};

const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));
const stop = () => {
    S.timers.forEach(clearTimeout);
    S.timers = [];
    clearInterval(S.tick);
};
const say = (msg, bad) => {
    status.textContent = msg;
    status.classList.toggle("bad", !!bad);
};

function render() {
    $("sLvl").textContent = S.level;
    $("sFound").textContent = S.found;
    $("sTotal").textContent =
        S.targets.size || CFG.targets(S.level);
    $("sMiss").textContent = S.wrong;
    $("sAllowed").textContent = S.allowed;
    $("lock").hidden = S.phase !== "ready";
    $("restart").classList.toggle("alert", S.phase === "over");
    $("restart").disabled = S.phase === "ready";
}

function buildBoard(n) {
    board.style.gridTemplateColumns = "repeat(" + n + ",1fr)";
    board.style.gridTemplateRows = "repeat(" + n + ",1fr)";
    const t = Math.min(
        1,
        Math.max(0, Math.log(n / 2) / Math.log(4)),
    );
    board.style.setProperty(
        "--gap",
        (12 - 10 * t).toFixed(2) + "px",
    );
    board.style.setProperty(
        "--r",
        (14 * (1 - t)).toFixed(2) + "px",
    );
    board.style.setProperty(
        "--lift",
        (3 * (1 - t)).toFixed(2) + "px",
    );
    board.replaceChildren();
    S.tiles = [];
    for (let i = 0; i < n * n; i++) {
        const b = document.createElement("button");
        b.className = "tile";
        b.setAttribute("aria-label", "Tile " + (i + 1));
        b.addEventListener("click", () => pick(i));
        board.appendChild(b);
        S.tiles.push(b);
    }
}

function chooseTargets(total, k) {
    const a = [...Array(total).keys()];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return new Set(a.slice(0, k));
}

function startLevel() {
    stop();
    const L = S.level,
        n = CFG.size(L);
    buildBoard(n);
    S.targets = chooseTargets(n * n, CFG.targets(L));
    S.found = 0;
    S.wrong = 0;
    S.done = new Set();
    S.allowed = CFG.misses(L);
    S.phase = "show";
    say("Remember the tiles");
    render();
    $("sTime").textContent = Math.ceil(
        (CFG.recallMs(L) * Number($("selTime").value)) / 1000,
    );
    ["statTime", "statMiss"].forEach((id) =>
        $(id).classList.remove("bad"),
    );
    let t = 600;
    for (const i of S.targets) {
        later(() => S.tiles[i].classList.add("on"), t);
        later(
            () => S.tiles[i].classList.remove("on"),
            t + CFG.flashMs,
        );
        t += CFG.flashMs + CFG.gapMs;
    }
    later(beginRecall, t);
}

function beginRecall() {
    S.phase = "pick";
    const ms = CFG.recallMs(S.level) * Number($("selTime").value);
    S.deadline = performance.now() + ms;
    say("Click the tiles that lit up. ORDER DOESN'T MATTER");
    S.tick = setInterval(updateTime, 100);
    later(() => {
        if (S.phase === "pick") failLevel("Time is up");
    }, ms);
}

function updateTime() {
    $("sTime").textContent = Math.max(
        0,
        Math.ceil((S.deadline - performance.now()) / 1000),
    );
}

function pick(i) {
    const t = S.tiles[i];
    if (S.phase !== "pick" || S.done.has(i)) return;
    S.done.add(i);
    if (S.targets.has(i)) {
        t.classList.add("on");
        S.found++;
        render();
        if (S.found === S.targets.size) passLevel();
    } else {
        t.classList.add("miss");
        S.wrong++;
        render();
        if (S.wrong >= S.allowed) failLevel();
    }
}

function passLevel() {
    clearInterval(S.tick);
    if (S.level === CFG.maxLevel) {
        S.phase = "won";
        say("You cleared all " + CFG.maxLevel + " levels.");
        return;
    }
    S.phase = "between";
    say("Level " + S.level + " cleared.");
    later(() => {
        S.level++;
        startLevel();
    }, CFG.betweenMs);
}

function failLevel(why) {
    clearInterval(S.tick);
    $(why ? "statTime" : "statMiss").classList.add("bad");
    S.phase = "over";
    S.targets.forEach((i) => {
        if (!S.done.has(i)) S.tiles[i].classList.add("reveal");
    });
    say(
        (why ? why + " " : "") +
            "GAME OVER on level " +
            S.level +
            ". Outlined tiles were the ones you missed",
        true,
    );
    render();
}

const newGame = () => {
    S.level = Number($("selLevel").value);
    startLevel();
};
$("start").addEventListener("click", newGame);
$("restart").addEventListener("click", newGame);
$("sMax").textContent = CFG.maxLevel;
for (let l = 1; l <= CFG.maxLevel; l++)
    $("selLevel").add(new Option(l, l));
buildBoard(CFG.size(1));
render();