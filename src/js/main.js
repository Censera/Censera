// Hmm... mayn

console.warn("What are you doing here ;/");

const name = document.getElementById("name");

if (name) {
  name.onclick = () => {
    name.textContent =
      name.textContent === "Censera" ? "Ashraf Lafdil" : "Censera";
  };
}


// Record loading this page
window.visitorStats = fetch("/api/visit", {
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

  return response.json();
});

window.visitorStats.catch(error => {
  console.warn("visitor: unavailable stats:", error);
});
