// Sohbet ucu testi: oturumlar (SQLite), model seçimi, otomatik en hızlı model,
// geçmiş/bağlam, doğrulama, kota, içe aktarma, izolasyon ve yeniden başlatma sonrası kalıcılık.
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
const prompts = [];
let calls = 0;

const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const m = req.url.match(/models\/([^:]+):generateContent/);
    if (!m) { res.writeHead(404); return res.end('{}'); }
    const model = decodeURIComponent(m[1]);
    calls++;
    const body = JSON.parse(b);
    prompts.push(body.contents[0].parts[0].text);
    const n = calls;
    // chat-a yavaş, chat-b hızlı: otomatik seçimin gerçekten hızlıyı seçtiğini ölçebilmek için
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: `Merhaba ${model} #${n}` }] } }] }));
    }, model === 'chat-a' ? 120 : 5);
  });
});
await new Promise(r => mock.listen(MOCK, r));

const env = {
  ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', GEMINI_API_KEY: 'test-key',
  GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`, AI_CHAIN: 'gemini:chat-a,gemini:chat-b',
  AI_CHAT_MODELS: '', AI_DAILY_LIMIT_PER_USER: '7', AI_DAILY_LIMIT_GLOBAL: '100',
};
function start() {
  const s = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env,
  });
  s.stdout.on('data', d => log += d); s.stderr.on('data', d => log += d);
  return s;
}
let log = '', srv = start();
async function waitUp() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) return true; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }
  return false;
}
await waitUp();

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = { c: '' }, jar2 = { c: '' };
async function call(method, p, body, which) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' };
  const j0 = which === 2 ? jar2 : which === true ? null : jar;
  if (j0 && j0.c) headers.Cookie = j0.c;
  const r = await fetch(`http://127.0.0.1:${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc && j0) j0.c = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* gövde yok */ }
  return { s: r.status, j };
}
const chat = (body, which) => call('POST', '/api/chat', body, which);
const sessions = (which) => call('GET', '/api/chat/sessions', undefined, which);

