const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Conexión a PostgreSQL (Railway inyecta DATABASE_URL automáticamente) ──────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

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

// ── Crear tabla si no existe ───────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS storage (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '[]'
    )
  `);

  // Insertar claves faltantes con valor vacío
  for (const key of ALLOWED_KEYS) {
    await pool.query(
      `INSERT INTO storage (key, value) VALUES ($1, '[]') ON CONFLICT (key) DO NOTHING`,
      [key]
    );
  }

  console.log('✅ Base de datos lista');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function readStore() {
  const { rows } = await pool.query('SELECT key, value FROM storage');
  const store = {};
  for (const row of rows) store[row.key] = row.value;
  return store;
}

async function writeKey(key, value) {
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
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'postgres', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/storage → devuelve todo el store
app.get('/api/storage', async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const store = await readStore();
    res.json(store);
  } catch (e) {
    console.error('GET /api/storage error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/storage/:key → actualiza una clave específica
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

// POST /api/storage → actualiza múltiples claves a la vez
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

// Fallback → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Arrancar ───────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Sistema PACTO listo en puerto ${PORT}`));
  })
  .catch(err => {
    console.error('❌ Error iniciando DB:', err.message);
    process.exit(1);
  });
