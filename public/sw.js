// Service worker of the installed Velonify Hub app.
// Pages always come from the network first, so a deploy is visible on the next start; the cached
// page only steps in when the Mac is offline. Built files under assets/ carry a hash in their name
// and never change, so they are served from the cache. API calls and Google go untouched.

const SEITE = 'hub-seite-v1';
const DATEIEN = 'hub-dateien-v1';
// Each deploy adds a handful of files; older ones fall out once the cache holds more than this.
const MAX_DATEIEN = 80;

const basis = new URL('./', self.registration.scope);
const startseite = basis.href;
const dateienPfad = new URL('assets/', basis).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SEITE)
      .then((cache) => cache.add(startseite))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== SEITE && n !== DATEIEN).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(seiteLaden(request));
  } else if (url.pathname.startsWith(dateienPfad)) {
    event.respondWith(dateiLaden(request));
  }
});

async function seiteLaden(request) {
  try {
    const antwort = await fetch(request);
    if (antwort.ok) {
      const kopie = antwort.clone();
      caches.open(SEITE).then((cache) => cache.put(startseite, kopie));
    }
    return antwort;
  } catch {
    const gespeichert = await caches.match(startseite);
    return gespeichert ?? new Response('Velonify Hub ist offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function dateiLaden(request) {
  const cache = await caches.open(DATEIEN);
  const gespeichert = await cache.match(request);
  if (gespeichert) return gespeichert;
  const antwort = await fetch(request);
  if (antwort.ok) {
    await cache.put(request, antwort.clone());
    const schluessel = await cache.keys();
    await Promise.all(schluessel.slice(0, Math.max(0, schluessel.length - MAX_DATEIEN)).map((k) => cache.delete(k)));
  }
  return antwort;
}
