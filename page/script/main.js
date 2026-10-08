const name = document.getElementById("name");

name.onclick = () => {
  name.textContent =
    name.textContent === "@Censera" ? "Ashraf Lafdil" : "@Censera";
};
