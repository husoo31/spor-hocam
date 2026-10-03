// Sunucu testi: gerçek HTTP ile, sahte Gemini sunucusuna karşı. Çalıştır: node test/server.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


async function waitReady(port, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return; } catch (e) { /* henüz açılmadı */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('sunucu başlamadı');
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
const MOCK = 18081, APP = 18080;
const calls = { a: 0, b: 0 };

const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const m = req.url.match(/models\/([^:]+):generateContent/);
    const model = m && m[1];
    if (req.headers['x-goog-api-key'] !== 'test-key') { res.writeHead(403); return res.end('{}'); }
    if (model === 'model-a') { calls.a++; res.writeHead(429); return res.end('{}'); }
    calls.b++;
    const prompt = JSON.parse(b).contents[0].parts[0].text;
    const text = prompt.includes('BAD') ? 'bu json degil' : prompt.includes('PLAIN') ? 'düz metin cevap' : '```json\n{"items":[{"name":"yumurta","g":50}]}\n```';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
});
await new Promise(r => mock.listen(MOCK, r));

const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'davet-kodu-123', GEMINI_API_KEY: 'test-key',
    GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`, AI_CHAIN: 'gemini:model-a,gemini:model-b', AI_DAILY_LIMIT_PER_USER: '3', MAX_USERS: '3' },
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await waitReady(APP);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const base = `http://127.0.0.1:${APP}`;
async function call(method, p, body, jar, extra = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam', ...extra };
  if (jar && jar.c) headers.Cookie = jar.c;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  if (jar && sc) jar.c = sc.split(';')[0].includes('=;') || /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* gövde yok */ }
  return { s: r.status, j, h: r.headers, sc };
}
const A = { c: '' }, B = { c: '' };

