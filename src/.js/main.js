// Hmm... mayn
const fade = () => {
  const atEnd =
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 8;
  document.body.classList.toggle("at-end", atEnd);
};

addEventListener("scroll", fade, { passive: true });
addEventListener("resize", fade);
addEventListener("load", fade);

const me = "Censera";
const al = "Ashraf";
const ce = document.getElementById("ce");
if (ce) {
  ce.onclick = () => {
    ce.textContent = ce.textContent === me ? al : me;
  };
}

let di = document.getElementById("di");
if (di) {
  const id = "1266574427274084413";
  di.href = `https://discord.com/users/${id}`;
}

let gi = document.getElementById("gi");
if (gi) {
  gi.href = `https://github.com/${me}`;
}

let em = document.getElementById("em");
if (em) {
  const dm = "proton.me";
  em.href = `mailto:${me}@${dm}`;
}

function record() {
  return fetch("/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify({
      path: window.location.pathname,
    }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
}

record().catch((error) => {
  console.warn("record:", error);
});

console.error("What are you doing here? >:[");
console.warn("DO NOT DISTURB ME!");
