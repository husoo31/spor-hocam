// Yerel besin tablosunu üretir (USDA FoodData Central SR Legacy, kamu malı). Sonuç: localdata/foods.json
// Kullanım: node tools/build-localfoods.mjs <açılmış_sr_legacy_csv_klasörü>
// İndirme: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapUsdaNutrients } from '../refdb.js';

const dir = process.argv[2];
if (!dir) { console.error('Kullanım: node tools/build-localfoods.mjs <csv klasörü>'); process.exit(1); }
function* rows(file) { // küçük CSV okuyucu (tırnaklı alanlar)
  const txt = fs.readFileSync(path.join(dir, file), 'utf8');
  let i = 0, head = null;
  while (i < txt.length) {
    const row = []; let field = '', q = false;
    for (; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { i++; break; }
      else if (c !== '\r') field += c;
    }
    row.push(field);
    if (!head) head = row; else if (row.length > 1) yield Object.fromEntries(head.map((h, k) => [h, row[k]]));
  }
}
const nutrients = new Map(); for (const r of rows('nutrient.csv')) nutrients.set(r.id, r);
const units = new Map(); for (const r of rows('measure_unit.csv')) units.set(r.id, r.name);
const cats = new Map(); for (const r of rows('food_category.csv')) cats.set(r.id, r.description);
const foods = new Map();
for (const r of rows('food.csv')) foods.set(r.fdc_id, { id: Number(r.fdc_id), d: r.description, c: cats.get(r.food_category_id) || '', list: [], m: [] });
for (const r of rows('food_nutrient.csv')) {
  const f = foods.get(r.fdc_id), n = nutrients.get(r.nutrient_id); if (!f || !n) continue;
  f.list.push({ nutrientId: Number(n.id), nutrientName: n.name, unitName: n.unit_name, value: Number(r.amount) });
}
for (const r of rows('food_portion.csv')) {
  const f = foods.get(r.fdc_id), g = Number(r.gram_weight); if (!f || !(g > 0)) continue;
  const unit = units.get(r.measure_unit_id) || '';
  const label = [r.amount, unit && unit !== 'undetermined' ? unit : '', r.modifier || r.portion_description || ''].filter(Boolean).join(' ').trim();
  if (label) f.m.push([label, Math.round(g * 10) / 10]);
}
const out = [];
for (const f of foods.values()) {
  const { per100: p } = mapUsdaNutrients(f.list);
  if (p.kcal === undefined || p.protein === undefined || p.carbs === undefined || p.fat === undefined) continue; // çekirdek makrosu olmayanı alma
  out.push({ id: f.id, d: f.d, c: f.c, p, m: f.m.slice(0, 6) });
}
fs.mkdirSync('localdata', { recursive: true });
fs.writeFileSync('localdata/foods.json', JSON.stringify({ source: 'USDA FoodData Central, SR Legacy (2018-04), kamu malı', built: new Date().toISOString().slice(0, 10), foods: out }));
console.log('yazıldı:', out.length, 'besin,', (fs.statSync('localdata/foods.json').size / 1e6).toFixed(2), 'MB');
