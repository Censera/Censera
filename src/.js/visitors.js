"use strict";

const u = document.getElementById("u");
const t = document.getElementById("t");

if (u && t) {
  fetch("/api/visitors", { cache: "no-store" })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })
    .then(stats => {
      u.textContent =
        Number(stats.uniques).toLocaleString();

      t.textContent =
        Number(stats.total).toLocaleString();
    })
    .catch(error => {
      console.warn("Visitor:", error);
      u.textContent = "..";
      t.textContent = "..";
    });
}
