// Otomatik yedek testi. Çalıştır: node test/backup.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-bk-')), APP = 18130;
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', BACKUP_DELAY_MS: '300', BACKUP_KEEP: '3', BACKUP_EVERY_HOURS: '24' },
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = { c: '' };
async function call(method, p, body) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }; if (jar.c) headers.Cookie = jar.c;
  const r = await fetch(`http://127.0.0.1:${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* gövde yok */ }
  return { s: r.status, j };
}
const bdir = path.join(dir, 'backups');
const files = () => fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => /^spor-\d{8}-\d{4}\.db$/.test(f)).sort() : [];
try {
  await new Promise(r => setTimeout(r, 1200));
  ok(files().length === 1, 'açılışta (yedek yokken) otomatik ilk yedek alındı: ' + files()[0]);
  ok(/\[yedek\] spor-/.test(log), 'günlükte yedek satırı var');
  // veri ekle, anlık yedek al, yedeğin içinde veri var mı?
  ok((await call('POST', '/api/register', { username: 'bktest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' })).s === 200, 'kayıt oluşturuldu (ilk kayıt = yönetici)');
  const doc = await call('PUT', '/api/docs?id=core', { data: { hello: 'dünya', n: 42 } }).catch(() => null); // biçim farklıysa sorun değil
  const r = await call('POST', '/api/admin/backup-now');
  ok(r.s === 200 && r.j.ok && r.j.last.bytes > 4000, 'yönetici "şimdi yedekle": ' + r.s + ' (' + (r.j && r.j.last && r.j.last.file) + ')');
  const latest = files().pop();
  const db = new DatabaseSync(path.join(bdir, latest), { readOnly: true });
  ok(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'yedek açılıyor ve bütünlük denetiminden geçiyor');
  ok(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username='bktest'").get().n === 1, 'yedek, yeni kaydedilen kullanıcıyı içeriyor (canlı veriyle tutarlı kopya)');
  db.close();
  // WAL'dan bağımsız tutarlılık: sunucu çalışırken yedek alındı, geçici dosya kalmadı
  ok(fs.readdirSync(bdir).every(f => !f.endsWith('.tmp')), 'geçici (.tmp) dosya kalmadı');
  // yönetici özeti ve durum paneli
  const ov = await call('GET', '/api/admin/overview');
  ok(ov.j.backup && ov.j.backup.count >= 1 && ov.j.backup.last.file === latest, 'yönetim özeti son yedeği gösteriyor');
  const st = await call('GET', '/api/status');
  const b = (st.j.items || []).find(i => i.id === 'backup');
  ok(b && b.state === 'ok' && /son yedek/.test(b.detail) && b.ms === null, 'durum panelinde yedek satırı: ' + (b && b.detail));
  // döndürme: 5 eski tarihli yedek yerleştir, yeni yedek alınca yalnız en yeni 3 kalmalı
  const seed = path.join(bdir, latest);
  for (const n of ['20200101-0000', '20200102-0000', '20200103-0000', '20200104-0000', '20200105-0000']) fs.copyFileSync(seed, path.join(bdir, `spor-${n}.db`));
  ok(files().length >= 6, 'döndürme testi için eski yedekler yerleştirildi (' + files().length + ')');
  await new Promise(r3 => setTimeout(r3, 1100));
  const rr = await call('POST', '/api/admin/backup-now');
  const left = files();
  ok(rr.s === 200 && left.length === 3, 'yeni yedek sonrası yalnız en yeni 3 yedek saklanıyor: ' + left.join(', '));
  ok(!left.includes('spor-20200101-0000.db') && !left.includes('spor-20200102-0000.db') && left.includes(rr.j.last.file), 'en eskiler silindi, yeni yedek korundu');
  // yönetici olmayan kullanıcı yedek alamaz
  const jar2 = { c: '' };
  const r2 = await fetch(`http://127.0.0.1:${APP}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }, body: JSON.stringify({ username: 'normal1', password: 'Zx9!kLmQ2pRtV7', invite: 'k' }) });
  jar2.c = (r2.headers.get('set-cookie') || '').split(';')[0];
  const x = await fetch(`http://127.0.0.1:${APP}/api/admin/backup-now`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam', Cookie: jar2.c } });
  ok(x.status === 403, 'yönetici olmayan kullanıcı yedek ucuna erişemez (' + x.status + ')');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-800));
process.exit(fail ? 1 : 0);
