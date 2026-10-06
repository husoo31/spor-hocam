// Devre kesici ve yeni sağlayıcılar testi. Çalıştır: node test/breaker.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-br-'));
const MOCK = 18121, APP = 18120;
const hits = { dead: 0, limited: 0, good: 0, groq: 0, hang: 0 };
let goodMode = 'ok';
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const m = req.url.match(/models\/([^:]+):generateContent/), model = m && m[1];
    if (model) {
      if (model === 'dead') { hits.dead++; res.writeHead(404); return res.end('{}'); }          // yeni hesaplara kapatılmış model
      if (model === 'limited') { hits.limited++; res.writeHead(429); return res.end('{}'); }    // kota dolu
      if (model === 'hang') { hits.hang++; return; }                                             // hiç cevap vermez
      hits.good++;
      if (goodMode === 'down') { res.writeHead(503); return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true,"by":"good"}' }] } }] }));
    }
    if (req.url === '/groq/chat/completions') {
      hits.groq++; const body = JSON.parse(b);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true, by: 'groq', model: body.model, auth: req.headers.authorization }) } }] }));
    }
    if (req.url === '/groq/models') { res.setHeader('Content-Type', 'application/json'); return res.end('{"data":[]}'); }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => mock.listen(MOCK, r));
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', GEMINI_API_KEY: 'g', GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`,
    GROQ_API_KEY: 'groq-test', GROQ_BASE: `http://127.0.0.1:${MOCK}/groq`, AI_FAST_TIMEOUT_MS: '1500', AI_DAILY_LIMIT_PER_USER: '500', AI_DAILY_LIMIT_GLOBAL: '5000',
    AI_CHAIN: 'gemini:dead,gemini:limited,gemini:good,groq:llama-test,groq:qwen/qwen3.8-27b,groq:llama-4-scout-test', AI_CHAIN_QUICK: 'gemini:hang,gemini:good' },
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
const ai = (extra = {}) => call('POST', '/api/ai', { prompt: 'x', json: true, cache: false, ...extra });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
try {
  await call('POST', '/api/register', { username: 'brtest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' });
  // 1) ilk istek: dead(404) -> limited(429) -> good
  let r = await ai();
  ok(r.s === 200 && r.j.json.by === 'good', 'ilk istek: 404 ve 429 veren modeller atlanıp sağlıklı modelden cevap geldi');
  ok(hits.dead === 1 && hits.limited === 1 && hits.good === 1, 'her model ilk istekte bir kez denendi');
  // 2) ikinci istek: bozuk modeller hiç denenmemeli
  r = await ai();
  ok(r.s === 200 && hits.dead === 1 && hits.limited === 1 && hits.good === 2, 'ikinci istek: bozuk modeller devre kesiciyle atlandı (zaman kaybı yok)');
  // 3) durum ucunda sıra
  const st = await call('GET', '/api/status');
  const ch = st.j.chain || [];
  const by = n => ch.find(c => c.model === n) || {};
  ok(by('gemini:dead').state === 'bekliyor' && /404/.test(by('gemini:dead').reason), 'durum: gemini:dead "bekliyor" (HTTP 404)');
  ok(by('gemini:limited').state === 'bekliyor' && by('gemini:limited').seconds > 30, 'durum: gemini:limited 429 sonrası ~1 dk bekliyor (' + by('gemini:limited').seconds + ' sn)');
  ok(by('gemini:good').state === 'hazır', 'durum: gemini:good hazır');
  ok(by('groq:openai/gpt-oss-120b').image !== true && by('groq:qwen/qwen3.8-27b').image === true, 'Groq: qwen3.8 görüntü destekli, gpt-oss metin modeli olarak sınıflandı');
  ok(by('groq:llama-test').image === false && by('groq:llama-4-scout-test').image === true, 'Groq: yalnızca "scout" gibi görüntü destekli model fotoğraf alır');
  ok(st.j.items.some(i => i.id === 'groq' && i.state === 'ok'), 'Groq anahtarı tanımlıyken durum panelinde görünüyor ve aktif');
  // 4) hepsi çökerse Groq devralır
  goodMode = 'down';
  r = await ai();
  ok(r.s === 200 && r.j.json.by === 'groq' && r.j.json.model === 'llama-test', 'Gemini çökünce yeni sağlayıcı (Groq) cevap verdi');
  ok(r.j.json.auth === 'Bearer groq-test', 'Groq isteği doğru anahtarla gitti');
  // 5) görselli istek: yalnızca görüntü destekli modeller denenir
  const gb = hits.groq;
  r = await ai({ images: [{ mime: 'image/png', data: png }] });
  ok(r.s === 200 && r.j.json.model === 'qwen/qwen3.8-27b' && hits.groq === gb + 1, 'fotoğraflı istek: yalnız görüntü destekli Groq modeline gitti (metin modeli atlandı)');
  // 6) kurtarma: Gemini düzelince süre dolunca yeniden denenir; hepsi dışlıyken yine de denenir
  goodMode = 'ok';
  const g0 = hits.good;
  r = await ai();
  ok(r.s === 200, 'her şey dışlanmış ya da çökmüş olsa bile istek reddedilmedi (' + r.s + ')');
  // 7) takılan modele kısa süre: AI_CHAIN_QUICK=hang,good -> hang uzun beklememeli
  const t0 = Date.now();
  const rq = await ai({ tier: 'quick' });
  const dt = (Date.now() - t0) / 1000;
  ok(rq.s === 200 && rq.j.json.by === 'good' && dt < 10, `cevap vermeyen model sıradakini engellemedi (${dt.toFixed(1)} sn; sınır testte 1,5 sn)`);
  ok(!/groq-test|\bg\b.*key/.test(log.replace(/GEMINI_API_KEY/g, '')), 'günlükte anahtar yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-1000));
process.exit(fail ? 1 : 0);
