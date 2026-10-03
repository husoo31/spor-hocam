// Referans veritabanı testleri (sahte USDA ve Open Food Facts sunucularıyla). Çalıştır: node test/ref.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapUsdaNutrients, mapOffNutriments, pickBest, compare } from '../refdb.js';


async function waitReady(port, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return; } catch (e) { /* henüz açılmadı */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('sunucu başlamadı');
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const near = (a, b, t = 0.02) => Math.abs(a - b) <= t;

/* ---- USDA'nın gerçek yanıt biçiminde örnek (SR Legacy: kızarmış/fırınlanmış tavuk göğsü, 100 g) ---- */
const N = (id, name, unit, value) => ({ nutrientId: id, nutrientName: name, nutrientNumber: String(id), unitName: unit, value });
const chickenCooked = [
  N(1003, 'Protein', 'G', 31.02), N(1004, 'Total lipid (fat)', 'G', 3.57), N(1005, 'Carbohydrate, by difference', 'G', 0),
  N(1008, 'Energy', 'KCAL', 165), N(1062, 'Energy', 'kJ', 690), N(2047, 'Energy (Atwater General Factors)', 'KCAL', 164),
  N(1079, 'Fiber, total dietary', 'G', 0), N(2000, 'Sugars, total including NLEA', 'G', 0),
  N(1087, 'Calcium, Ca', 'MG', 15), N(1089, 'Iron, Fe', 'MG', 1.04), N(1090, 'Magnesium, Mg', 'MG', 29), N(1091, 'Phosphorus, P', 'MG', 228),
  N(1092, 'Potassium, K', 'MG', 256), N(1093, 'Sodium, Na', 'MG', 74), N(1095, 'Zinc, Zn', 'MG', 1), N(1103, 'Selenium, Se', 'UG', 27.6),
  N(1162, 'Vitamin C, total ascorbic acid', 'MG', 0), N(1165, 'Thiamin', 'MG', 0.07), N(1166, 'Riboflavin', 'MG', 0.114), N(1167, 'Niacin', 'MG', 13.712),
  N(1175, 'Vitamin B-6', 'MG', 0.6), N(1190, 'Folate, DFE', 'UG', 4), N(1178, 'Vitamin B-12', 'UG', 0.34), N(1106, 'Vitamin A, RAE', 'UG', 6),
  N(1109, 'Vitamin E (alpha-tocopherol)', 'MG', 0.27), N(1114, 'Vitamin D (D2 + D3)', 'UG', 0.1), N(1185, 'Vitamin K (phylloquinone)', 'UG', 0.3),
  N(1253, 'Cholesterol', 'MG', 85), N(1258, 'Fatty acids, total saturated', 'G', 1.01), N(1292, 'Fatty acids, total monounsaturated', 'G', 1.24),
  N(1293, 'Fatty acids, total polyunsaturated', 'G', 0.77), N(1404, '18:3 n-3 c,c,c (ALA)', 'G', 0.03), N(1272, '22:6 n-3 (DHA)', 'G', 0.01),
  N(1176, 'Vitamin B-12, added', 'UG', 0), N(1180, 'Choline, total', 'MG', 85),
];
const m = mapUsdaNutrients(chickenCooked).per100;
ok(m.kcal === 165 && m.protein === 31.02 && m.fat === 3.57 && m.carbs === 0, 'USDA: kcal (1008 öncelikli, kJ yok sayıldı) ve makrolar');
ok(m.sodium === 74 && m.potassium === 256 && m.calcium === 15 && m.iron === 1.04, 'USDA: mineraller mg olarak');
ok(near(m.selenium, 27.6) && near(m.folate, 4) && near(m.b12, 0.34) && near(m.vitD, 0.1) && near(m.vitK, 0.3) && near(m.vitA, 6), 'USDA: µg değerleri mcg olarak (selenyum, folat, B12, D, K, A)');
ok(m.b6 === 0.6 && m.b3 === 13.712 && m.vitE === 0.27 && m.choline === 85 && m.chol === 85, 'USDA: B vitaminleri, E, kolin, kolesterol');
ok(near(m.sat, 1.01) && near(m.mono, 1.24) && near(m.poly, 0.77), 'USDA: yağ türleri');
ok(near(m.omega3, 0.04, 0.001), 'USDA: omega-3 = ALA + DHA toplamı');
ok(m.b12 === 0.34, 'USDA: "Vitamin B-12, added" gerçek B12\'yi ezmedi');
const fnd = mapUsdaNutrients([N(1003, 'Protein', 'G', 20), N(1004, 'Total lipid (fat)', 'G', 5), N(1005, 'Carbohydrate, by difference', 'G', 10)]);
ok(fnd.kcalDerived && fnd.per100.kcal === Math.round(80 + 40 + 45), 'USDA: enerji yoksa makrolardan türetildi ve işaretlendi');

/* ---- Open Food Facts: *_100g alanları gram cinsinden ---- */
const o = mapOffNutriments({ 'energy-kcal_100g': 520, proteins_100g: 6, carbohydrates_100g: 60, fat_100g: 28, 'saturated-fat_100g': 10, sugars_100g: 40,
  sodium_100g: 0.1, calcium_100g: 0.12, 'vitamin-d_100g': 0.000005, 'vitamin-b12_100g': 0.0000024, iron_100g: 0.0018, 'vitamin-c_100g': 0.045, fiber_100g: 3.5 });
ok(o.kcal === 520 && o.protein === 6 && o.carbs === 60 && o.fat === 28, 'OFF: makrolar');
ok(near(o.sodium, 100) && near(o.calcium, 120) && near(o.iron, 1.8) && near(o.vitC, 45), 'OFF: gram → mg dönüşümü (sodyum, kalsiyum, demir, C)');
ok(near(o.vitD, 5) && near(o.b12, 2.4), 'OFF: gram → mcg dönüşümü (D, B12)');
const o2 = mapOffNutriments({ 'energy-kj_100g': 836, proteins_100g: 1, carbohydrates_100g: 10, fat_100g: 2, salt_100g: 1.25 });
ok(near(o2.kcal, 199.8, 0.5) && near(o2.sodium, 500, 1), 'OFF: kJ → kcal ve tuzdan sodyum');
ok(mapOffNutriments({ 'vitamin-a_100g': 0.0008 }).vitA === undefined, 'OFF: A vitamini (birim belirsiz) bilerek alınmıyor');

/* ---- eşleştirme ---- */
const cooked = { source: 'usda', id: '1', name: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } };
const raw = { source: 'usda', id: '2', name: 'Chicken, broilers or fryers, breast, meat only, raw', per100: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 } };
const fried = { source: 'usda', id: '3', name: 'Chicken, breast, fried', per100: { kcal: 220, protein: 30, carbs: 2, fat: 10 } };
let b = pickBest([raw, fried, cooked], { kcal: 160, protein: 30, carbs: 0, fat: 4 }, ['chicken', 'breast', 'cooked']);
ok(b.id === '1' && b.accepted, 'eşleştirme: yapay zekâ "pişmiş" dediğinde pişmiş tavuk seçildi, kabul edildi');
b = pickBest([cooked, raw, fried], { kcal: 118, protein: 22, carbs: 0, fat: 2.5 }, ['chicken', 'breast']);
ok(b.id === '2' && b.accepted, 'eşleştirme: yapay zekâ çiğ değer verince çiğ tavuk seçildi');
b = pickBest([cooked], { kcal: 90, protein: 5, carbs: 15, fat: 1 }, ['cake']);
ok(b && b.accepted === false && b.kcalErr > 0.25, 'eşleştirme: uyuşmayan aday kabul EDİLMEDİ (yalnızca öneri)');
ok(pickBest([], { kcal: 100 }, []) === null, 'eşleştirme: aday yoksa null');
ok(compare({ kcal: 100, protein: 10, carbs: 10, fat: 3 }, null) === null, 'karşılaştırma: tahmin yoksa null');

