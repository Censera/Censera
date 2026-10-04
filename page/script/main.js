const name = document.getElementById("name");

name.onclick = () => {
  name.textContent =
    name.textContent === "Achraf Lafdil" ? "@Censera" : "Achraf Lafdil";
};
