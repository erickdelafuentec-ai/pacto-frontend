const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Diagnóstico al arrancar ────────────────────────────────────────────────────
console.log('=== DIAGNÓSTICO DE ARRANQUE ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL existe:', !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL preview:', process.env.DATABASE_URL.substring(0, 30) + '...');
}
console.log('===============================');

// ── Claves permitidas ──────────────────────────────────────────────────────────
const ALLOWED_KEYS = [
  'agendaData',
  'tsData',
  'waitlistData',
  'licenciasData',
  'permisosHistorial',
  'usuariosSistema',
  'actas_historial',
  'devolucionHistorial',
  'lentesData',
];

const DEFAULT_STORE = {};
ALLOWED_KEYS.forEach(k => DEFAULT_STORE[k] = []);

// ── Pool de PostgreSQL (solo si DATABASE_URL existe) ──────────────────────────
let pool = null;

if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    console.log('Pool de PostgreSQL creado');
  } catch (e) {
    console.error('Error creando pool pg:', e);
  }
} else {
  console.warn('DATABASE_URL no definida — usando almacenamiento en memoria');
}

// ── Fallback en memoria si no hay DB ──────────────────────────────────────────
let memoryStore = { ...DEFAULT_STORE };

// ── Inicializar tabla ──────────────────────────────────────────────────────────
async function initDB() {
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage (
        key   TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '[]'
      )
    `);

    for (const key of ALLOWED_KEYS) {
      await pool.query(
        `INSERT INTO storage (key, value) VALUES ($1, '[]') ON CONFLICT (key) DO NOTHING`,
        [key]
      );
    }

    console.log('Base de datos inicializada correctamente');
  } catch (e) {
    console.error('Error en initDB mensaje:', e.message);
    console.error('Error en initDB stack:', e.stack);
    throw e;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function readStore() {
  if (!pool) return { ...memoryStore };
  const { rows } = await pool.query('SELECT key, value FROM storage');
  const store = { ...DEFAULT_STORE };
  for (const row of rows) store[row.key] = row.value;
  return store;
}

async function writeKey(key, value) {
  if (!pool) { memoryStore[key] = value; return; }
  await pool.query(
    `INSERT INTO storage (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=*, camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// ── Endpoints ──────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const status = {
    ok: true,
    time: new Date().toISOString(),
    db: pool ? 'postgres' : 'memory',
    DATABASE_URL_set: !!process.env.DATABASE_URL,
  };
  if (pool) {
    try {
      await pool.query('SELECT 1');
      status.db_connected = true;
    } catch (e) {
      status.db_connected = false;
      status.db_error = e.message;
    }
  }
  res.json(status);
});

app.get('/api/storage', async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await readStore());
  } catch (e) {
    console.error('GET /api/storage error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/storage/:key', async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(400).json({ ok: false, error: 'Clave no permitida' });
  }
  try {
    const value = typeof req.body.value === 'undefined' ? [] : req.body.value;
    await writeKey(key, value);
    res.json({ ok: true, key, items: Array.isArray(value) ? value.length : null });
  } catch (e) {
    console.error(`POST /api/storage/${key} error:`, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/storage', async (req, res) => {
  const incoming = req.body || {};
  try {
    const updates = Object.keys(incoming).filter(k => ALLOWED_KEYS.includes(k));
    await Promise.all(updates.map(k => writeKey(k, incoming[k])));
    res.json({ ok: true, updated: updates });
  } catch (e) {
    console.error('POST /api/storage error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Arrancar ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
  } catch (e) {
    console.error('DB no disponible, arrancando en modo memoria:', e.message);
    pool = null;
  }

  app.listen(PORT, () => {
    console.log('Sistema PACTO listo en puerto ' + PORT);
    console.log('Modo: ' + (pool ? 'PostgreSQL' : 'memoria (sin persistencia)'));
  });
}

start();
