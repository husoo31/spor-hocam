// NVIDIA (DeepSeek) sağlayıcı testi: sahte akışlı sunucuyla. Çalıştır: node test/nvidia.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-nv-'));
const MOCK = 18091, APP = 18090;
const seen = { nv: [], gem: 0 };
let nvMode = 'ok';

const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (req.url.includes(':generateContent')) { seen.gem++; res.writeHead(500); return res.end('{}'); } // Gemini hep arızalı
    if (req.url === '/v1/chat/completions') {
      const body = JSON.parse(b);
      seen.nv.push({ auth: req.headers.authorization, model: body.model, stream: body.stream, prompt: body.messages[0].content });
      if (req.headers.authorization !== 'Bearer nv-test') { res.writeHead(401); return res.end('{}'); }
      if (nvMode === 'ratelimit') { res.writeHead(429); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const ev = o => `data: ${JSON.stringify(o)}\n\n`;
      const parts = [
        ev({ choices: [{ delta: { role: 'assistant', reasoning_content: 'DÜŞÜNCE: kullanıcı yumurta soruyor' } }] }),
        ev({ choices: [{ delta: { reasoning_content: ' ve json istiyor' } }] }),
        ev({ choices: [{ delta: { content: '{"items":[{"name":"yumu' } }] }),
        ev({ choices: [{ delta: { content: 'rta","g":50}]}' } }] }),
        'data: [DONE]\n\n',
      ];
      const all = parts.join('');
      // parçaları satır ortasından böl: akış okuyucunun arabelleğini sınar
      const mid = Math.floor(all.length / 2);
      res.write(all.slice(0, mid));
      setTimeout(() => { res.write(all.slice(mid)); res.end(); }, 60);
      return;
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => mock.listen(MOCK, r));
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k', GEMINI_API_KEY: 'g', GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`,
    NVIDIA_API_KEY: 'nv-test', NVIDIA_BASE: `http://127.0.0.1:${MOCK}/v1`, AI_CHAIN: 'gemini:g1,nvidia:deepseek-ai/test-model', AI_DAILY_LIMIT_PER_USER: '50' },
});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const jar = { c: '' };
async function call(method, p, body) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' };
  if (jar.c) headers.Cookie = jar.c;
  const r = await fetch(`http://127.0.0.1:${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* gövde yok */ }
  return { s: r.status, j };
}
try {
  ok((await call('POST', '/api/register', { username: 'nvtest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' })).s === 200, 'kayıt oluşturuldu');
  ok(/zincir: gemini:g1 → nvidia:deepseek-ai\/test-model/.test(log), 'başlangıç günlüğünde zincirde nvidia görünüyor');

  // 1) Gemini 500 verir -> NVIDIA devralır; düşünme metni sızmaz; parçalı JSON birleşir
  const r1 = await call('POST', '/api/ai', { prompt: 'yumurta json ver', json: true, cache: false });
  ok(r1.s === 200 && r1.j.json && r1.j.json.items && r1.j.json.items[0].name === 'yumurta', 'Gemini arızalıyken NVIDIA cevap verdi, parçalı akış birleşti');
  ok(r1.j && r1.j.model === 'nvidia:deepseek-ai/test-model', 'cevabı veren model doğru raporlandı: ' + (r1.j && r1.j.model));
  ok(!JSON.stringify(r1.j).includes('DÜŞÜNCE'), 'düşünme (reasoning) metni cevaba karışmadı');
  const q = seen.nv[0];
  ok(q && q.auth === 'Bearer nv-test' && q.model === 'deepseek-ai/test-model' && q.stream === true, 'istek doğru anahtar, model ve stream=true ile gitti');
  ok(seen.gem >= 1, 'önce Gemini denendi (zincir sırası korundu)');

  // 2) Görselli istek: NVIDIA (metin modeli) atlanır
  const before = seen.nv.length;
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r2 = await call('POST', '/api/ai', { prompt: 'bu görselde ne var', json: true, cache: false, images: [{ mime: 'image/png', data: png }] });
  ok(r2.s !== 200, 'görselli istek, görselsiz modele gönderilmedi (HTTP ' + r2.s + ')');
  ok(seen.nv.length === before, 'NVIDIA görselli istekte hiç çağrılmadı');

  // 3) 429 -> anlamlı hata
  nvMode = 'ratelimit';
  const r3 = await call('POST', '/api/ai', { prompt: 'tekrar dene', json: true, cache: false });
  ok(r3.s !== 200, 'NVIDIA 429 verince istek başarısız sayıldı (HTTP ' + r3.s + ')');
  ok(/nvidia:deepseek-ai\/test-model -> rate_limited/.test(log), '429 günlüğe rate_limited olarak yazıldı');
  nvMode = 'ok';

  // 4) yönetim durumu
  const ov = await call('GET', '/api/admin/overview');
  ok(ov.s === 200 && JSON.stringify(ov.j).includes('"nvidiaKey":true'), 'yönetim paneli durumunda nvidiaKey: true');
  ok(!log.includes('nv-test'), 'günlükte NVIDIA anahtarı yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-1200));
process.exit(fail ? 1 : 0);
