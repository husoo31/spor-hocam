// Yapay zekâsız yedek hesaplayıcı testleri. Çalıştır: node test/offline.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalFoods, ALIASES, parseItem, parseSegments, norm } from '../localfoods.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const near = (a, b, t) => Math.abs(a - b) <= t;
const L = createLocalFoods({ file: path.join(root, 'localdata/foods.json') });

/* ---- veri ---- */
const st = L.stats();
ok(st.foods > 7000 && /USDA/.test(st.source), `yerel tablo yüklendi: ${st.foods} besin (${st.source})`);
const missing = ALIASES.filter(a => !L.findFood(a.q)).map(a => a.k[0]);
ok(missing.length === 0, `tüm ${ALIASES.length} Türkçe eşleme gerçek bir USDA kaydına çözülüyor` + (missing.length ? ' → eksik: ' + missing.join(', ') : ''));

/* ---- yazı çözümleme ---- */
ok(norm('Izgara TAVUK Göğsü') === 'izgara tavuk gogsu', 'Türkçe karakterler ve büyük harf düzeltildi');
ok(JSON.stringify(parseSegments('2 yumurta, 1 dilim ekmek ve süt + bal')) === JSON.stringify(['2 yumurta', '1 dilim ekmek', 'süt', 'bal']), 'metin kalemlere bölündü (virgül, "ve", "+")');
let p = parseItem('iki buçuk dilim ekmek'); ok(p.qty === 2.5 && p.unit.k === 'dilim' && p.name === 'ekmek', '"iki buçuk dilim ekmek" → 2,5 dilim');
p = parseItem('yarım muz'); ok(p.qty === 0.5 && p.name === 'muz', '"yarım muz" → 0,5');
p = parseItem('250g tavuk'); ok(p.qty === 250 && p.unit.k === 'g', 'yapışık yazım: "250g"');
p = parseItem('yumurta 2 adet'); ok(p.qty === 2 && p.unit.k === 'adet' && p.name === 'yumurta', 'sayı sonda: "yumurta 2 adet"');
p = parseItem('1 su bardağı süt'); ok(p.unit.key === 'su bardagi' && p.name === 'sut' && p.shown === 'süt', 'iki kelimeli birim; görünen ad Türkçe karakterli');

/* ---- hesap doğruluğu (değerler USDA SR Legacy'den; elle hesaplanan beklenenle karşılaştırılır) ---- */
const kcal = i => i.per100.kcal * i.g / 100, prot = i => i.per100.protein * i.g / 100;
let r = L.estimate('2 yumurta, 1 dilim ekmek, bir bardak süt');
ok(r.items.length === 3 && r.unmatched.length === 0, 'üç kalem de bulundu');
ok(near(kcal(r.items[0]), 155, 1) && near(r.items[0].g, 100, 0.1), '2 yumurta = 100 g ≈ 155 kcal');
ok(near(r.items[2].g, 244, 1) && near(kcal(r.items[2]), 149, 2), '1 bardak (200 ml) süt ≈ 244 g ≈ 149 kcal (USDA "cup" ölçüsünden)');
r = L.estimate('150 g ızgara tavuk göğsü ve 200 g pilav');
ok(near(kcal(r.items[0]), 248, 1) && near(prot(r.items[0]), 46.5, 0.3), '150 g tavuk göğsü ≈ 248 kcal, 46,5 g protein');
ok(near(kcal(r.items[1]), 260, 2), '200 g pilav ≈ 260 kcal');
r = L.estimate('1 yemek kaşığı zeytinyağı'); ok(near(kcal(r.items[0]), 119, 2), '1 yemek kaşığı zeytinyağı ≈ 119 kcal');
r = L.estimate('3 dilim pizza ve kola'); ok(r.items.length === 2 && near(r.items[0].g, 300, 0.1), 'pizza (3 dilim) ve kola birlikte işlendi');
r = L.estimate('1 muz'); ok(near(r.items[0].g, 118, 0.5), '1 muz ≈ 118 g');

/* ---- uydurmama: bilinmeyen / karışık yemek ---- */
r = L.estimate('menemen'); ok(r.items.length === 0 && r.unmatched.includes('Menemen'), 'tabloda olmayan yemek (menemen) için değer UYDURULMADI');
r = L.estimate('1 kase mercimek çorbası'); ok(r.items.length === 0 && r.unmatched.length === 1, '"mercimek çorbası" mercimekle karıştırılmadı (hazır yemek)');
r = L.estimate('domatesli makarna'); ok(r.items.length === 0, 'karışık yemek ("domatesli makarna") tek besine indirgenmedi');
r = L.estimate('tavuk sote'); ok(r.items.length === 0, '"tavuk sote" düz tavuk sayılmadı');
r = L.estimate('menemen ve 2 dilim ekmek'); ok(r.items.length === 1 && r.unmatched.length === 1, 'bilinenler hesaplandı, bilinmeyen ayrı listelendi');
r = L.estimate('şu bilinmeyen ürün'); ok(r.items.length === 0 && r.unmatched.length === 1, 'bilinmeyen ürün: öğe yok');
r = L.estimate(''); ok(r.items.length === 0 && r.unmatched.length === 0, 'boş metin sorunsuz');
r = L.estimate('yumurta'); ok(/varsayıldı/.test(r.items[0].note) && r.items[0].conf === 'düşük', 'varsayımlar ve düşük güven notta açıkça belirtildi');

/* ---- HTTP: hiçbir yapay zekâ/ağ anahtarı olmadan çalışır ---- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-off-')), APP = 18110;
const env = { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'k' };
for (const k of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY', 'USDA_API_KEY']) delete env[k];
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }
const jar = { c: '' };
async function call(method, p2, body, auth = true) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' };
  if (auth && jar.c) headers.Cookie = jar.c;
  const res = await fetch(`http://127.0.0.1:${APP}${p2}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0];
  let j = null; try { j = await res.json(); } catch (e) { /* gövde yok */ }
  return { s: res.status, j };
}
try {
  ok((await call('POST', '/api/offline-estimate', { text: 'yumurta' }, false)).s === 401, 'giriş yapmadan yedek uç reddedildi (401)');
  ok((await call('POST', '/api/register', { username: 'offtest', password: 'Zx9!kLmQ2pRtV7', invite: 'k' })).s === 200, 'kayıt oluşturuldu');
  const ai = await call('POST', '/api/ai', { prompt: 'merhaba', cache: false });
  ok(ai.s === 503 && ai.j.code === 'ai_disabled', 'yapay zekâ kapalı (anahtar yok): /api/ai 503 ai_disabled');
  const e = await call('POST', '/api/offline-estimate', { text: '2 yumurta, 1 dilim ekmek ve menemen' });
  ok(e.s === 200 && e.j.items.length === 2 && e.j.unmatched[0] === 'Menemen', 'yapay zekâ yokken yedek uç 2 kalemi hesapladı, menemeni "bulunamadı" dedi');
  ok(near(e.j.items[0].per100.kcal, 155, 1) && e.j.items[0].per100.vitD > 0, 'dönen değerlerde vitamin/mineral alanları da var (tam USDA kaydı)');
  ok((await call('POST', '/api/offline-estimate', { text: '   ' })).s === 400, 'boş metin 400');
  const t0 = Date.now(); await call('POST', '/api/offline-estimate', { text: '3 yumurta ve pilav' }); ok(Date.now() - t0 < 500, 'yanıt hızlı (' + (Date.now() - t0) + ' ms), dış ağ çağrısı yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log.slice(-800));
process.exit(fail ? 1 : 0);
