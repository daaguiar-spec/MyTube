// MyTube: sempre busca a versão mais nova do app; usa a cópia salva só se estiver sem internet.
const C = 'mytube-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(r => { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request))
  );
});