try {
  ok((await chat({ content: 'x' }, true)).s === 401, 'oturumsuz sohbet 401');
  ok((await sessions(true)).s === 401, 'oturumsuz oturum listesi 401');
  await call('POST', '/api/register', { username: 'chattest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' });

  /* ---- katalog ve doğrulama ---- */
  let r = await sessions();
  ok(r.s === 200 && Array.isArray(r.j.sessions) && r.j.sessions.length === 0, 'yeni kullanıcının sohbet listesi boş');
  ok(Array.isArray(r.j.models) && r.j.models.length === 2, 'model kataloğu anahtarı olan modelleri listeliyor');
  const ma = (r.j.models || []).find(m => m.key === 'gemini:chat-a');
  ok(ma && ma.provider === 'gemini' && ma.label && !ma.slow, 'model kaydı anahtar, sağlayıcı ve etiket içeriyor');

  r = await chat({ content: '' });
  ok(r.s === 400 && r.j.code === 'bad_request', 'boş mesaj reddedildi');
  r = await chat({ content: 'x'.repeat(4001) });
  ok(r.s === 400 && r.j.code === 'bad_request', 'çok uzun mesaj reddedildi');
  r = await chat({ content: 'merhaba', sessionId: 'bozuk' });
  ok(r.s === 400 && r.j.code === 'bad_request', 'geçersiz oturum kimliği reddedildi');
  r = await chat({ content: 'merhaba', sessionId: 'cs' + '0'.repeat(16) });
  ok(r.s === 404 && r.j.code === 'not_found', 'başkasına/olmayan oturuma mesaj 404');
  r = await call('GET', '/api/chat/sessions/cs' + '0'.repeat(16));
  ok(r.s === 404, 'olmayan oturumun geçmişi 404');

  /* ---- ilk sohbet: oturum oluşur, geçmiş sunucuda tutulur ---- */
  r = await chat({ content: 'Bugün ne yemeliyim?', context: 'profil: erkek, 30 yaş' });
  ok(r.s === 200 && /^Merhaba/.test(r.j.message.content), 'sohbet cevabı geldi');
  ok(/^cs[0-9a-f]{16}$/.test(r.j.sessionId), 'yeni oturum kimliği üretildi');
  ok(/^gemini:chat-/.test(r.j.message.model) && r.j.message.ms > 0, 'cevabı hangi modelin kaç ms\'de verdiği döndü');
  ok(r.j.session && r.j.session.title === 'Bugün ne yemeliyim?', 'oturum başlığı ilk mesajdan üretildi');
  const sid = r.j.sessionId;
  ok(prompts[0].includes('Kullanıcı: Bugün ne yemeliyim?') && prompts[0].includes('Asistan:'), 'ilk mesaj isteme yazıldı');
  ok(prompts[0].includes('profil: erkek, 30 yaş'), 'kullanıcı özeti isteme eklendi');

  r = await chat({ sessionId: sid, content: 'Peki ya akşam?' });
  ok(r.s === 200 && r.j.sessionId === sid, 'aynı oturuma ikinci mesaj gönderildi');
  ok(prompts[1].includes('Kullanıcı: Bugün ne yemeliyim?') && prompts[1].includes('Asistan: Merhaba') && prompts[1].includes('Kullanıcı: Peki ya akşam?'), 'sohbet geçmişi sunucudan isteme taşındı');

  r = await sessions();
  ok(r.j.sessions.length === 1 && r.j.sessions[0].count === 4, 'oturum listesi mesaj sayısıyla döndü');
  ok(r.j.sessions[0].preview && /akşam/.test(r.j.sessions[0].preview), 'oturum önizlemesi son soruyu gösteriyor');

  r = await call('GET', '/api/chat/sessions/' + sid);
  ok(r.s === 200 && r.j.messages.length === 4, 'oturum geçmişi mesajlarıyla döndü');
  ok(r.j.messages[0].role === 'user' && r.j.messages[1].role === 'assistant', 'mesaj sırası korunuyor');
  ok(r.j.messages[1].model && r.j.messages[1].ms > 0, 'asistan mesajında model ve süre kayıtlı');

  /* ---- model seçimi ---- */
  r = await chat({ sessionId: sid, content: 'Hızlı olanı seç', model: 'gemini:chat-b' });
  ok(r.s === 200 && r.j.message.model === 'gemini:chat-b', 'kullanıcının seçtiği model kullanıldı');
  r = await chat({ sessionId: sid, content: 'Otomatik' });
  ok(r.s === 200 && r.j.message.model === 'gemini:chat-b', 'auto modu ölçülen en hızlı modeli seçti');
  r = await sessions();
  ok((r.j.models.find(m => m.key === 'gemini:chat-b') || {}).ms > 0, 'ölçülen model süresi kataloğa yansıdı');
  r = await chat({ sessionId: sid, content: 'Yavaş olanı seç', model: 'gemini:chat-a' });
  ok(r.s === 200 && r.j.message.model === 'gemini:chat-a', 'yavaş model de elle seçilebiliyor');
  r = await chat({ sessionId: sid, content: 'Bilinmeyen model', model: 'yok:model' });
  ok(r.s === 200 && /^gemini:chat-/.test(r.j.message.model), 'bilinmeyen model seçilirse otomatiğe düşüldü');

  /* ---- kota ---- */
  r = await chat({ sessionId: sid, content: 'Son hakkım' });
  ok(r.s === 200, 'günlük hakkın son çağrısı kabul edildi');
  r = await chat({ sessionId: sid, content: 'Fazla mesaj' });
  ok(r.s === 429 && r.j.code === 'quota', 'günlük sohbet hakkı dolunca 429 döndü');

  /* ---- izolasyon ve içe aktarma (ikinci kullanıcı) ---- */
  await call('POST', '/api/register', { username: 'chatother', password: 'Qw8!mNbV3sXz7K', invite: 'k' }, 2);
  r = await sessions(2);
  ok(r.s === 200 && r.j.sessions.length === 0, 'ikinci kullanıcının sohbeti yok');
  r = await call('GET', '/api/chat/sessions/' + sid, undefined, 2);
  ok(r.s === 404, 'başka kullanıcının oturumu okunamıyor');
  r = await chat({ sessionId: sid, content: 'sızma denemesi' }, 2);
  ok(r.s === 404, 'başka kullanıcının oturumuna mesaj yazılamıyor');
  r = await call('DELETE', '/api/chat/sessions/' + sid, undefined, 2);
  ok(r.s === 404, 'başka kullanıcının oturumu silinemiyor');

  const oldMsgs = [
    { role: 'user', content: 'Eski cihazdan merhaba' },
    { role: 'assistant', content: 'Eski cevap', model: 'gemini:chat-a', ms: 800 },
    { role: 'user', content: 'Devam edelim' },
  ];
  r = await call('POST', '/api/chat/import', { messages: oldMsgs }, 2);
  ok(r.s === 200 && r.j.session && /^cs[0-9a-f]{16}$/.test(r.j.session.id), 'eski cihaz geçmişi sunucuya aktarıldı');
  const sid2 = r.j.session.id;
  r = await call('GET', '/api/chat/sessions/' + sid2, undefined, 2);
  ok(r.s === 200 && r.j.messages.length === 3 && r.j.messages[1].model === 'gemini:chat-a', 'aktarılan geçmiş model bilgisiyle okunuyor');
  r = await call('POST', '/api/chat/import', { messages: oldMsgs }, 2);
  ok(r.s === 409 && r.j.code === 'exists', 'ikinci kez içe aktarma reddedildi');
  r = await call('POST', '/api/chat/import', { messages: [] }, true);
  ok(r.s === 401, 'oturumsuz içe aktarma 401');

  /* ---- yeniden başlatma sonrası kalıcılık ---- */
  await new Promise(res => { srv.once('exit', res); srv.kill(); });
  srv = start();
  ok(await waitUp(), 'sunucu yeniden başladı');
  r = await sessions();
  ok(r.s === 200 && r.j.sessions.length === 1 && r.j.sessions[0].id === sid, 'sohbetler yeniden başlatma sonrasında duruyor');
  r = await call('GET', '/api/chat/sessions/' + sid);
  ok(r.s === 200 && r.j.messages.length === 14, 'oturumun tüm mesajları korundu');

  /* ---- silme ---- */
  r = await call('DELETE', '/api/chat/sessions/' + sid);
  ok(r.s === 200, 'oturum silindi');
  r = await call('GET', '/api/chat/sessions/' + sid);
  ok(r.s === 404, 'silinen oturum okunamıyor');
  r = await sessions();
  ok(r.j.sessions.length === 0, 'silinen oturum listeden düştü');
  ok(!/test-key/.test(log), 'günlükte API anahtarı yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-2000));
process.exit(fail ? 1 : 0);
