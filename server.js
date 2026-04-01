const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

const DATA_DIR = path.join(__dirname, "data");
const STORAGE_FILE = path.join(DATA_DIR, "storage.json");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(STORAGE_FILE)) {
  fs.writeFileSync(
    STORAGE_FILE,
    JSON.stringify({
      agendaData: [],
      tsData: [],
      waitlistData: [],
      licenciasData: [],
      devolucionData: { historial: [] },
      permisosHistorial: []
    }, null, 2),
    "utf8"
  );
}

function readStorage() {
  return JSON.parse(fs.readFileSync(STORAGE_FILE, "utf8"));
}

function writeStorage(data) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
}

app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/api/data", (req, res) => {
  try {
    const data = readStorage();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error al leer datos" });
  }
});

app.post("/api/data", (req, res) => {
  try {
    writeStorage(req.body);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Error al guardar datos" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
