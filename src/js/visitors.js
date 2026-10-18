// Visitor Count
"use strict";

const people = document.getElementById("people__visit");
const visits = document.getElementById("count__visit");

if (people && visits) {
  const unavailable = () => {
    people.textContent = "-0";
    visits.textContent = "-0";
  };

  if (!window.visitorStats) {
    unavailable();
  } else {
    window.visitorStats
      .then(stats => {
        people.textContent =
          Number(stats.unique_visitors).toLocaleString();

        visits.textContent =
          Number(stats.total_visits).toLocaleString();
      })
      .catch(unavailable);
  }
}
