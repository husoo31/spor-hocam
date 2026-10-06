// Kalıcılık testi: yeniden başlatma/güncelleme sonrası veriler kalıyor mu, yedek alınıyor mu. Çalıştır: node test/persist.test.mjs
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-persist-'));
const PORT = 18090, base = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };

function start() {
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT, DATA_DIR: dir, INVITE_CODE: 'davet-kodu-123' } });
  srv.log = ''; srv.stdout.on('data', d => srv.log += d); srv.stderr.on('data', d => srv.log += d);
  return srv;
}
async function ready() {
  const t = Date.now();
  while (Date.now() - t < 10000) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch (e) { /* henüz açılmadı */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('sunucu başlamadı');
}
const stop = srv => new Promise(r => { srv.once('exit', r); srv.kill('SIGTERM'); setTimeout(() => srv.kill('SIGKILL'), 6000).unref(); });
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }, body: JSON.stringify(body) });

let srv = start();
try {
  await ready();
  ok(!fs.existsSync(path.join(dir, 'backups')), 'boş veritabanı için yedek alınmadı');
  let r = await post('/api/register', { username: 'Ali', password: 'sifre12345-xyz', invite: 'davet-kodu-123', consent: true });
  ok(r.status === 200, 'kayıt oldu');
  await stop(srv);

  // "güncelleme": sunucu kapanıp yeniden açılıyor, veri klasörü aynı
  srv = start();
  await ready();
  r = await post('/api/login', { username: 'Ali', password: 'sifre12345-xyz' });
  ok(r.status === 200, 'yeniden başlatma sonrası hesap ve şifre duruyor');
  const bdir = path.join(dir, 'backups');
  const snaps = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => /^start-.*\.db$/.test(f)) : [];
  ok(snaps.length === 1, 'açılışta yedek alındı');
  if (snaps.length) {
    const b = new DatabaseSync(path.join(bdir, snaps[0]), { readOnly: true });
    ok(b.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1, 'yedek geçerli ve kullanıcıyı içeriyor');
    b.close();
  }
  await stop(srv);

  // çok sayıda yeniden başlatma yedek sayısını sınırlıyor
  for (let i = 0; i < 7; i++) { srv = start(); await ready(); await stop(srv); await new Promise(r => setTimeout(r, 1100)); }
  ok(fs.readdirSync(bdir).filter(f => f.startsWith('start-')).length <= 5, 'açılış yedekleri en fazla 5 tane tutuluyor');
  const db = new DatabaseSync(path.join(dir, 'spor.db'), { readOnly: true });
  ok(db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1, 'tüm yeniden başlatmalardan sonra kullanıcı hâlâ var');
  db.close();
} catch (e) {
  fail++; console.log('✗ test hatası:', e.message, '\n', srv && srv.log);
} finally {
  try { srv.kill('SIGKILL'); } catch (e) { /* kapalı */ }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
