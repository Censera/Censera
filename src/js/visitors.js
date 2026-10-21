// Visitor Count
"use strict";

window.visitRecorded = new Promise((resolve, reject) => {
  const start = () => {
    try {
      recordVisit().then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  };

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
});

window.visitRecorded.catch(error => {
  console.warn("From visitor: unavailable stats:", error);
});

const people = document.getElementById("people__visit");
const visits = document.getElementById("count__visit");

if (people && visits) {
  const unavailable = () => {
    people.textContent = "..";
    visits.textContent = "..";
  };

 
    window.visitRecorded
      .then(() => fetch("/api/visitors", { cache: "no-store" }))
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
      .catch(unavailable);
}
