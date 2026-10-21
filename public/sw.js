// Spor Hocam servis çalışanı: arayüzü önbelleğe alır (çevrimdışı açılır), API isteklerine dokunmaz.
const CACHE = 'sh-shell-v36';
const SHELL = ['/', '/app.js', '/barcode-util.js', '/drinks-util.js', '/athlete-util.js', '/changelog-data.js', '/style.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('/', cp)); return r; })
        .catch(() => caches.match('/')));
    return;
  }
  // önce ağ (düzeltmeler hemen gelsin), çevrimdışıysa önbellek
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req)));
});

// Bildirim sunucusu (Web Push): sunucudan gelen hatırlatmayı göster, dokununca uygulamayı aç
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // dinlenme bildirimi: uygulama ekranda açıksa zaten sesle/titreşimle uyarıyor; ikinci bir bildirim gösterme
    if (d.tag === 'sh-rest') {
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (cs.some(c => c.visibilityState === 'visible')) return;
    }
    const rest = d.tag === 'sh-rest';
    await self.registration.showNotification(d.title || 'Spor Hocam', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || 'sh', renotify: rest, data: { url: '/' },
      requireInteraction: !!d.alarm, // alarm modu: dokunulana ya da kapatılana kadar ekranda kalır
      vibrate: rest ? (d.alarm ? [600, 200, 600, 200, 600, 200, 600, 200, 600] : [250, 120, 250, 120, 400]) : undefined,
      actions: rest ? [{ action: 'stop', title: '⏹ Durdur' }] : undefined });
  })());
});
// dinlenme alarmını sustur: sunucudaki tekrar zincirini iptal eder
async function cancelRest() {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) await fetch('/api/push/rest', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }, body: JSON.stringify({ endpoint: sub.endpoint, seconds: 0 }) });
  } catch (x) { /* ağ yok: tekrarlar kendiliğinden biter */ }
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const rest = e.notification.tag === 'sh-rest';
  e.waitUntil((async () => {
    if (rest) await cancelRest();
    if (rest && e.action === 'stop') return; // "Durdur" düğmesi: yalnızca sustur, uygulamayı açma
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  })());
});
self.addEventListener('notificationclose', e => { if (e.notification.tag === 'sh-rest') e.waitUntil(cancelRest()); }); // bildirimi kaydırıp kapatmak da alarmı susturur
