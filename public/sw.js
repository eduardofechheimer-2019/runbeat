// Service worker mínimo: cacheia o app shell só como fallback pra funcionar
// offline — a estratégia é "network-first", sempre tentando a versão mais
// nova da rede primeiro, e só caindo pro cache se a rede falhar. Um app em
// desenvolvimento ativo muda de código com frequência; cache-first faria o
// usuário ficar preso numa versão antiga mesmo depois de um deploy novo.
const CACHE_NAME = "runbeat-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
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
    fetch(event.request)
      .then((fresh) => {
        const copy = fresh.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return fresh;
      })
      .catch(() => caches.match(event.request))
  );
});
