
"use strict";

const people = document.getElementById("u");
const visits = document.getElementById("t");

if (people && visits) {
  fetch("/api/visitors", { cache: "no-store" })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })
    .then(stats => {
      people.textContent =
        Number(stats.unique_visitors).toLocaleString();

      visits.textContent =
        Number(stats.total_visits).toLocaleString();
    })
    .catch(error => {
      console.warn("From visitor: unavailable stats:", error);
      people.textContent = "..";
      visits.textContent = "..";
    });
}
