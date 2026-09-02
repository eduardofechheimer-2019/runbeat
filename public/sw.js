// Service worker mínimo: cacheia o app shell pra funcionar offline depois do
// primeiro load. Sem cache de chamadas de API (Spotify/ReccoBeats precisam
// sempre de dado fresco).
const CACHE_NAME = "runbeat-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css",
  "./src/app.js",
  "./src/config.js",
  "./src/spotifyAuth.js",
  "./src/spotifyApi.js",
  "./src/bpmSource.js",
  "./src/cadence.js",
  "./src/matcher.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // deixa chamadas de API passarem direto
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
