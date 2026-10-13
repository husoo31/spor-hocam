// Ürün kataloğu: Open Food Facts toplu verisi (milyonlarca ürün) + restoran menüleri → SQLite (FTS5 tam metin arama).
// Katalog ayrı bir dosyadır (DATA_DIR/catalog.db): ana veritabanını ve yedekleri şişirmez; silinse bile uygulama çalışır.
// Hem sunucu (arama) hem tools/build-catalog.mjs (kurulum) kullanır. Open Food Facts verisi ODbL lisanslıdır (kaynak belirtilir).
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { norm } from './localfoods.js';
import { plausibleMacros } from './refdb.js';

export const OFF_CSV_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const FIELDS = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'fiber', 'sat', 'sodium'];

function createSchema(db) {
  db.exec(`
    CREATE TABLE foods(
      id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, brand TEXT, src TEXT NOT NULL, restaurant TEXT,
      kcal REAL, protein REAL, carbs REAL, fat REAL, sugar REAL, fiber REAL, sat REAL, sodium REAL,
      serving_g REAL, serving_txt TEXT, nutri TEXT);
    CREATE UNIQUE INDEX foods_code ON foods(code) WHERE code IS NOT NULL;
    CREATE VIRTUAL TABLE foods_fts USING fts5(name_f, brand_f, rest_f, content='', tokenize='unicode61 remove_diacritics 2', prefix='2 3');
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);`);
}

/* ------------------------------------------------------------------ kayıt dönüştürme */
const numOf = v => { if (v === undefined || v === null || v === '') return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) && x >= 0 ? x : null; };
const r2 = x => x === null || x === undefined ? null : Math.round(x * 100) / 100;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

// Open Food Facts CSV satırı (başlık adıyla) → katalog kaydı ya da null (eksik/akla uygun olmayan değer)
export function offRecord(get, { countries, all }) {
  const code = clean(get('code')).replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;
  if (!all) { const tags = String(get('countries_tags') || ''); if (!countries.some(c => tags.includes('en:' + c))) return null; }
  const name = clean(get('product_name') || get('generic_name')).slice(0, 120);
  if (name.length < 2) return null;
  let kcal = numOf(get('energy-kcal_100g'));
  if (kcal === null) { const kj = numOf(get('energy-kj_100g')) ?? numOf(get('energy_100g')); if (kj !== null) kcal = kj / 4.184; }
  const p = { kcal, protein: numOf(get('proteins_100g')), carbs: numOf(get('carbohydrates_100g')), fat: numOf(get('fat_100g')) };
  if (Object.values(p).some(v => v === null)) return null; // dört çekirdek değerin hepsi olmalı
  const sodiumG = numOf(get('sodium_100g')) ?? (numOf(get('salt_100g')) !== null ? numOf(get('salt_100g')) / 2.5 : null);
  const rec = { code, name, brand: clean(get('brands')).split(',')[0].slice(0, 60) || null, src: 'off', restaurant: null, ...p,
    sugar: numOf(get('sugars_100g')), fiber: numOf(get('fiber_100g')), sat: numOf(get('saturated-fat_100g')), sodium: sodiumG === null ? null : sodiumG * 1000,
    serving_g: numOf(get('serving_quantity')), serving_txt: clean(get('serving_size')).slice(0, 40) || null, nutri: /^[a-e]$/.test(get('nutriscore_grade') || '') ? get('nutriscore_grade') : null };
  if (!plausibleMacros(rec)) return null;
  if (rec.sugar !== null && rec.sugar > rec.carbs + 0.5) rec.sugar = null; // şeker karbonhidrattan fazla olamaz: tutarsız alanı at
  if (rec.serving_g !== null && (rec.serving_g < 1 || rec.serving_g > 2000)) rec.serving_g = null;
  return rec;
}

