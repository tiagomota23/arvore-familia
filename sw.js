// Só a "casca" da app fica em cache (para abrir depressa e offline). Os dados da árvore NUNCA passam por aqui:
// vêm do Supabase (com sessão) e ficam em IndexedDB, apagado ao sair. Imagens assinadas também não são guardadas.
const CACHE = 'arvore-v35';
const SHELL = ['./', 'index.html', 'styles.css?v=20', 'app.css?v=11', 'arvore.js?v=32', 'app.js?v=10', 'config.js?v=9', 'manifest.json', 'icons/icon-192.png?v=2', 'icons/icon-180.png?v=2'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // rede primeiro (o GitHub Pages guarda 10 min); sem rede, a cópia guardada
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })
    .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./') : Response.error())));
});
