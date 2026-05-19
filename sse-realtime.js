// ═══════════════════════════════════════════════════════════════
// SSE REAL-TIME — Para agregar al backend de Railway (Node.js/Express)
// ═══════════════════════════════════════════════════════════════
//
// CÓMO INTEGRAR:
//
// 1. Crea este archivo en tu repo (al lado de tu server.js / index.js / app.js)
//    con el nombre: sse-realtime.js
//
// 2. En tu archivo principal del backend (ej: server.js), agrega:
//
//    const { setupRealtime, broadcastChange } = require('./sse-realtime');
//    setupRealtime(app);   // app es tu instancia de Express
//
// 3. Donde tengas el endpoint POST /api/storage/:key, agrega UNA línea
//    DESPUÉS de guardar en la base de datos:
//
//    app.post('/api/storage/:key', async (req, res) => {
//      const { key } = req.params;
//      const { value } = req.body;
//      await db.save(key, value);   // tu código actual (lo que sea)
//
//      // ── AGREGAR ESTA LÍNEA ──
//      broadcastChange(key, value);
//
//      res.json({ ok: true });
//    });
//
// 4. Haz commit y push a GitHub. Railway redeployará automáticamente.
//
// ═══════════════════════════════════════════════════════════════

// Lista de clientes conectados al stream
const clients = new Set();

/**
 * Registra el endpoint /api/stream y prepara el broadcasting.
 * @param {Express.Application} app - Tu instancia de Express
 */
function setupRealtime(app) {
  // ── Endpoint SSE ──────────────────────────────────────────
  app.get('/api/stream', (req, res) => {
    // Headers obligatorios de Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',   // evita buffering de proxies (nginx)
      'Access-Control-Allow-Origin': '*'
    });

    // Mensaje inicial para confirmar la conexión
    res.write('event: connected\n');
    res.write('data: {"ok":true,"ts":' + Date.now() + '}\n\n');

    // Identificador único para este cliente
    const clientId = Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const client = { id: clientId, res: res };
    clients.add(client);

    console.log('[SSE] Cliente conectado:', clientId, '(total:', clients.size + ')');

    // Heartbeat cada 25 segundos para evitar que el proxy cierre la conexión
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 25000);

    // Cuando el cliente se desconecta
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(client);
      console.log('[SSE] Cliente desconectado:', clientId, '(total:', clients.size + ')');
    });
  });

  console.log('[SSE] Endpoint /api/stream configurado');
}

/**
 * Notifica a todos los clientes conectados que una key cambió.
 * Llama esta función después de guardar en la base de datos.
 *
 * @param {string} key - Clave que cambió (ej: 'saaCitas', 'saaEspera')
 * @param {*} value - Nuevo valor (opcional, si no se manda los clientes recargarán)
 * @param {string} senderId - ID opcional del cliente que originó el cambio
 */
function broadcastChange(key, value, senderId) {
  if (clients.size === 0) return;

  const payload = JSON.stringify({
    key: key,
    value: value,
    ts: Date.now(),
    sender: senderId || null
  });

  const message = 'event: change\ndata: ' + payload + '\n\n';

  // Enviar a todos los clientes conectados
  const dead = [];
  clients.forEach(client => {
    try {
      client.res.write(message);
    } catch (e) {
      dead.push(client);
    }
  });

  // Limpiar conexiones rotas
  dead.forEach(c => clients.delete(c));

  if (dead.length > 0) {
    console.log('[SSE] Limpiadas', dead.length, 'conexiones rotas');
  }
}

/**
 * Devuelve el número de clientes conectados actualmente (útil para debugging)
 */
function getConnectedClients() {
  return clients.size;
}

module.exports = { setupRealtime, broadcastChange, getConnectedClients };
