/**
 * Service Worker - Sistema PACTO
 * Estrategia: Network-first (siempre intentar red, fallback a cache)
 * Esto es importante porque la app usa BD en Railway y no queremos servir datos viejos
 */

const CACHE_NAME = 'pacto-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

// Instalación: cachear archivos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll failed for some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first para todo, especialmente para /api/storage (datos en vivo)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca cachear las llamadas a la API (datos siempre frescos desde Railway)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Solo manejar GET requests
  if (req.method !== 'GET') {
    return;
  }

  // Network-first para todo lo demás (HTML, JS, imágenes)
  event.respondWith(
    fetch(req)
      .then((response) => {
        // Clonar la respuesta para guardarla en cache
        const clone = response.clone();
        if (response.status === 200 && url.origin === location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // Sin red: servir desde cache
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          // Si la solicitud es de navegación, devolver index.html
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