// Restoran menüsü CSV'si (porsiyon başına değerler) → 100 g başına kayıtlar. Ayraç ; , ya da sekme; # ile başlayan satırlar yok sayılır.
const MENU_COLS = { restoran: 'restaurant', restaurant: 'restaurant', urun: 'name', ürün: 'name', name: 'name', porsiyon_g: 'serving', porsiyon: 'serving', serving_g: 'serving',
  kcal: 'kcal', kalori: 'kcal', protein: 'protein', karbonhidrat: 'carbs', carbs: 'carbs', yag: 'fat', yağ: 'fat', fat: 'fat', seker: 'sugar', şeker: 'sugar', sugar: 'sugar',
  lif: 'fiber', fiber: 'fiber', doymus_yag: 'sat', doymuş_yağ: 'sat', sat: 'sat', sodyum_mg: 'sodium', sodium_mg: 'sodium' };
export function parseMenuCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = lines[0].split(sep).map(h => MENU_COLS[h.trim().toLocaleLowerCase('tr').replace(/\s+/g, '_')] || null);
  const rows = []; let skipped = 0;
  for (const ln of lines.slice(1)) {
    const c = ln.split(sep).map(x => x.trim().replace(/^"|"$/g, '')), o = {};
    head.forEach((k, i) => { if (k) o[k] = c[i]; });
    const sv = numOf(o.serving), v = { kcal: numOf(o.kcal), protein: numOf(o.protein), carbs: numOf(o.carbs), fat: numOf(o.fat) };
    if (!clean(o.restaurant) || !clean(o.name) || !(sv > 0) || Object.values(v).some(x => x === null)) { skipped++; continue; }
    const per = x => x === null ? null : r2(x / sv * 100), rec = { code: null, name: clean(o.name).slice(0, 120), brand: null, src: 'menu', restaurant: clean(o.restaurant).slice(0, 60),
      kcal: per(v.kcal), protein: per(v.protein), carbs: per(v.carbs), fat: per(v.fat), sugar: per(numOf(o.sugar)), fiber: per(numOf(o.fiber)), sat: per(numOf(o.sat)), sodium: per(numOf(o.sodium)),
      serving_g: sv, serving_txt: null, nutri: null };
    if (!plausibleMacros(rec) || (rec.kcal > 0 && Math.abs(rec.kcal - (4 * rec.protein + 4 * rec.carbs + 9 * rec.fat)) / rec.kcal > 0.35 && rec.kcal > 40)) { skipped++; continue; } // kalori makrolarla çok uyuşmuyorsa girmez
    rows.push(rec);
  }
  return { rows, skipped };
}

