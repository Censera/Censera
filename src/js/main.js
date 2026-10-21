// Hmm... mayn

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

console.warn("What are you doing here ;/");
console.warn("Do not disturb me!")
