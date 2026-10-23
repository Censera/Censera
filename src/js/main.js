// Hmm... mayn
const ce = document.getElementById("ce");

if (ce) {
  ce.onclick = () => {
    ce.textContent =
      ce.textContent === "Censera" ? "Ashraf Lafdil" : "Censera";
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

recordVisit().catch(error => {
  console.warn("From visitor: unable to record visit:", error);
});

console.warn("What are you doing here ;/");
console.warn("Do not disturb me!");
