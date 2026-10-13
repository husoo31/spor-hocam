// İçecek tablosu testleri: marka + miktar tanıma, miktar hesabı ve emin olunmayan metnin yapay zekâya bırakılması. Çalıştır: node test/drinks.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(root, 'public/drinks-util.js'), 'utf8'))(m);
const { extract, DRINKS } = m.exports;
const kcal = it => it.per100.kcal * it.g / 100;

// kullanıcının örneği
let r = extract('250 ml beyaz monster enerji içeceği');
ok(r.items.length === 1 && r.rest === '', '"250 ml beyaz monster enerji içeceği" tek içecek kalemi olur, yapay zekâya metin kalmaz');
ok(r.items[0] && r.items[0].drink === 'monster-ultra' && r.items[0].g === 250, 'beyaz monster = Monster Ultra (şekersiz), 250 ml');
ok(r.items[0] && kcal(r.items[0]) < 10 && /Kafein ≈ 80 mg/.test(r.items[0].note), '250 ml beyaz monster ≈ 5 kcal ve ≈ 80 mg kafein');
r = extract('1 kutu monster');
ok(r.items[0] && r.items[0].drink === 'monster' && r.items[0].g === 500 && Math.round(kcal(r.items[0])) === 230, '1 kutu klasik Monster = 500 ml ≈ 230 kcal');
r = extract('red bull');
ok(r.items[0] && r.items[0].drink === 'redbull' && r.items[0].g === 250 && r.items[0].conf === 'düşük', 'miktarsız Red Bull: varsayılan 250 ml, güven düşük');
r = extract('Red Bull Sugarfree 250 ml');
ok(r.items[0] && r.items[0].drink === 'redbull-sf', 'Red Bull Sugarfree, şekerli olandan ayrılır');
r = extract('0,5 litre kola');
ok(r.items[0] && r.items[0].g === 500, 'ondalık virgüllü litre (0,5 litre) 500 ml olur');
r = extract('yarım litre portakal suyu');
ok(r.items[0] && r.items[0].g === 500, '"yarım litre" 500 ml olur');
r = extract('2 çay bardağı çay');
ok(r.items[0] && r.items[0].g === 200 && r.items[0].drink === 'cay', '"2 çay bardağı çay" = 200 ml çay (birim adı içecekle karışmaz)');
r = extract('coca cola zero 330ml');
ok(r.items[0] && r.items[0].drink === 'cola-zero' && r.items[0].g === 330, 'Coca-Cola Zero, şekerli kolayla karışmaz');

// karışık metin: içecek ayrılır, kalan metin yapay zekâya gider
r = extract('2 yumurta ve 250 ml beyaz monster, 2 dilim ekmek');
ok(r.items.length === 1 && r.rest === '2 yumurta, 2 dilim ekmek', 'yiyecekler korunur, yalnızca içecek tablodan hesaplanır: ' + JSON.stringify(r.rest));

// emin olunmayan her şey yapay zekâya bırakılır
for (const t of ['1 su bardağı pirinç', 'ayranlı pilav', 'kırmızı monster', 'mango loco monster', 'sütlü kahve', 'kolalı tavuk', 'çay 2 şeker', '2 yumurta']) {
  r = extract(t);
  ok(r.items.length === 0 && r.rest === t, `"${t}" tabloya alınmaz, yapay zekâya bırakılır`);
}
ok(extract('1 kutu kola', ['kola']).items.length === 0, 'kullanıcının kendi kayıtlı ürünü (aynı ad) tabloya göre öncelikli');
ok(extract('50000 ml kola').items.length === 0, 'olağandışı miktar (50 litre) reddedilir');

// ünlü içecekler
const one = (t, id, g) => { const x = extract(t); return x.items.length === 1 && x.rest === '' && x.items[0].drink === id && (g === undefined || x.items[0].g === g); };
ok(one('1 kutu burn', 'burn', 250), '1 kutu Burn = 250 ml');
ok(one('burn zero', 'burn-zero'), 'Burn Zero şekerli Burn\'den ayrılır');
ok(one('250 ml beyaz monster enerji içeceği', 'monster-ultra', 250), '"enerji içeceği" sözcüğü marka adını ezmez');
ok(one('enerji içeceği', 'enerji', 250), 'markasız enerji içeceği genel kalem olur');
ok(one('1 kutu ayran', 'ayran', 200), '1 kutu ayran = 200 ml');
ok(one('2 bardak ayran', 'ayran', 400), '2 bardak ayran = 400 ml');
ok(one('fuse tea', 'icetea', 330), 'FuseTea ice tea olur');
ok(one('fusetea şeftali', 'icetea'), 'FuseTea şeftali (lezzet adı serbest)');
ok(one('lipton ice tea zero 330 ml', 'icetea-zero', 330), 'şekersiz ice tea ayrı kalem');
ok(one('uludağ limonata', 'limonata', 250), 'Uludağ limonata');
ok(one('uludağ gazoz', 'gazoz', 250), 'Uludağ gazoz');
ok(one('1 kutu fanta', 'fanta', 330), 'Fanta');
ok(one('sprite 330 ml', 'sprite', 330), 'Sprite');
ok(one('cola turka', 'cola', 330), 'Cola Turka kola olur');
ok(one('1 bardak süt', 'sut', 200), '1 bardak süt = 200 ml');
ok(one('yarım yağlı süt', 'sut-yarim', 200), 'yarım yağlı süt tam yağlıdan ayrılır');
ok(one('sade soda', 'soda', 200), 'sade soda');
ok(one('cappy şeftali', 'meyve-suyu'), 'Cappy şeftali genel meyve suyu olur (güven düşük)');
ok(extract('limonlu tavuk').items.length === 0 && extract('süt tozu').items.length === 0 && extract('sütlü kahve').items.length === 0, '"limonlu tavuk", "süt tozu", "sütlü kahve" içecek sayılmaz');

// tablo tutarlılığı: kalori ≈ 4P + 4K + 9Y (hesaplanabilen kalem), şeker ≤ karbonhidrat, kimlikler benzersiz
const ids = new Set(), seen = new Map(); let bad = [];
for (const d of DRINKS) {
  const p = d.per100, comp = 4 * (p.protein || 0) + 4 * (p.carbs || 0) + 9 * (p.fat || 0);
  if (ids.has(d.id)) bad.push(d.id + ' tekrar'); ids.add(d.id);
  if (comp > 20 && Math.abs(p.kcal - comp) / comp > 0.15) bad.push(d.id + ' kcal/makro uyumsuz');
  if ((p.sugar || 0) > (p.carbs || 0)) bad.push(d.id + ' şeker > karbonhidrat');
  for (const a of d.alias) { const k = m.exports.fold(a); if (seen.has(k) && seen.get(k) !== d.id) bad.push(`"${a}" iki kalemde (${seen.get(k)}, ${d.id})`); seen.set(k, d.id); }
}
ok(!bad.length, 'içecek tablosu iç tutarlı' + (bad.length ? ': ' + bad.join(', ') : ''));
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
