// Hmm... mayn
const me = "Censera";
const al = "Ashraf Lafdil";
const ce = document.getElementById("ce");
if (ce) {
  ce.onclick = () => {
    ce.textContent =
      ce.textContent === me?al:me;
  };
}

let di = document.getElementById("di");
if (di) {
  const id = "1266574427274084413";
  di.href = `https://discord.com/users/${id}`
}

let gi = document.getElementById("gi");
if (gi) {
  gi.href = `https://github.com/${me}`
}

let em = document.getElementById("em");
if (em) {
  const dm = "proton.me";
  em.href = `mailto:${me}@${dm}`
}

function recordVisit() {
  return fetch("/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
    body: JSON.stringify({
      path: window.location.pathname
    })
  }).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
}

recordVisit().catch(error => {
  console.warn("Vistor:", error);
});

console.warn("DO NOT DISTURB ME!");
console.error("What are you doing here? >:[");