try {
  // statik
  const idx = await fetch(base + '/');
  const html = await idx.text();
  ok(idx.status === 200 && html.includes('/app.js'), 'ana sayfa servis ediliyor');
  ok((idx.headers.get('content-security-policy') || '').includes("script-src 'self'"), 'CSP başlığı var');
  const gz = await fetch(base + '/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  ok(gz.headers.get('content-encoding') === 'gzip', 'app.js gzip ile geliyor');
  const e304 = await fetch(base + '/app.js', { headers: { 'If-None-Match': gz.headers.get('etag') } });
  ok(e304.status === 304, 'ETag ile 304');
  ok((await fetch(base + '/manifest.webmanifest')).headers.get('content-type').includes('manifest'), 'manifest türü doğru');
  ok((await fetch(base + '/baska/sayfa')).status === 200, 'bilinmeyen yol arayüze düşüyor');
  ok((await fetch(base + '/yok.png')).status === 404, 'olmayan dosya 404');

  // me / csrf
  let r = await call('GET', '/api/me', undefined, A);
  ok(r.j.user === null && r.j.config.registration === 'invite' && r.j.config.hasUsers === false, '/me: oturum yok, davet modu, kullanıcı yok');
  ok(!JSON.stringify(r.j).includes('test-key'), 'API anahtarı sızmıyor');
  r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(r.status === 403, 'özel başlık olmadan POST reddedildi (CSRF)');
  r = await call('POST', '/api/login', {}, A, { Origin: 'https://baska-site.com' });
  ok(r.s === 403, 'yabancı Origin reddedildi');

  // kayıt
  r = await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345', invite: 'yanlis', consent: true }, A);
  ok(r.s === 403 && r.j.code === 'bad_invite', 'yanlış davet kodu reddedildi');
  r = await call('POST', '/api/register', { username: 'ab', password: 'sifre12345', invite: 'davet-kodu-123', consent: true }, A);
  ok(r.s === 400, 'kısa kullanıcı adı reddedildi');
  r = await call('POST', '/api/register', { username: 'Ali', password: 'kisa', invite: 'davet-kodu-123', consent: true }, A);
  ok(r.s === 400 && r.j.code === 'weak_password', 'kısa şifre reddedildi');
  r = await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345', invite: 'davet-kodu-123', consent: true }, A);
  const codeA = r.j.recoveryCode;
  ok(r.s === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codeA), 'kayıt başarılı, kurtarma kodu geldi');
  ok(/HttpOnly/.test(r.sc) && /SameSite=Lax/.test(r.sc), 'çerez HttpOnly + SameSite');
  r = await call('POST', '/api/register', { username: 'ali', password: 'sifre12345', invite: 'davet-kodu-123', consent: true }, B);
  ok(r.s === 409, 'aynı kullanıcı adı (büyük/küçük harf duyarsız) reddedildi');
  r = await call('GET', '/api/me', undefined, A);
  ok(r.j.user && r.j.user.username === 'Ali', 'çerezle oturum tanındı');
  ok(!JSON.stringify(r.j).includes('hash'), 'şifre özeti dışarı çıkmıyor');

  // veri
  r = await call('PUT', '/api/docs/core', { data: { profile: { age: 30 } } }, A);
  ok(r.s === 200, 'doküman yazıldı');
  await call('PUT', '/api/docs/m-2026-10', { data: { days: { '2026-10-02': { meals: [{ name: 'x' }] } } } }, A);
  r = await call('GET', '/api/docs', undefined, A);
  ok(r.j.docs.length === 2 && r.j.docs.find(d => d.id === 'core').data.profile.age === 30, 'dokümanlar okundu');
  ok((await call('PUT', '/api/docs/..%2Fx', { data: {} }, A)).s === 400, 'geçersiz doküman adı reddedildi');
  ok((await call('PUT', '/api/docs/core', { data: [1] }, A)).s === 400, 'nesne olmayan veri reddedildi');
  ok((await call('GET', '/api/docs', undefined, {})).s === 401, 'oturumsuz veri erişimi 401');
  await call('PUT', '/api/docs/core', { data: { profile: { age: 31 } } }, A);
  ok((await call('GET', '/api/docs', undefined, A)).j.docs.find(d => d.id === 'core').data.profile.age === 31, 'üzerine yazma çalışıyor');

  // ikinci kullanıcı izolasyonu
  r = await call('POST', '/api/register', { username: 'Ayse', password: 'ayse-sifre-9', invite: 'davet-kodu-123', consent: true }, B);
  ok(r.s === 200, 'ikinci kullanıcı kaydoldu');
  ok((await call('GET', '/api/docs', undefined, B)).j.docs.length === 0, 'ikinci kullanıcı diğerinin verisini görmüyor');

  // yapay zekâ
  r = await call('POST', '/api/ai', { prompt: 'yumurta hesapla', json: true, tier: 'default' }, A);
  ok(r.s === 200 && r.j.json.items[0].name === 'yumurta' && calls.a === 1 && calls.b === 1, 'zincir: ilk model 429 verince ikinciye geçildi, ```json çitleri temizlendi');
  r = await call('POST', '/api/ai', { prompt: 'yumurta hesapla', json: true, tier: 'default' }, B);
  ok(r.s === 200 && r.j.cached === true && calls.b === 1, 'ortak önbellek: başka kullanıcının aynı sorusu API çağırmadan geldi');
  r = await call('POST', '/api/ai', { prompt: 'PLAIN metin', json: false }, A);
  ok(r.j.text === 'düz metin cevap', 'JSON olmayan metin cevabı');
  r = await call('POST', '/api/ai', { prompt: 'BAD json', json: true }, A);
  ok(r.s === 502 && r.j.code === 'invalid_json', 'bozuk JSON → invalid_json');
  r = await call('POST', '/api/ai', { prompt: 'bir tane daha', json: true }, A);
  ok(r.s === 429 && r.j.code === 'quota', 'günlük kota (3) dolunca 429 + Türkçe mesaj: ' + (r.j.error || '').slice(0, 40));
  r = await call('POST', '/api/ai', { prompt: 'yumurta hesapla', json: true }, A);
  ok(r.s === 200 && r.j.cached, 'kota dolsa bile önbellekten cevap gelir');
  r = await call('POST', '/api/ai', { prompt: 'x', json: true, images: [{ mime: 'text/html', data: 'AAAA' }] }, B);
  ok(r.s === 400 && r.j.code === 'image_rejected', 'geçersiz fotoğraf türü reddedildi');
  r = await call('POST', '/api/ai', { prompt: 'resimli', json: true, images: [{ mime: 'image/jpeg', data: 'AAAA' }] }, B);
  ok(r.s === 200, 'fotoğraflı istek kabul edildi');
  ok((await call('POST', '/api/ai', { prompt: 'x' }, {})).s === 401, 'oturumsuz yapay zekâ erişimi 401');

  // giriş / kilitlenme
  const J = { c: '' };
  r = await call('POST', '/api/login', { username: 'ali', password: 'sifre12345' }, J);
  ok(r.s === 200 && r.j.user.username === 'Ali', 'giriş (kullanıcı adı büyük/küçük harf duyarsız)');
  r = await call('POST', '/api/logout', {}, J);
  ok(r.s === 200 && (await call('GET', '/api/me', undefined, J)).j.user === null, 'çıkış oturumu bitiriyor');
  let last;
  for (let i = 0; i < 5; i++) last = await call('POST', '/api/login', { username: 'ali', password: 'yanlis' + i }, J);
  ok(last.s === 401, '5 hatalı deneme yapıldı');
  r = await call('POST', '/api/login', { username: 'ali', password: 'sifre12345' }, J);
  ok(r.s === 429 && r.j.code === 'rate_limited', 'kilitlenme: doğru şifre bile bekletiliyor');

  // hesap işlemleri
  r = await call('POST', '/api/account/password', { current: 'yanlis', new: 'yeni-sifre-77' }, A);
  ok(r.s === 403, 'yanlış mevcut şifreyle şifre değişmedi');
  r = await call('POST', '/api/account/username', { username: 'Ali2', password: 'sifre12345' }, A);
  ok(r.s === 200 && r.j.user.username === 'Ali2', 'kullanıcı adı değişti');
  r = await call('POST', '/api/account/password', { current: 'sifre12345', new: 'yeni-sifre-77' }, A);
  ok(r.s === 200, 'şifre değişti');
  const K = { c: '' };
  r = await call('POST', '/api/login', { username: 'ali2', password: 'yeni-sifre-77' }, K);
  ok(r.s === 200, 'yeni şifre ve yeni kullanıcı adıyla giriş');

  // sıfırlama (ayrı IP/anahtar: Ayşe)
  r = await call('POST', '/api/reset', { username: 'ayse', code: 'AAAA-AAAA-AAAA', password: 'baska-sifre-1' }, {});
  ok(r.s === 403, 'yanlış kurtarma kodu reddedildi');
  r = await call('POST', '/api/account/recovery', { password: 'ayse-sifre-9' }, B);
  const codeB = r.j.recoveryCode;
  r = await call('POST', '/api/reset', { username: 'ayse', code: codeB.toLowerCase(), password: 'baska-sifre-1' }, {});
  ok(r.s === 200 && r.j.recoveryCode && r.j.recoveryCode !== codeB, 'kurtarma koduyla şifre sıfırlandı, yeni kod verildi');
  ok((await call('GET', '/api/docs', undefined, B)).s === 401, 'sıfırlama eski oturumları kapattı');
  r = await call('POST', '/api/login', { username: 'ayse', password: 'baska-sifre-1' }, B);
  ok(r.s === 200, 'sıfırlanan şifreyle giriş');
  r = await call('POST', '/api/reset', { username: 'ayse', code: codeB, password: 'xxxxxxxx-1' }, {});
  ok(r.s === 403, 'kullanılmış kurtarma kodu artık geçersiz');

  // MAX_USERS (3): Ali, Ayse + bir tane daha, sonra dolu
  r = await call('POST', '/api/register', { username: 'Veli', password: 'veli-sifre-9', invite: 'davet-kodu-123', consent: true }, {});
  ok(r.s === 200, 'üçüncü kullanıcı');
  r = await call('POST', '/api/register', { username: 'Can', password: 'can-sifre-99', invite: 'davet-kodu-123', consent: true }, {});
  ok(r.s === 403 && r.j.code === 'full', 'kullanıcı sınırı (MAX_USERS) çalışıyor');

  // silme
  ok((await call('DELETE', '/api/docs', undefined, K)).s === 200, 'tüm veriyi silme');
  r = await call('POST', '/api/account/delete', { password: 'yeni-sifre-77' }, K);
  ok(r.s === 409 && r.j.code === 'last_admin', 'ilk hesap yönetici olduğu için, son yönetici hesabı silinemedi');
  ok((await call('POST', '/api/login', { username: 'ali2', password: 'yeni-sifre-77' }, { c: '' })).s === 200, 'hesap duruyor, giriş çalışıyor');
  ok((await call('GET', '/api/docs', undefined, B)).j.docs.length === 0, 'diğer kullanıcının verisi etkilenmedi');

  // sağlık
  ok((await call('GET', '/api/health')).j.ok === true, 'sağlık kontrolü');
  ok(!/sifre12345|test-key|yeni-sifre/.test(log), 'günlüklerde şifre/anahtar yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }

srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) { console.log('--- sunucu günlüğü ---\n' + log); process.exit(1); }
