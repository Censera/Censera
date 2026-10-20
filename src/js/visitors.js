// Visitor Count
"use strict";

const people = document.getElementById("people__visit");
const visits = document.getElementById("count__visit");

if (people && visits) {
  const unavailable = () => {
    people.textContent = "..";
    visits.textContent = "..";
  };

  if (!window.visitRecorded) {
    unavailable();
  } else {
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
}
