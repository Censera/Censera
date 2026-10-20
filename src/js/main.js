// Hmm... mayn

console.warn("What are you doing here ;/");

const name = document.getElementById("name");

if (name) {
  name.onclick = () => {
    name.textContent =
      name.textContent === "Censera" ? "Ashraf Lafdil" : "Censera";
  };
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

// Keep analytics traffic out of the initial page-load path.
window.visitRecorded = new Promise((resolve, reject) => {
  const start = () => recordVisit().then(resolve, reject);

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
});

window.visitRecorded.catch(error => {
  console.warn("visitor: unavailable stats:", error);
});
