// Bildirim sunucusu (Web Push) uçtan uca: sahte push servisi + gerçek sunucu. Çalıştır: node test/push.test.mjs
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { b64u, fromB64u } from '../webpush.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// sahte push servisi: gelen istekleri kaydeder; /gone yolu 410 döner
const got = [];
const fake = http.createServer((req, res) => {
  const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => {
    got.push({ url: req.url, headers: req.headers, body: Buffer.concat(ch) });
    res.writeHead(req.url.startsWith('/gone') ? 410 : 201); res.end();
  });
});
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const FP = fake.address().port, FAKE = p => `http://127.0.0.1:${FP}${p}`;

async function start(port, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-push-'));
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: port, DATA_DIR: dir, INVITE_CODE: 'davet-kodu-123', ...extraEnv } });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) { /* bekle */ } await sleep(100); }
  return { srv, base };
}
const call = (base) => async (method, p, body, j, hdr = {}) => {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam', ...hdr }; if (j && j.c) headers.Cookie = j.c;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (j && sc) j.c = sc.split(';')[0];
  let x = null; try { x = await r.json(); } catch (e) { /* boş */ } return { s: r.status, j: x };
};
function subscriber(path) {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { endpoint: FAKE(path), keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) }, priv: b64u(e.getPrivateKey()) };
}
function decrypt(body, s) { // abonelik tarafı (RFC 8291 §4)
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), enc = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(fromB64u(s.priv));
  const ua = fromB64u(s.keys.p256dh), shared = ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, fromB64u(s.keys.auth), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(enc.subarray(enc.length - 16));
  const plain = Buffer.concat([d.update(enc.subarray(0, enc.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
}
const TZ = 'Europe/Istanbul';
const parts = () => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute }; };
const minusMin = (n) => { const t = (parts().min - n + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

const S1 = await start(18310, { PUSH_ALLOW_ANY: 'true', PUSH_TICK_MS: '300' });
const S2 = await start(18311, {}); // varsayılan: yalnızca bilinen push servisleri
try {
  const c = call(S1.base), A = { c: '' }, B = { c: '' };
  await c('POST', '/api/register', { username: 'Ali', password: 'sifre12345-xyz', invite: 'davet-kodu-123', consent: true }, A);
  await c('POST', '/api/register', { username: 'Bora', password: 'bora-sifre-22', invite: 'davet-kodu-123', consent: true }, B);

  let r = await c('GET', '/api/push/key', undefined, A);
  ok(r.s === 200 && fromB64u(r.j.key).length === 65 && r.j.devices === 0, 'VAPID açık anahtarı alınır (65 bayt), cihaz sayısı 0');
  const key1 = r.j.key; r = await c('GET', '/api/push/key', undefined, B);
  ok(r.j.key === key1, 'anahtar tüm kullanıcılar için aynı ve kalıcı');
  ok((await c('GET', '/api/push/key', undefined, { c: '' })).s === 401, 'oturumsuz istek 401');
  ok((await c('POST', '/api/push/test', {}, A, { 'X-Requested-With': '' })).s === 403, 'CSRF başlığı yoksa POST reddedilir');

  // abonelik doğrulama
  const s1 = subscriber('/push/ali1');
  ok((await c('POST', '/api/push/subscribe', { subscription: { endpoint: s1.endpoint, keys: { p256dh: 'AAAA', auth: s1.keys.auth } } }, A)).s === 400, 'geçersiz p256dh reddedilir');
  ok((await c('POST', '/api/push/subscribe', { subscription: { endpoint: s1.endpoint, keys: { p256dh: s1.keys.p256dh, auth: 'AAAA' } } }, A)).s === 400, 'geçersiz auth reddedilir');
  ok((await c('POST', '/api/push/subscribe', { subscription: { endpoint: 'ftp://x', keys: s1.keys } }, A)).s === 400, 'geçersiz adres reddedilir');
  const c2 = call(S2.base), Z = { c: '' };
  await c2('POST', '/api/register', { username: 'Can', password: 'can-sifre-12345', invite: 'davet-kodu-123', consent: true }, Z);
  r = await c2('POST', '/api/push/subscribe', { subscription: { endpoint: s1.endpoint, keys: s1.keys } }, Z);
  ok(r.s === 400 && r.j.code === 'bad_endpoint', 'SSRF: yerel/bilinmeyen adres (127.0.0.1) varsayılan sunucuda reddedilir');
  r = await c2('POST', '/api/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: s1.keys } }, Z);
  ok(r.s === 200 && r.j.devices === 1, 'bilinen servis (fcm.googleapis.com) kabul edilir');

  // deneme bildirimi: şifreli, VAPID imzalı
  const stateNone = { date: parts().date };
  r = await c('POST', '/api/push/subscribe', { subscription: { endpoint: s1.endpoint, keys: s1.keys }, tz: TZ, cfg: { rem: {} }, state: stateNone }, A);
  ok(r.s === 200 && r.j.devices === 1, 'abonelik kaydedildi');
  got.length = 0;
  r = await c('POST', '/api/push/test', {}, A);
  ok(r.s === 200 && r.j.ok && got.length === 1, 'deneme bildirimi push servisine gönderildi');
  const g = got[0], msg = decrypt(g.body, s1);
  ok(msg.title === '🔔 Deneme bildirimi' && /çalışıyor/.test(msg.body), 'yük şifreli; abonelik anahtarıyla çözülünce başlık/metin doğru (emoji + Türkçe)');
  ok(g.headers['content-encoding'] === 'aes128gcm' && g.headers.ttl === '3600' && g.url === '/push/ali1', 'başlıklar: Content-Encoding aes128gcm, TTL');
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(g.headers.authorization || '');
  ok(!!m && m[4] === key1, 'Authorization: vapid t=…, k=<sunucu açık anahtarı>');
  const pub = fromB64u(key1), pk = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  ok(m && crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: pk, dsaEncoding: 'ieee-p1363' }, fromB64u(m[3])), 'VAPID JWT imzası sunucunun açık anahtarıyla doğrulanır');
  const cl = JSON.parse(fromB64u(m[2]).toString()); ok(cl.aud === `http://127.0.0.1:${FP}` && /^mailto:|^https:/.test(cl.sub) && cl.exp > Date.now() / 1000, 'JWT: aud push servisi, sub, exp ileride');

  // zamanlanmış hatırlatma: sabah kontrolü, saati 1 dakika önce → bildirilmeli, tek sefer
  const s2 = subscriber('/push/ali2');
  got.length = 0;
  const cfg = { rem: { chk: minusMin(1) }, hasSupps: false };
  await c('POST', '/api/push/subscribe', { subscription: { endpoint: s2.endpoint, keys: s2.keys }, tz: TZ, cfg, state: stateNone }, A);
  await sleep(1500);
  const mine = got.filter(x => x.url === '/push/ali2');
  ok(mine.length === 1, 'zamanı gelen hatırlatma gönderildi ve tekrar gönderilmedi (1 bildirim): ' + mine.length);
  ok(mine[0] && decrypt(mine[0].body, s2).title === '🔋 Sabah kontrolü', 'hatırlatma içeriği: Sabah kontrolü');
  // yapılmışsa gönderilmez
  const s3 = subscriber('/push/ali3'); got.length = 0;
  await c('POST', '/api/push/subscribe', { subscription: { endpoint: s3.endpoint, keys: s3.keys }, tz: TZ, cfg, state: { date: parts().date, chk: true } }, A);
  await sleep(1200);
  ok(got.filter(x => x.url === '/push/ali3').length === 0, 'iş zaten yapıldıysa (durum eşitlenmiş) bildirim gönderilmez');
  // durum güncellenir: yapılmadı → yapıldı
  const s4 = subscriber('/push/ali4'); got.length = 0;
  const later = { rem: { chk: minusMin(1) } };
  await c('POST', '/api/push/subscribe', { subscription: { endpoint: s4.endpoint, keys: s4.keys }, tz: TZ, cfg: { rem: {} }, state: stateNone }, A);
  r = await c('POST', '/api/push/sync', { endpoint: s4.endpoint, tz: TZ, cfg: later, state: { date: parts().date, chk: true } }, A);
  await sleep(1000);
  ok(r.s === 200 && got.filter(x => x.url === '/push/ali4').length === 0, 'sync ile gelen "yapıldı" durumu bildirimi engeller');
  // başkasının cihazına dokunulamaz
  ok((await c('POST', '/api/push/sync', { endpoint: s4.endpoint, cfg: later, state: stateNone }, B)).s === 404, 'başka kullanıcının cihazı eşitlenemez (404)');
  r = await c('POST', '/api/push/unsubscribe', { endpoint: s4.endpoint }, B);
  r = await c('GET', '/api/push/key', undefined, A);
  ok(r.j.devices === 4, 'başkası abonelikten çıkaramaz (A hâlâ 4 cihaz)');

  // 410: abonelik geçersiz → otomatik silinir
  const sg = subscriber('/gone/x');
  await c('POST', '/api/push/subscribe', { subscription: { endpoint: sg.endpoint, keys: sg.keys }, tz: TZ, cfg: { rem: {} }, state: stateNone }, A);
  const before = (await c('GET', '/api/push/key', undefined, A)).j.devices;
  await c('POST', '/api/push/test', {}, A);
  const after = (await c('GET', '/api/push/key', undefined, A)).j.devices;
  ok(after === before - 1, 'push servisi 410 dönünce ölü abonelik silinir (' + before + ' → ' + after + ')');
  // çıkış
  r = await c('POST', '/api/push/unsubscribe', { endpoint: s1.endpoint }, A);
  ok(r.s === 200 && r.j.devices === 3, 'abonelikten çıkış');
  // cihaz sınırı 5
  for (let i = 0; i < 7; i++) { const s = subscriber('/push/many' + i); await c('POST', '/api/push/subscribe', { subscription: { endpoint: s.endpoint, keys: s.keys }, tz: TZ, cfg: { rem: {} }, state: stateNone }, A); }
  ok((await c('GET', '/api/push/key', undefined, A)).j.devices === 5, 'kullanıcı başına en çok 5 cihaz (eskiler düşer)');
  // hesap silinince abonelikler de silinir
  r = await c('POST', '/api/account/delete', { password: 'bora-sifre-22' }, B);
  ok(r.s === 200, 'hesap silindi');
  // saat dilimi geçersizse varsayılana düşer
  const sz = subscriber('/push/tz'); r = await c('POST', '/api/push/subscribe', { subscription: { endpoint: sz.endpoint, keys: sz.keys }, tz: 'Mars/Olympus', cfg: { rem: {} }, state: stateNone }, A);
  ok(r.s === 200, 'geçersiz saat dilimi hata vermez');
  // dinlenme zamanlayıcısı: süre dolunca anında bildirim; iptal ve yeniden zamanlama
  const rx = subscriber('/push/restx'), ry = subscriber('/push/resty'), rz = subscriber('/push/restz');
  for (const x of [rx, ry, rz]) await c('POST', '/api/push/subscribe', { subscription: { endpoint: x.endpoint, keys: x.keys }, tz: TZ, cfg: { rem: {} }, state: stateNone }, A);
  const D = { c: '' }; await c('POST', '/api/register', { username: 'Deniz', password: 'deniz-sifre-9876', invite: 'davet-kodu-123', consent: true }, D);
  ok((await c('POST', '/api/push/rest', { endpoint: rx.endpoint, seconds: 5 }, D)).s === 404, 'dinlenme: başkasının cihazına zamanlayıcı kurulamaz (404)');
  ok((await c('POST', '/api/push/rest', { endpoint: rx.endpoint, seconds: 2 }, A)).s === 400 && (await c('POST', '/api/push/rest', { endpoint: rx.endpoint, seconds: 5000 }, A)).s === 400, 'dinlenme: 5–900 sn dışı reddedilir');
  got.length = 0;
  r = await c('POST', '/api/push/rest', { endpoint: rx.endpoint, seconds: 5 }, A); ok(r.s === 200 && r.j.scheduled, 'dinlenme: 5 sn sonrası için zamanlandı');
  await c('POST', '/api/push/rest', { endpoint: ry.endpoint, seconds: 5 }, A); r = await c('POST', '/api/push/rest', { endpoint: ry.endpoint, seconds: 0 }, A); ok(r.j.scheduled === false, 'dinlenme: seconds=0 iptal eder');
  await c('POST', '/api/push/rest', { endpoint: rz.endpoint, seconds: 5 }, A); await c('POST', '/api/push/rest', { endpoint: rz.endpoint, seconds: 900 }, A);
  await sleep(2500); ok(got.filter(x => x.url.startsWith('/push/rest')).length === 0, 'dinlenme: süre dolmadan bildirim gitmez');
  await sleep(4000);
  const rg = got.filter(x => x.url.startsWith('/push/rest'));
  ok(rg.length === 1 && rg[0].url === '/push/restx', 'dinlenme: yalnızca süresi dolan cihaza gitti; iptal edilen ve ileri alınan gitmedi');
  const rm = decrypt(rg[0].body, rx); ok(rm.title === '⏱ Dinlenme bitti' && rm.tag === 'sh-rest' && rg[0].headers.ttl === '120' && rg[0].headers.urgency === 'high', 'dinlenme bildirimi: şifreli yük, tag sh-rest, TTL 120, Urgency high');
} finally {
  S1.srv.kill(); S2.srv.kill(); fake.close();
}
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