/* ---- sunucu uçtan uca (sahte USDA + OFF) ---- */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shr-'));
const hits = { usda: 0, off: 0, offSearch: 0 };
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname.endsWith('/foods/search')) {
    hits.usda++;
    if (u.searchParams.get('api_key') !== 'usda-key') { res.writeHead(403); return res.end('{}'); }
    const q = u.searchParams.get('query');
    if (!/dataType=Foundation,SR%20Legacy/.test(req.url)) { res.writeHead(400); return res.end('{}'); }
    let foods = [];
    if (q.includes('chicken')) foods = [
      { fdcId: 100, description: 'Chicken, broilers or fryers, breast, meat only, raw', dataType: 'SR Legacy', foodNutrients: [N(1003, 'Protein', 'G', 22.5), N(1004, 'Total lipid (fat)', 'G', 2.62), N(1005, 'Carbohydrate, by difference', 'G', 0), N(1008, 'Energy', 'KCAL', 120)] },
      { fdcId: 101, description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', dataType: 'SR Legacy', foodNutrients: chickenCooked },
    ];
    if (q.includes('cake')) foods = [{ fdcId: 200, description: 'Cake, white, prepared', dataType: 'SR Legacy', foodNutrients: [N(1003, 'Protein', 'G', 5), N(1004, 'Total lipid (fat)', 'G', 8), N(1005, 'Carbohydrate, by difference', 'G', 54), N(1008, 'Energy', 'KCAL', 307)] }];
    res.writeHead(200); return res.end(JSON.stringify({ foods }));
  }
  if (/^\/api\/v2\/product\/(\d+)\.json$/.test(u.pathname)) {
    hits.off++;
    if (!/OFF_UA|SporHocam/.test(req.headers['user-agent'] || '')) { res.writeHead(400); return res.end('{}'); }
    const code = u.pathname.match(/product\/(\d+)/)[1];
    if (code === '8690000000017') { res.writeHead(200); return res.end(JSON.stringify({ status: 1, product: { code, product_name: 'Çikolatalı Gofret', brands: 'Ülker, Ulker', quantity: '36 g', serving_quantity: 36,
      nutriments: { 'energy-kcal_100g': 520, proteins_100g: 6, carbohydrates_100g: 60, fat_100g: 28, 'saturated-fat_100g': 10, sugars_100g: 40, sodium_100g: 0.1, calcium_100g: 0.12, 'vitamin-d_100g': 0.000005 } } })); }
    if (code === '0036000291452') { res.writeHead(200); return res.end(JSON.stringify({ status: 1, product: { code, product_name: 'Test UPC', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1, carbohydrates_100g: 20, fat_100g: 2 } } })); }
    res.writeHead(404); return res.end(JSON.stringify({ status: 0 }));
  }
  if (u.pathname === '/cgi/search.pl') {
    hits.offSearch++;
    res.writeHead(200); return res.end(JSON.stringify({ products: [{ code: '1', product_name: 'Çikolatalı Gofret', brands: 'Ülker', nutriments: { 'energy-kcal_100g': 515, proteins_100g: 6, carbohydrates_100g: 59, fat_100g: 28 } }] }));
  }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => mock.listen(18071, r));
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '18070', DATA_DIR: dir, INVITE_CODE: 'k', USDA_API_KEY: 'usda-key', USDA_BASE: 'http://127.0.0.1:18071', OFF_BASE: 'http://127.0.0.1:18071',
    OFF_SEARCH_GAP_MS: '50', OFF_PRODUCT_GAP_MS: '10', OFF_CONTACT: 'OFF_UA test' } });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await waitReady(18070);
