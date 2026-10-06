// Apple Sağlık (iPhone Kısayolları) ile yakılan kalori eşitlemesi. Çalıştır: node test/health.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-health-'));
const PORT = 18095, base = `http://127.0.0.1:${PORT}`;
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT, DATA_DIR: dir, INVITE_CODE: 'davet-kodu-123' } });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = () => ({ c: '' });
async function call(method, p, body, j) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }; if (j && j.c) headers.Cookie = j.c;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (j && sc) j.c = sc.split(';')[0];
  let x = null; try { x = await r.json(); } catch (e) { /* boş */ } return { s: r.status, j: x };
}
// Kısayollar çerez ve X-Requested-With göndermez: yalnızca Authorization başlığı
const sync = (key, body, extra = {}) => fetch(base + '/api/health-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}), ...extra }, body: JSON.stringify(body) })
  .then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
const ymd = off => new Date(Date.now() + off * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const TODAY = ymd(0);
const A = jar(), B = jar();

try {
  let r = await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345-xyz', invite: 'davet-kodu-123', consent: true }, A);
  await call('POST', '/api/register', { username: 'Bora', password: 'bora-sifre-22', invite: 'davet-kodu-123', consent: true }, B);

  r = await call('GET', '/api/burn', undefined, A);
  ok(r.s === 200 && r.j.sync.enabled === false && Object.keys(r.j.days).length === 0, 'başlangıçta bağlantı yok, kayıt yok');
  ok((await call('GET', '/api/burn', undefined, jar())).s === 401, 'oturumsuz /burn 401');
  ok((await sync(null, { kcal: 300 })).s === 401, 'anahtarsız eşitleme reddedildi');
  ok((await sync('sh_yanlis-anahtar-yanlis-anahtar', { kcal: 300 })).s === 401, 'yanlış anahtar reddedildi');

  // bağlantı yokken elle giriş çalışır
  r = await call('POST', '/api/burn', { date: TODAY, kcal: 500 }, A);
  ok(r.s === 200 && r.j.days[TODAY].kcal === 500 && r.j.days[TODAY].src === 'manual', 'bağlantı yokken elle giriş kaydedildi');
  ok((await call('POST', '/api/burn', { date: TODAY, kcal: -1 }, A)).s === 400, 'elle girişte negatif reddedildi');
  ok((await call('POST', '/api/burn', { date: ymd(5), kcal: 100 }, A)).s === 400, 'gelecek tarihe elle giriş reddedildi');
  r = await call('POST', '/api/burn', { date: ymd(-1), kcal: 111 }, A);
  r = await call('POST', '/api/burn', { date: ymd(-1), kcal: null }, A);
  ok(r.j.days[ymd(-1)] === undefined, 'elle girilen kayıt silinebiliyor');

  r = await call('POST', '/api/sync-key', {}, A);
  const key = r.j.key;
  ok(r.s === 200 && /^sh_[\w-]{30,}$/.test(key), 'anahtar üretildi');
  ok((await call('GET', '/api/burn', undefined, A)).j.sync.enabled === true, 'durum: bağlı');
  const db = JSON.stringify((await call('GET', '/api/docs', undefined, A)).j);
  ok(!db.includes(key), 'anahtar kayıtlarda açık hâlde yok');

  // temel akış: tarihsiz (bugün), CSRF başlığı olmadan
  r = await sync(key, { kcal: 300 });
  ok(r.s === 200 && r.j.result === 'saved' && r.j.date === TODAY && r.j.kcal === 300, 'Kısayol: kcal gönderildi, bugüne yazıldı (eskiden elle girilmiş 500\'ün üstüne)');
  r = await call('GET', '/api/burn', undefined, A);
  ok(r.j.days[TODAY].kcal === 300 && r.j.days[TODAY].src === 'sync' && r.j.sync.last > 0, 'yakılan kalori okunuyor, kaynak sync, son eşitleme kayıtlı');

  // aynı gün tekrar: son değer geçerli; adım; metin biçimleri
  r = await sync(key, { kcal: '1.234,5 kcal', steps: '8.250', date: TODAY });
  ok(r.j.kcal === 1235 && (await call('GET', '/api/burn', undefined, A)).j.days[TODAY].steps === 8250, 'Türkçe biçimli metin ("1.234,5 kcal") ve adım sayısı doğru ayrıştı');
  r = await sync(key, { kcal: 312 });
  ok(r.j.kcal === 312, 'aynı gün yeni değer eskisinin yerine geçer');

  // kilitli telefon: 0 gelirse dolu değer ezilmez
  r = await sync(key, { kcal: 0 });
  ok(r.j.result === 'skipped_zero' && (await call('GET', '/api/burn', undefined, A)).j.days[TODAY].kcal === 312, 'kcal=0 yok sayıldı, dolu değer korundu');

  // doğrulama
  ok((await sync(key, { kcal: -5 })).s === 400, 'negatif kcal reddedildi');
  ok((await sync(key, { kcal: 99999 })).s === 400, 'saçma büyük kcal reddedildi');
  ok((await sync(key, { kcal: 'abc' })).s === 400, 'sayı olmayan kcal reddedildi');
  ok((await sync(key, { kcal: 200, date: ymd(-30) })).s === 400, '30 gün öncesine yazılamıyor');
  ok((await sync(key, { kcal: 200, date: '2026-13-45' })).s === 400, 'geçersiz tarih reddedildi');
  r = await sync(key, { kcal: 250, date: ymd(-1) });
  ok(r.s === 200 && r.j.date === ymd(-1), 'dünün verisi gönderilebiliyor');
  r = await fetch(base + '/api/health-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kcal: 111, key }) });
  ok(r.status === 200, 'anahtar JSON gövdesinde de kabul ediliyor');

  // Sağlık bağlıyken elle giriş kapalı
  r = await call('POST', '/api/burn', { date: TODAY, kcal: 500 }, A);
  ok(r.s === 409 && r.j.code === 'sync_on', 'Sağlık bağlıyken elle giriş reddedildi (409)');
  ok((await call('GET', '/api/burn', undefined, A)).j.days[TODAY].kcal === 111, 'reddedilen elle giriş mevcut değeri değiştirmedi (500 yazılmadı)');
  r = await sync(key, { kcal: 900 });
  ok(r.j.result === 'saved' && r.j.kcal === 900, 'Sağlık verisi yazılmaya devam ediyor');

  // kullanıcılar ayrı; arayüzün yazdığı kayıtlar sunucu verisini bozmaz
  ok(Object.keys((await call('GET', '/api/burn', undefined, B)).j.days).length === 0, 'Bora Ali\'nin yakılan kalorisini görmüyor');
  await call('PUT', '/api/docs/core', { data: { profile: { weight: 80 } } }, A);
  await call('PUT', '/api/docs/m-' + TODAY.slice(0, 7), { data: { days: { [TODAY]: { meals: [] } } } }, A);
  ok((await call('GET', '/api/burn', undefined, A)).j.days[TODAY].kcal === 900, 'arayüzün ay/çekirdek kayıtları yakılan kaloriyi etkilemiyor');

  // anahtar yenileme / iptal
  const key2 = (await call('POST', '/api/sync-key', {}, A)).j.key;
  ok(key2 !== key && (await sync(key, { kcal: 1 })).s === 401 && (await sync(key2, { kcal: 700 })).s === 200, 'yeni anahtar üretilince eskisi geçersiz, yenisi çalışıyor');
  await call('POST', '/api/sync-key/revoke', {}, A);
  ok((await sync(key2, { kcal: 700 })).s === 401 && (await call('GET', '/api/burn', undefined, A)).j.sync.enabled === false, 'bağlantı kapatılınca anahtar çalışmıyor');
  ok((await call('GET', '/api/burn', undefined, A)).j.days[TODAY].kcal === 700, 'bağlantıyı kapatmak mevcut kayıtları silmiyor');

  // kaba kuvvet koruması
  let last = 0; for (let i = 0; i < 30; i++) last = (await sync('sh_deneme-' + i + '-xxxxxxxxxxxxxxxxxx', { kcal: 1 })).s;
  ok(last === 429, 'çok sayıda yanlış anahtar denemesi sınırlanıyor (429)');

  ok(!/sh_[\w-]{30,}/.test(log), 'günlükte anahtar yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
await new Promise(r => { srv.once('exit', r); srv.kill(); setTimeout(r, 3000).unref(); });
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* Windows dosyayı biraz geç bırakabilir */ }
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log);
process.exit(fail ? 1 : 0);
