/**
 * Service Worker - mendukung "Mode Offline":
 * - Meng-cache shell aplikasi (HTML/JS/CSS/ikon) supaya app tetap terbuka tanpa internet.
 * - Request API (POST/PUT) yang gagal karena offline TIDAK ditangani di sini,
 *   melainkan diantrekan di IndexedDB oleh app.js (lihat fungsi queueOfflineRequest),
 *   lalu disinkronkan otomatis saat koneksi kembali (event 'online').
 */
const CACHE_NAME = 'umkm-langkapura-v1';
const APP_SHELL = [
  '/', '/index.html', '/app.js', '/style.css', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Jangan cache API - biarkan app.js yang mengatur strategi offline-queue untuk data.
  if (url.pathname.startsWith('/api/')) {
    return; // biarkan lewat ke network normal / gagal ditangani oleh app.js
  }

  // App shell: cache-first, fallback ke network, lalu fallback ke index.html untuk SPA routing.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => caches.match('/index.html'));
    })
  );
});
