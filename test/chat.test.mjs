// Sohbet ucu testi: otomatik model seçimi, geçmiş/bağlam, doğrulama ve kota.
// Çalıştır: node test/chat.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-chat-'));
const MOCK = 18221, APP = 18220;
let lastPrompt = '', calls = 0;

const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const m = req.url.match(/models\/([^:]+):generateContent/);
    if (!m) { res.writeHead(404); return res.end('{}'); }
    calls++;
    const body = JSON.parse(b);
    lastPrompt = body.contents[0].parts[0].text;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Merhaba, hedefin iyi görünüyor.' }] } }] }));
  });
});
await new Promise(r => mock.listen(MOCK, r));

const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', GEMINI_API_KEY: 'test-key',
    GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`, AI_CHAIN: 'gemini:chat-a,gemini:chat-b',
    AI_DAILY_LIMIT_PER_USER: '3', AI_DAILY_LIMIT_GLOBAL: '100' },
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = { c: '' };
async function call(method, p, body, noCookie) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' };
  if (jar.c && !noCookie) headers.Cookie = jar.c;
  const r = await fetch(`http://127.0.0.1:${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* gövde yok */ }
  return { s: r.status, j };
}
const chat = (messages, context) => call('POST', '/api/chat', { messages, context });

try {
  ok((await call('POST', '/api/chat', { messages: [{ role: 'user', content: 'x' }] }, true)).s === 401, 'oturumsuz sohbet 401');
  await call('POST', '/api/register', { username: 'chattest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' });

  let r = await chat([{ role: 'user', content: 'Bugün ne yemeliyim?' }], 'profil: erkek, 30 yaş');
  ok(r.s === 200 && /Merhaba/.test(r.j.text), 'sohbet cevabı geldi');
  ok(/^gemini:chat-/.test(r.j.model) && r.j.ms > 0, 'cevabı hangi modelin kaç ms\'de verdiği döndü');
  ok(lastPrompt.includes('Kullanıcı: Bugün ne yemeliyim?') && lastPrompt.includes('Asistan:'), 'ilk mesaj isteme yazıldı');
  ok(lastPrompt.includes('profil: erkek, 30 yaş'), 'kullanıcı özeti isteme eklendi');

  r = await chat([{ role: 'user', content: 'Bugün ne yemeliyim?' }, { role: 'assistant', content: 'Protein ağırlıklı ye.' }, { role: 'user', content: 'Peki ya akşam?' }]);
  ok(r.s === 200 && calls === 2, 'ikinci mesaj gönderildi');
  ok(lastPrompt.includes('Asistan: Protein ağırlıklı ye.') && lastPrompt.includes('Kullanıcı: Peki ya akşam?'), 'sohbet geçmişi isteme taşındı');

  r = await chat([{ role: 'user', content: 'üçüncü' }]);
  ok(r.s === 200, 'günlük hakkın son çağrısı kabul edildi');
  r = await chat([{ role: 'user', content: 'dördüncü' }]);
  ok(r.s === 429 && r.j.code === 'quota', 'günlük sohbet hakkı dolunca 429 döndü');

  r = await chat([]);
  ok(r.s === 400 && r.j.code === 'bad_request', 'boş mesaj reddedildi');
  r = await chat([{ role: 'user', content: 'x'.repeat(5000) }]);
  ok(r.s === 400 && r.j.code === 'bad_request', 'çok uzun mesaj reddedildi');
  r = await chat([{ role: 'user', content: 'cevapsız' }, { role: 'assistant', content: 'cevap' }]);
  ok(r.s === 400 && r.j.code === 'bad_request', 'son mesaj kullanıcıdan değilse reddedildi');
  ok(!/test-key/.test(log), 'günlükte API anahtarı yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-1200));
process.exit(fail ? 1 : 0);
