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

// tablo tutarlılığı: kalori ≈ 4P + 4K + 9Y (hesaplanabilen kalem), şeker ≤ karbonhidrat, kimlikler benzersiz
const ids = new Set(); let bad = [];
for (const d of DRINKS) {
  const p = d.per100, comp = 4 * (p.protein || 0) + 4 * (p.carbs || 0) + 9 * (p.fat || 0);
  if (ids.has(d.id)) bad.push(d.id + ' tekrar'); ids.add(d.id);
  if (comp > 20 && Math.abs(p.kcal - comp) / comp > 0.15) bad.push(d.id + ' kcal/makro uyumsuz');
  if ((p.sugar || 0) > (p.carbs || 0)) bad.push(d.id + ' şeker > karbonhidrat');
}
ok(!bad.length, 'içecek tablosu iç tutarlı' + (bad.length ? ': ' + bad.join(', ') : ''));
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