/* ------------------------------------------------------------------ kurulum */
async function openStream(input) {
  let s;
  if (/^https?:\/\//.test(input)) {
    const r = await fetch(input, { headers: { 'User-Agent': 'spor-hocam-catalog/1.0' } });
    if (!r.ok) throw new Error(`İndirme başarısız: HTTP ${r.status}`);
    s = Readable.fromWeb(r.body);
  } else s = fs.createReadStream(input);
  return /\.gz(\?|$)/.test(input) ? s.pipe(zlib.createGunzip()) : s;
}
// opts: { input, out, countries:['turkey'], all, menusDir, log }. Geçici dosyaya yazar, bitince yer değiştirir (çalışan sunucu yarım dosya görmez).
export async function buildCatalog({ input, out, countries = ['turkey'], all = false, menusDir, log = () => {} }) {
  const tmp = out + '.tmp';
  for (const f of [tmp, tmp + '-journal', tmp + '-wal', tmp + '-shm']) fs.rmSync(f, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
  createSchema(db);
  const ins = db.prepare(`INSERT OR IGNORE INTO foods(code,name,brand,src,restaurant,kcal,protein,carbs,fat,sugar,fiber,sat,sodium,serving_g,serving_txt,nutri)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const fts = db.prepare('INSERT INTO foods_fts(rowid,name_f,brand_f,rest_f) VALUES(?,?,?,?)');
  const put = r => { const x = ins.run(r.code, r.name, r.brand, r.src, r.restaurant, r2(r.kcal), r2(r.protein), r2(r.carbs), r2(r.fat), r2(r.sugar), r2(r.fiber), r2(r.sat), r2(r.sodium), r.serving_g, r.serving_txt, r.nutri);
    if (x.changes) fts.run(Number(x.lastInsertRowid), norm(r.name), norm(r.brand || ''), norm(r.restaurant || '')); return !!x.changes; };
  const st = { lines: 0, off: 0, menu: 0, menuSkipped: 0 };
  db.exec('BEGIN');
  if (input) {
    const rl = readline.createInterface({ input: await openStream(input), crlfDelay: Infinity });
    let idx = null;
    for await (const line of rl) {
      if (!idx) { idx = Object.fromEntries(line.split('\t').map((h, i) => [h, i])); continue; }
      st.lines++;
      const c = line.split('\t'), rec = offRecord(k => c[idx[k]], { countries, all });
      if (rec && put(rec)) st.off++;
      if (st.lines % 200000 === 0) { db.exec('COMMIT; BEGIN'); log(`${st.lines.toLocaleString('tr-TR')} satır okundu, ${st.off.toLocaleString('tr-TR')} ürün alındı…`); }
    }
    if (!idx) throw new Error('Girdi boş ya da başlık satırı yok.');
  }
  if (menusDir && fs.existsSync(menusDir)) {
    for (const f of fs.readdirSync(menusDir).filter(x => /\.(csv|tsv|txt)$/i.test(x)).sort()) {
      const { rows, skipped } = parseMenuCsv(fs.readFileSync(`${menusDir}/${f}`, 'utf8'));
      rows.forEach(r => { if (put(r)) st.menu++; }); st.menuSkipped += skipped;
      log(`menü: ${f} → ${rows.length} ürün${skipped ? `, ${skipped} satır atlandı (eksik/tutarsız değer)` : ''}`);
    }
  }
  db.exec('COMMIT');
  db.exec("INSERT INTO foods_fts(foods_fts) VALUES('optimize')");
  const meta = db.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
  meta.run('built', String(Date.now())); meta.run('off', String(st.off)); meta.run('menu', String(st.menu)); meta.run('scope', all ? 'dünya' : countries.join(','));
  db.close();
  fs.renameSync(tmp, out);
  return st;
}

/* ------------------------------------------------------------------ arama (sunucu) */
export function openCatalog(file) { return new DatabaseSync(file, { readOnly: true }); }
export function catalogInfo(db) {
  const m = Object.fromEntries(db.prepare('SELECT key,value FROM meta').all().map(r => [r.key, r.value]));
  return { off: +m.off || 0, menu: +m.menu || 0, total: (+m.off || 0) + (+m.menu || 0), built: +m.built || 0, scope: m.scope || '' };
}
const toItem = r => {
  const per100 = {}; for (const k of FIELDS) if (r[k] !== null && r[k] !== undefined) per100[k] = r[k];
  return { id: r.id, code: r.code, name: r.name, brand: r.brand, src: r.src, restaurant: r.restaurant, per100, servingG: r.serving_g, servingTxt: r.serving_txt, nutri: r.nutri };
};
export function searchCatalog(db, query, limit = 20) {
  const toks = norm(query).split(' ').filter(Boolean).slice(0, 6);
  if (!toks.length) return [];
  const match = toks.map(t => '"' + t.replace(/"/g, '') + '"*').join(' ');
  const rows = db.prepare(`SELECT f.* FROM (SELECT rowid, bm25(foods_fts, 8, 3, 4) AS r FROM foods_fts WHERE foods_fts MATCH ? ORDER BY r LIMIT ?) m
    JOIN foods f ON f.id = m.rowid ORDER BY (f.src = 'menu') DESC, m.r`).all(match, Math.max(1, Math.min(50, limit)));
  return rows.map(toItem);
}
