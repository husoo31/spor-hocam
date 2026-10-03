// Sistem durumu ucu testi: sahte servislerle. Çalıştır: node test/status.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-st-'));
const MOCK = 18101, APP = 18100;
const hits = { gem: 0, or: 0, usda: 0, off: 0 };
let slowOff = false;
const mock = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/gem/models')) { hits.gem++; return res.end('{"models":[]}'); }
  if (req.url.startsWith('/or/key')) { hits.or++; res.writeHead(401); return res.end('{}'); }       // OpenRouter anahtarı geçersiz
  if (req.url.startsWith('/usda/foods/search')) { hits.usda++; return res.end('{"foods":[]}'); }
  if (req.url.startsWith('/api/v2/product/')) { hits.off++; if (slowOff) return setTimeout(() => res.end('{}'), 60); return res.end('{"status":1}'); }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => mock.listen(MOCK, r));
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', GEMINI_API_KEY: 'g-secret-key', GEMINI_BASE: `http://127.0.0.1:${MOCK}/gem`,
    OPENROUTER_API_KEY: 'or-secret-key', OPENROUTER_BASE: `http://127.0.0.1:${MOCK}/or`, USDA_API_KEY: 'usda-secret-key', USDA_BASE: `http://127.0.0.1:${MOCK}/usda`,
    OFF_BASE: `http://127.0.0.1:${MOCK}`, AI_CHAIN: 'gemini:x' },   // NVIDIA anahtarı bilerek yok
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = { c: '' };
async function call(method, p, body, auth = true) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' };
  if (auth && jar.c) headers.Cookie = jar.c;
  const r = await fetch(`http://127.0.0.1:${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* gövde yok */ }
  return { s: r.status, j, txt };
}
try {
  ok((await call('GET', '/api/status', undefined, false)).s === 401, 'giriş yapmadan durum ucu reddedildi (401)');
  ok((await call('POST', '/api/register', { username: 'sttest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' })).s === 200, 'kayıt oluşturuldu');
  const r = await call('GET', '/api/status');
  const by = id => (r.j.items || []).find(i => i.id === id) || {};
  ok(r.s === 200 && Array.isArray(r.j.items) && r.j.items.length === 6, 'altı sistem raporlandı');
  ok(by('db').state === 'ok' && typeof by('db').ms === 'number', 'veritabanı: aktif, ms ölçüldü (' + by('db').ms + ' ms)');
  ok(by('gemini').state === 'ok' && by('gemini').ms >= 0, 'Gemini: aktif, ms ölçüldü');
  ok(by('openrouter').state === 'down' && /401/.test(by('openrouter').detail), 'OpenRouter: geçersiz anahtar "çalışmıyor" (HTTP 401) olarak gösterildi');
  ok(by('nvidia').state === 'off' && by('nvidia').ms === null, 'NVIDIA: anahtar yok → "kapalı", ms yok');
  ok(by('usda').state === 'ok', 'USDA: aktif');
  ok(by('off').state === 'ok', 'Open Food Facts: aktif');
  ok(r.j.summary === 'warn', 'özet: bir sistem çalışmıyor → uyarı (warn)');
  ok(!r.txt.includes('secret-key') && !/api_key=/.test(r.txt), 'cevapta hiçbir anahtar yok');
  const g0 = hits.gem;
  const r2 = await call('GET', '/api/status');
  ok(r2.j.cached === true && hits.gem === g0, 'ikinci istek önbellekten geldi, dış servise tekrar gidilmedi');
  ok(!/api_key=|secret-key/.test(log), 'günlükte anahtar yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-800));
process.exit(fail ? 1 : 0);