const base = 'http://127.0.0.1:18070'; let cookie = '';
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) { /* boş */ }
  return { s: r.status, j };
};
try {
  ok((await call('GET', '/api/me')).j.config.ref.usda === true, '/me: USDA etkin');
  ok((await call('POST', '/api/lookup', { items: [] })).s === 401, 'oturumsuz arama reddedildi');
  await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345', invite: 'k', consent: true });
  let r = await call('POST', '/api/lookup', { items: [
    { ix: 0, name: 'Izgara tavuk göğsü', search: 'chicken breast cooked roasted', ai: { kcal: 160, protein: 30, carbs: 0, fat: 4 } },
    { ix: 1, name: 'Baklava', search: 'cake', ai: { kcal: 90, protein: 5, carbs: 15, fat: 1 } },
    { ix: 2, name: 'Menemen', search: null, ai: { kcal: 110, protein: 6, carbs: 5, fat: 8 } },
    { ix: 3, name: 'Ülker Çikolatalı Gofret', brand: 'Ülker Çikolatalı Gofret', ai: { kcal: 500, protein: 6, carbs: 60, fat: 27 } },
    { ix: 4, name: 'X', barcode: '8690000000017' },
  ] });
  const R = r.j.results;
  ok(r.s === 200 && R[0].ref.id === '101' && R[0].ref.accepted && R[0].ref.per100.sodium === 74, 'lookup: pişmiş tavuk USDA\'dan kabul edildi (cooked, sodyum 74 mg)');
  ok(R[0].ref.per100.vitD === 0.1 && R[0].ref.per100.b12 === 0.34, 'lookup: mikro besinler USDA\'dan geldi');
  ok(R[1].ref && R[1].ref.accepted === false && R[1].ref.id === '200', 'lookup: uyuşmayan USDA adayı öneri olarak döndü, kabul edilmedi');
  ok(R[2].ref === null, 'lookup: aramasız (Türk yemeği) kalem atlandı');
  ok(R[3].ref && R[3].ref.source === 'off' && R[3].ref.accepted, 'lookup: markalı ürün Open Food Facts aramasıyla eşleşti');
  ok(R[4].ref.accepted && R[4].ref.per100.sodium === 100 && R[4].ref.per100.calcium === 120 && R[4].ref.per100.vitD === 5, 'lookup: barkod doğrudan kabul, gram → mg/mcg doğru');
  const before = { ...hits };
  r = await call('POST', '/api/lookup', { items: [{ ix: 0, name: 'tavuk', search: 'chicken breast cooked roasted', ai: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } }] });
  ok(r.j.results[0].ref.accepted && hits.usda === before.usda, 'önbellek: aynı arama USDA\'ya ikinci kez gitmedi');
  r = await call('POST', '/api/lookup', { items: [{ ix: 0, name: 'tavuk', search: 'chicken breast cooked roasted', ai: { kcal: 120, protein: 22, carbs: 0, fat: 2.6 } }] });
  ok(r.j.results[0].ref.id === '100' && r.j.results[0].ref.accepted && hits.usda === before.usda, 'önbellek: aynı adaylar farklı tahminle yeniden puanlandı (çiğ tavuk seçildi)');

  r = await call('GET', '/api/barcode/8690000000017');
  ok(r.s === 200 && r.j.product.name === 'Çikolatalı Gofret' && r.j.product.brand === 'Ülker' && r.j.product.servingG === 36 && r.j.product.per100.kcal === 520, 'barkod: ürün adı, marka, porsiyon (36 g) ve değerler');
  r = await call('GET', '/api/barcode/036000291452');
  ok(r.s === 200 && r.j.product.id === '0036000291452', 'barkod: 12 haneli UPC-A başına 0 eklenmiş EAN-13 olarak bulundu');
  r = await call('GET', '/api/barcode/1234567890123');
  ok(r.s === 404 && /bulunamadı/.test(r.j.error), 'barkod: bulunamayan ürün → Türkçe 404 mesajı');
  const c1 = hits.off; await call('GET', '/api/barcode/1234567890123');
  ok(hits.off === c1, 'barkod: bulunamayan sonuç da önbelleğe alındı');
  ok((await call('GET', '/api/barcode/abc')).s === 404, 'barkod: geçersiz biçim reddedildi');
  ok(!/usda-key/.test(log), 'günlükte USDA anahtarı yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log);
process.exit(fail ? 1 : 0);
