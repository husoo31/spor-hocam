// Ürün kataloğu: toplu veri → SQLite FTS5, Türkçe arama, restoran menüleri, sunucu ucu. Çalıştır: node test/catalog.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openCatalog, searchCatalog, catalogInfo, offRecord, parseMenuCsv } from '../catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-catalog-'));

// Open Food Facts CSV'sinin (sekmeyle ayrılmış, gz) gerçek sütun adlarıyla küçük bir örneği
const H = ['code', 'product_name', 'generic_name', 'brands', 'countries_tags', 'serving_size', 'serving_quantity', 'nutriscore_grade', 'energy-kcal_100g', 'energy-kj_100g', 'proteins_100g', 'carbohydrates_100g', 'sugars_100g', 'fiber_100g', 'fat_100g', 'saturated-fat_100g', 'sodium_100g', 'salt_100g'];
const row = o => H.map(h => o[h] ?? '').join('\t');
const rows = [
  { code: '8690504010001', product_name: 'Çikolatalı Gofret', brands: 'Ülker,Ülker Çikolata', countries_tags: 'en:turkey', serving_size: '1 adet (38 g)', serving_quantity: '38', nutriscore_grade: 'e', 'energy-kcal_100g': '520', 'proteins_100g': '6', 'carbohydrates_100g': '62', 'sugars_100g': '35', 'fiber_100g': '2', 'fat_100g': '27', 'saturated-fat_100g': '15', 'sodium_100g': '0.1' },
  { code: '8690000000002', product_name: 'Ayran', brands: 'Sütaş', countries_tags: 'en:turkey,en:germany', serving_quantity: '200', 'energy-kcal_100g': '32', 'proteins_100g': '2', 'carbohydrates_100g': '2.6', 'fat_100g': '1.6', 'salt_100g': '0.5' },
  { code: '8690000000003', product_name: 'Dana Kıymalı Mantı', brands: 'Torku', countries_tags: 'en:turkey', 'energy-kj_100g': '1050', 'proteins_100g': '9', 'carbohydrates_100g': '40', 'fat_100g': '9' }, // yalnızca kJ var
  { code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero', countries_tags: 'en:france', 'energy-kcal_100g': '539', 'proteins_100g': '6.3', 'carbohydrates_100g': '57.5', 'fat_100g': '30.9', 'sugars_100g': '56.3' },
  { code: '8690000000004', product_name: 'Kalorisiz Hata', countries_tags: 'en:turkey', 'proteins_100g': '1', 'carbohydrates_100g': '1', 'fat_100g': '1' }, // kcal yok
  { code: '8690000000005', product_name: 'İmkansız Ürün', countries_tags: 'en:turkey', 'energy-kcal_100g': '300', 'proteins_100g': '60', 'carbohydrates_100g': '60', 'fat_100g': '60' }, // makrolar 100 g'ı aşıyor
  { code: '8690000000006', product_name: '', countries_tags: 'en:turkey', 'energy-kcal_100g': '100', 'proteins_100g': '1', 'carbohydrates_100g': '1', 'fat_100g': '1' }, // adsız
  { code: '123', product_name: 'Kısa Kod', countries_tags: 'en:turkey', 'energy-kcal_100g': '100', 'proteins_100g': '1', 'carbohydrates_100g': '1', 'fat_100g': '1' },
  { code: '8690504010001', product_name: 'Çikolatalı Gofret KOPYA', countries_tags: 'en:turkey', 'energy-kcal_100g': '1', 'proteins_100g': '1', 'carbohydrates_100g': '1', 'fat_100g': '1' }, // aynı barkod
  { code: '8690000000007', product_name: 'Şekerli Hata', countries_tags: 'en:turkey', 'energy-kcal_100g': '100', 'proteins_100g': '2', 'carbohydrates_100g': '20', 'sugars_100g': '45', 'fat_100g': '1' }, // şeker > karbonhidrat
];
rows.push(
  { code: '8690000000008', product_name: 'Yağsız Veri Ürün', countries_tags: 'en:turkey', 'energy-kcal_100g': '120', 'proteins_100g': '4', 'carbohydrates_100g': '20' }, // yağ eksik: esnek modda alınır
  { code: '8690000000009', product_name: 'Yalnız Protein Ürün', countries_tags: 'en:turkey', 'energy-kcal_100g': '120', 'proteins_100g': '4' }, // iki makro eksik: hep elenir
  { code: '8690000000010', product_name: 'Yalnız Kalori Ürün', countries_tags: 'en:turkey', 'energy-kcal_100g': '120' }); // üç makro eksik: hep elenir
for (let i = 0; i < 3000; i++) rows.push({ code: String(8691000000000 + i), product_name: `Dolgu Ürün ${i} Peynir`, brands: 'Marka' + (i % 7), countries_tags: 'en:turkey', 'energy-kcal_100g': '250', 'proteins_100g': '10', 'carbohydrates_100g': '10', 'fat_100g': '20' });
const csvPath = path.join(tmp, 'off.csv.gz');
fs.writeFileSync(csvPath, zlib.gzipSync([H.join('\t'), ...rows.map(row)].join('\n') + '\n'));
fs.mkdirSync(path.join(tmp, 'menus'));
fs.writeFileSync(path.join(tmp, 'menus', 'zincir.csv'), [
  '# yorum satırı', 'restoran;ürün;porsiyon_g;kcal;protein;karbonhidrat;yağ;şeker;lif;doymuş_yağ;sodyum_mg',
  'Test Burger;Büyük Burger;220;550;25;45;28;9;3;10;900',
  'Test Burger;Patates Kızartması (orta);110;340;4;44;16;0,5;4;2;250',
  'Test Burger;Tutarsız Ürün;100;900;1;1;1;;;;', // kalori makrolarla uyuşmuyor
  'Test Burger;Porsiyonsuz;;300;10;10;10;;;;'].join('\n'));
const dbFile = path.join(tmp, 'catalog.db');
const build = (...a) => execFileSync('node', ['--disable-warning=ExperimentalWarning', 'tools/build-catalog.mjs', ...a], { cwd: root, env: { ...process.env, DATA_DIR: tmp } }).toString();

// kayıt süzgeci
const g = o => k => o[k];
ok(offRecord(g(rows[0]), { countries: ['turkey'], all: false })?.brand === 'Ülker', 'marka alanı: ilk marka alınır ("Ülker,Ülker Çikolata" → Ülker)');
ok(offRecord(g(rows[3]), { countries: ['turkey'], all: false }) === null && offRecord(g(rows[3]), { countries: ['turkey'], all: true })?.name === 'Nutella', 'ülke süzgeci: --all olmadan Fransa ürünü yok, --all ile var');
ok(Math.round(offRecord(g(rows[2]), { countries: ['turkey'], all: false }).kcal) === 251, 'yalnızca kJ varsa kcal\'a çevrilir (1050 kJ ≈ 251 kcal)');
ok(Math.round(offRecord(g(rows[1]), { countries: ['turkey'], all: false }).sodium) === 200, 'tuzdan sodyum (0,5 g tuz → 200 mg sodyum)');
ok([4, 5, 6, 7].every(i => offRecord(g(rows[i]), { countries: ['turkey'], all: true }) === null), 'kalorisiz, imkânsız makrolu, adsız ve kısa barkodlu satırlar elenir');
ok(offRecord(g(rows[9]), { countries: ['turkey'], all: true }).sugar === null, 'şeker karbonhidrattan fazlaysa tutarsız alan atılır');

// esnek mod: tek makrosu eksik ürün (kalorisi var) alınır, boş kalır; iki eksik hep elenir
const T = { countries: ['turkey'], all: false };
ok(offRecord(g(rows[10]), T) === null && offRecord(g(rows[10]), { ...T, loose: true })?.fat === null && offRecord(g(rows[10]), { ...T, loose: true })?.protein === 4, 'sıkı modda tek makrosu eksik ürün elenir, esnek modda alınır ve eksik değer boş (uydurulmaz)');
ok(offRecord(g(rows[11]), { ...T, loose: true }) === null && offRecord(g(rows[12]), { ...T, loose: true }) === null, 'iki ya da daha fazla makrosu eksik ürün esnek modda da elenir');

// menü CSV
const mc = parseMenuCsv(fs.readFileSync(path.join(tmp, 'menus', 'zincir.csv'), 'utf8'));
ok(mc.rows.length === 2 && mc.skipped === 2, 'menü CSV: 2 geçerli satır, 2 atlandı (tutarsız kalori, porsiyonsuz)');
ok(Math.abs(mc.rows[0].kcal - 250) < 0.01 && Math.abs(mc.rows[1].carbs - 40) < 0.01 && Math.abs(mc.rows[1].sugar - 0.45) < 0.01, 'porsiyon başına değerler 100 g\'a çevrilir (550 kcal / 220 g = 250; ondalık virgül)');

// kurulum aracı
const out1 = build('--src', csvPath, '--menus', path.join(tmp, 'menus'));
const out0 = build('--src', csvPath, '--strict', '--out', path.join(tmp, 'strict.db'));
const db = openCatalog(dbFile), info = catalogInfo(db);
ok(info.off === 3005 && info.menu === 2 && info.total === 3007 && info.scope === 'turkey', `katalog kuruldu (esnek, varsayılan): ${info.off} ürün + ${info.menu} menü (yinelenen barkod ve hatalı satırlar dışarıda)`);
ok(/Seçilen kapsamda etiketli ürün: 3\.011/.test(out1) && /Alınan: 3\.005 \(1 tanesinde bir makro eksik/.test(out1) && /adsız 1 · kalorisiz 1 · 2\+ makro eksik 2 · mantıksız değer 1 · kopya 1/.test(out1), 'araç neden elendiğini yazar: etiketli 3.011, alınan 3.005, adsız 1, kalorisiz 1, 2+ makro eksik 2, mantıksız 1, kopya 1');
ok(/Alınan: 3\.004/.test(out0) && /1\+ makro eksik 3/.test(out0), '--strict: dört değerin hepsi şart (3.004 ürün; 1+ makro eksik 3)');
ok(/Bitti/.test(out1) && !fs.existsSync(dbFile + '.tmp'), 'araç özet yazdı; geçici dosya kalmadı (atomik yer değiştirme)');

// Türkçe arama
const s = (q, n) => searchCatalog(db, q, n);
const yv = s('yagsiz veri')[0]; ok(yv && yv.per100.protein === 4 && yv.per100.fat === undefined && yv.per100.kcal === 120, 'eksik makrolu ürün aranınca bulunur; eksik alan yok (uydurma 0 değil)');
ok(s('ulker cikolatali')[0]?.name === 'Çikolatalı Gofret', 'Türkçe karakter katlama: "ulker cikolatali" → Ülker Çikolatalı Gofret');
ok(s('ÜLKER ÇİKOLATALI')[0]?.code === '8690504010001', 'büyük harf ve İ/ı: "ÜLKER ÇİKOLATALI" aynı ürünü bulur');
ok(s('ulk gof')[0]?.name === 'Çikolatalı Gofret', 'önek eşleşmesi: "ulk gof"');
ok(s('manti')[0]?.name === 'Dana Kıymalı Mantı' && s('kiymali')[0]?.name === 'Dana Kıymalı Mantı', '"manti" ve "kiymali" (ı→i) bulunur');
const bg = s('buyuk burger')[0]; ok(bg?.src === 'menu' && bg.restaurant === 'Test Burger' && Math.abs(bg.per100.kcal - 250) < 0.01 && bg.servingG === 220, 'restoran menüsü bulunur: porsiyon 220 g, 100 g başına 250 kcal');
ok(s('test burger').length === 2 && s('test burger').every(x => x.src === 'menu'), 'restoran adıyla arama menüdeki tüm ürünleri getirir');
ok(s('peynir', 5).length === 5 && s('peynir', 500).length === 50, 'limit: istenen kadar, en çok 50');
ok(s('olmayan urun xyz').length === 0 && s('').length === 0 && s('   ').length === 0, 'bulunamayan/boş arama boş liste');
ok(s('"; DROP TABLE foods; --').length === 0 && s('NEAR(a b) OR *').length === 0, 'özel karakterler/FTS sözdizimi güvenle işlenir (hata vermez)');
const ay = s('ayran')[0]; ok(ay.per100.kcal === 32 && ay.servingG === 200 && ay.brand === 'Sütaş' && ay.per100.sodium === 200, 'ürün alanları: 100 g değerleri, porsiyon, marka');
db.close();

// sunucu ucu
const PORT = 18320, base = `http://127.0.0.1:${PORT}`;
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: 'ignore', env: { ...process.env, PORT, DATA_DIR: tmp, INVITE_CODE: 'davet-kodu-123', PUSH_DISABLED: 'true' } });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) { /* bekle */ } await sleep(100); }
const jar = { c: '' };
const call = async (method, p, body) => { const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }; if (jar.c) headers.Cookie = jar.c; const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; let x = null; try { x = await r.json(); } catch (e) { /* boş */ } return { s: r.status, j: x }; };
try {
  ok((await call('GET', '/api/foods/search?q=ayran')).s === 401, 'oturumsuz arama 401');
  await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345-xyz', invite: 'davet-kodu-123', consent: true });
  let r = await call('GET', '/api/foods/search?q=' + encodeURIComponent('ülker çikolatalı'));
  ok(r.s === 200 && r.j.items[0]?.name === 'Çikolatalı Gofret' && r.j.catalog.total === 3007 && r.j.catalog.off === 3005, 'sunucu: arama + katalog bilgisi (3005 ürün + 2 menü)');
  r = await call('GET', '/api/foods/search?q=a'); ok(r.s === 200 && r.j.items.length === 0, '1 harflik arama boş döner');
  r = await call('GET', '/api/foods/search?q=' + encodeURIComponent('burger') + '&limit=1'); ok(r.j.items.length === 1 && r.j.items[0].src === 'menu', 'limit parametresi');
  // sıcak yenileme: katalogu --all ile yeniden kur, sunucuyu yeniden başlatmadan Nutella görünür
  ok((await call('GET', '/api/foods/search?q=nutella')).j.items.length === 0, 'varsayılan kapsamda Nutella (Fransa) yok');
  await sleep(1100); build('--src', csvPath, '--menus', path.join(tmp, 'menus'), '--all');
  r = await call('GET', '/api/foods/search?q=nutella'); ok(r.j.items[0]?.name === 'Nutella' && r.j.catalog.scope === 'dünya', 'katalog yenilenince sunucu yeniden başlamadan yeni dosyayı kullanır (--all: Nutella)');
  // katalog yoksa
  fs.rmSync(dbFile); r = await call('GET', '/api/foods/search?q=ayran'); ok(r.s === 200 && r.j.catalog === false && r.j.items.length === 0, 'katalog dosyası yoksa hata değil, catalog:false döner');
} finally { srv.kill(); }
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
