// Service worker MboaLearn : application installable + interface disponible hors connexion.
// Stratégie « réseau d'abord » : on sert toujours la dernière version quand le réseau est là,
// et la copie en cache lorsque la connexion (3G/4G) est coupée. L'API n'est jamais mise en cache.
const VERSION = 'mboalearn-v3';
const SHELL = [
  '/',
  '/css/app.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/js/app.js',
  '/js/components.js',
  '/js/core.js',
  '/js/pages/admin.js',
  '/js/pages/auth.js',
  '/js/pages/classroom.js',
  '/js/pages/dashboard.js',
  '/js/pages/groups.js',
  '/js/pages/home.js',
  '/js/pages/homework.js',
  '/js/pages/legal.js',
  '/js/pages/lessons.js',
  '/js/pages/messages.js',
  '/js/pages/password.js',
  '/js/pages/progress.js',
  '/js/pages/search.js',
  '/js/pages/settings.js',
  '/js/pages/tutor.js',
  '/js/pages/vocab.js',
  '/js/pages/wallet.js',
  '/js/payflow.js',
  '/js/whiteboard.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((hit) => hit || caches.match('/'))),
  );
});
