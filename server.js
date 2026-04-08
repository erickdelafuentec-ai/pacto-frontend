const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'storage.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DEFAULT_STORE = {
  agendaData: [],
  tsData: [],
  waitlistData: [],
  licenciasData: [],
  permisosHistorial: [],
  usuariosSistema: [],
  actas_historial: [],
  devolucionHistorial: []
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
    return;
  }
  try {
    const current = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    const merged = { ...DEFAULT_STORE, ...(current || {}) };
    fs.writeFileSync(STORE_FILE, JSON.stringify(merged, null, 2), 'utf8');
  } catch (error) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { ...DEFAULT_STORE, ...(data || {}) };
  } catch (error) {
    return { ...DEFAULT_STORE };
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

ensureStore();

// Headers necesarios para que Chrome permita micrófono y SpeechRecognition
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=*, camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/storage', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readStore());
});

app.post('/api/storage/:key', (req, res) => {
  const key = req.params.key;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_STORE, key)) {
    return res.status(400).json({ ok: false, error: 'Clave no permitida' });
  }

  const store = readStore();
  store[key] = typeof req.body.value === 'undefined' ? [] : req.body.value;
  writeStore(store);
  res.json({ ok: true, key, items: Array.isArray(store[key]) ? store[key].length : null });
});

app.post('/api/storage', (req, res) => {
  const incoming = req.body || {};
  const store = readStore();

  Object.keys(DEFAULT_STORE).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      store[key] = incoming[key];
    }
  });

  writeStore(store);
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sistema PACTO listo en puerto ${PORT}`);
});
