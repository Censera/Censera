// Home

const name = document.getElementById("name");

if (name) {
  name.onclick = () => {
    name.textContent =
      name.textContent === "@Censera" ? "Ashraf Lafdil" : "@Censera";
  };
}

// Minecraft

const host = "minecraft.censera.space"
const port = "40404"

const server = document.getElementById("server")
server.textContent = `${host}:${port}`
