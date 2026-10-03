// Referans besin veritabanları: USDA FoodData Central (genel besinler) ve Open Food Facts (paketli ürünler).
// Bu modül yalnızca veri çeker, eşler ve yapay zekâ tahminiyle karşılaştırır; karar sunucuda ve istemcide verilir.

const MONTH = 30 * 864e5;

/* ------------------------------------------------------------------ birimler */
const TO_G = { G: 1, MG: 1e-3, UG: 1e-6, MCG: 1e-6, 'µG': 1e-6 };
const KEY_UNIT = {
  kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', sat: 'g', mono: 'g', poly: 'g', omega3: 'g', sugar: 'g', fiber: 'g',
  chol: 'mg', sodium: 'mg', potassium: 'mg', calcium: 'mg', phosphorus: 'mg', iron: 'mg', magnesium: 'mg', zinc: 'mg', copper: 'mg',
  manganese: 'mg', selenium: 'mcg', iodine: 'mcg', chromium: 'mcg', molybdenum: 'mcg',
  vitA: 'mcg', vitC: 'mg', vitD: 'mcg', vitE: 'mg', vitK: 'mcg', b1: 'mg', b2: 'mg', b3: 'mg', b5: 'mg', b6: 'mg', b7: 'mcg', b12: 'mcg', folate: 'mcg', choline: 'mg',
};
const GRAMS_PER = { g: 1, mg: 1e-3, mcg: 1e-6 };
function convert(value, fromUnit, key) {
  const to = KEY_UNIT[key];
  if (to === 'kcal') return /^kcal$/i.test(fromUnit) ? value : null;
  const f = TO_G[String(fromUnit || '').toUpperCase()];
  if (f === undefined) return null;
  return value * f / GRAMS_PER[to];
}
const round = n => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------------------ USDA eşleme */
// Besin adı kalıbı (USDA'nın standart adları) → bizim anahtarımız. Kimliklere değil adlara güveniriz;
// kimlik yalnızca enerjide (1008 > 2047 > 2048) öncelik için kullanılır.
const USDA_NAMES = [
  ['protein', /^protein$/i], ['fat', /^total lipid \(fat\)/i], ['carbs', /^carbohydrate, by difference/i],
  ['fiber', /^fiber, total dietary/i], ['sugar', /^(sugars, total|total sugars)/i],
  ['sat', /^fatty acids, total saturated/i], ['mono', /^fatty acids, total monounsaturated/i], ['poly', /^fatty acids, total polyunsaturated/i],
  ['chol', /^cholesterol/i],
  ['sodium', /^sodium/i], ['potassium', /^potassium/i], ['calcium', /^calcium/i], ['phosphorus', /^phosphorus/i], ['iron', /^iron/i],
  ['magnesium', /^magnesium/i], ['zinc', /^zinc/i], ['copper', /^copper/i], ['manganese', /^manganese/i], ['selenium', /^selenium/i],
  ['iodine', /^iodine/i], ['chromium', /^chromium/i], ['molybdenum', /^molybdenum/i],
  ['vitC', /^vitamin c/i], ['vitA', /^vitamin a, rae/i], ['vitD', /^vitamin d \(d2 \+ d3\)$/i], ['vitE', /^vitamin e \(alpha-tocopherol\)/i],
  ['vitK', /^vitamin k \(phylloquinone\)/i], ['b1', /^thiamin/i], ['b2', /^riboflavin/i], ['b3', /^niacin/i], ['b5', /^pantothenic acid/i],
  ['b6', /^vitamin b-6/i], ['b7', /^biotin/i], ['b12', /^vitamin b-12$/i], ['folate', /^folate, dfe/i], ['choline', /^choline, total/i],
];
const USDA_OMEGA3 = [/^18:3 n-3/i, /^20:5 n-3/i, /^22:6 n-3/i, /^22:5 n-3/i, /^fatty acids, total n-3/i];

export function mapUsdaNutrients(list) {
  const per100 = {};
  let omega = 0, omegaTotal = null, kcalRank = 99;
  for (const n of list || []) {
    const name = String(n.nutrientName || (n.nutrient && n.nutrient.name) || '');
    const unit = n.unitName || (n.nutrient && n.nutrient.unitName) || '';
    const id = n.nutrientId || (n.nutrient && n.nutrient.id);
    const val = Number(n.value !== undefined ? n.value : n.amount);
    if (!isFinite(val) || val < 0) continue;
    if (/^energy/i.test(name) && /^kcal$/i.test(unit)) {
      const rank = id === 1008 ? 0 : id === 2047 ? 1 : id === 2048 ? 2 : 3;
      if (rank < kcalRank) { kcalRank = rank; per100.kcal = val; }
      continue;
    }
    if (USDA_OMEGA3[4].test(name)) { omegaTotal = convert(val, unit, 'omega3'); continue; }
    if (USDA_OMEGA3.slice(0, 4).some(re => re.test(name))) { const g = convert(val, unit, 'omega3'); if (g !== null) omega += g; continue; }
    for (const [key, re] of USDA_NAMES) {
      if (re.test(name)) {
        if (per100[key] !== undefined && key !== 'carbs') break;
        const v = convert(val, unit, key);
        if (v !== null) per100[key] = v;
        break;
      }
    }
  }
  const om = omegaTotal !== null ? omegaTotal : omega;
  if (om > 0) per100.omega3 = om;
  Object.keys(per100).forEach(k => { per100[k] = round(per100[k]); });
  // Enerji yoksa makrolardan Atwater ile türet (işaretlenir)
  let kcalDerived = false;
  if (per100.kcal === undefined && per100.protein !== undefined && per100.fat !== undefined && per100.carbs !== undefined) {
    per100.kcal = Math.round(4 * per100.protein + 4 * per100.carbs + 9 * per100.fat); kcalDerived = true;
  }
  return { per100, kcalDerived };
}

/* ------------------------------------------------------------------ Open Food Facts eşleme */
const OFF_FIELDS = {
  protein: 'proteins', carbs: 'carbohydrates', fat: 'fat', sat: 'saturated-fat', mono: 'monounsaturated-fat', poly: 'polyunsaturated-fat',
  omega3: 'omega-3-fat', sugar: 'sugars', fiber: 'fiber', chol: 'cholesterol', sodium: 'sodium', potassium: 'potassium', calcium: 'calcium',
  phosphorus: 'phosphorus', iron: 'iron', magnesium: 'magnesium', zinc: 'zinc', copper: 'copper', manganese: 'manganese', selenium: 'selenium',
  iodine: 'iodine', chromium: 'chromium', molybdenum: 'molybdenum', vitC: 'vitamin-c', vitD: 'vitamin-d', vitE: 'vitamin-e', vitK: 'vitamin-k',
  b1: 'vitamin-b1', b2: 'vitamin-b2', b3: 'vitamin-pp', b5: 'pantothenic-acid', b6: 'vitamin-b6', b7: 'biotin', b12: 'vitamin-b12', folate: 'vitamin-b9', choline: 'choline',
}; // vitamin A bilinçli olarak yok: Open Food Facts'te birimi (IU/RAE) karışık
export function mapOffNutriments(nu) {
  const per100 = {};
  const num = k => { const v = nu && nu[k]; const x = typeof v === 'string' ? parseFloat(v) : v; return typeof x === 'number' && isFinite(x) && x >= 0 ? x : null; };
  let kcal = num('energy-kcal_100g');
  if (kcal === null) { const kj = num('energy-kj_100g') ?? num('energy_100g'); if (kj !== null) kcal = kj / 4.184; }
  if (kcal !== null) per100.kcal = kcal;
  for (const [key, f] of Object.entries(OFF_FIELDS)) {
    const g = num(f + '_100g');
    if (g === null) continue;
    per100[key] = convert(g, 'G', key);   // Open Food Facts bütün *_100g değerlerini gram olarak verir
  }
  if (per100.sodium === undefined) { const salt = num('salt_100g'); if (salt !== null) per100.sodium = convert(salt / 2.5, 'G', 'sodium'); }
  Object.keys(per100).forEach(k => { per100[k] = round(per100[k]); });
  return per100;
}
export function plausibleMacros(p) {
  const m = ['protein', 'carbs', 'fat'];
  if (m.some(k => p[k] !== undefined && p[k] > 100)) return false;
  if ((p.protein || 0) + (p.carbs || 0) + (p.fat || 0) > 105) return false;
  if (p.kcal !== undefined && p.kcal > 900) return false;
  return true;
}
const hasCore = p => ['kcal', 'protein', 'carbs', 'fat'].filter(k => p[k] !== undefined).length;

/* ------------------------------------------------------------------ yapay zekâ tahminiyle karşılaştırma */
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 5);
export function compare(refP, ai) {
  if (!ai) return null;
  const parts = [['kcal', 2], ['protein', 1], ['carbs', 1], ['fat', 1]].filter(([k]) => refP[k] !== undefined && ai[k] !== undefined && ai[k] !== null);
  if (!parts.length) return null;
  const w = parts.reduce((a, [, x]) => a + x, 0);
  const dist = parts.reduce((a, [k, x]) => a + x * rel(Number(refP[k]), Number(ai[k])), 0) / w;
  const kcalErr = refP.kcal !== undefined && ai.kcal !== undefined ? rel(Number(refP.kcal), Number(ai.kcal)) : null;
  return { dist, kcalErr };
}
export const ACCEPT = { kcal: 0.25, dist: 0.40 };
export function pickBest(cands, ai, descTokens) {
  const scored = cands.map(c => {
    const cmp = compare(c.per100, ai);
    const toks = descTokens && descTokens.length ? descTokens.filter(t => c.name.toLowerCase().includes(t)).length / descTokens.length : 0;
    return { c, cmp, toks, key: cmp ? cmp.dist - 0.08 * toks : 9 - toks };
  }).sort((a, b) => a.key - b.key);
  if (!scored.length) return null;
  const b = scored[0];
  const accepted = !!(b.cmp && (b.cmp.kcalErr === null || b.cmp.kcalErr <= ACCEPT.kcal) && b.cmp.dist <= ACCEPT.dist);
  return { ...b.c, accepted, dist: b.cmp ? Math.round(b.cmp.dist * 100) / 100 : null, kcalErr: b.cmp && b.cmp.kcalErr !== null ? Math.round(b.cmp.kcalErr * 100) / 100 : null };
}

/* ------------------------------------------------------------------ istemciler */
export function createRefDb({ env, cache }) {
  const USDA_BASE = (env.USDA_BASE || 'https://api.nal.usda.gov/fdc/v1').replace(/\/$/, '');
  const OFF_BASE = (env.OFF_BASE || 'https://world.openfoodfacts.org').replace(/\/$/, '');
  const UA = `SporHocam/1.0 (${env.OFF_CONTACT || 'kisisel-kullanim'})`;
  const usdaKey = () => env.USDA_API_KEY || '';

  // Open Food Facts nezaket sınırı: arama dakikada ≤10, barkod okuma dakikada ≤100
  const gates = { search: { next: 0, gap: Number(env.OFF_SEARCH_GAP_MS) || 6500 }, product: { next: 0, gap: Number(env.OFF_PRODUCT_GAP_MS) || 700 } };
  async function gate(kind) {
    const g = gates[kind], now = Date.now(), at = Math.max(now, g.next);
    g.next = at + g.gap;
    if (at > now) await new Promise(r => setTimeout(r, at - now));
  }
  async function getJson(url, headers, timeout = 8000) {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key, ttl);
    if (hit !== undefined) return hit;
    const v = await fn();
    cache.put(key, v);
    return v;
  };

  async function usdaCandidates(query) {
    if (!usdaKey()) return [];
    const q = String(query).trim().toLowerCase().slice(0, 120);
    if (!q) return [];
    return cached('usda:' + q, MONTH, async () => {
      const run = async strict => {
        const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(q)}&dataType=Foundation,SR%20Legacy&pageSize=12${strict ? '&requireAllWords=true' : ''}`;
        const j = await getJson(url, { Accept: 'application/json' });
        return (j.foods || []).map(f => {
          const { per100, kcalDerived } = mapUsdaNutrients(f.foodNutrients);
          return { source: 'usda', id: String(f.fdcId), name: String(f.description || ''), type: f.dataType, per100, kcalDerived };
        }).filter(c => hasCore(c.per100) >= 3 && plausibleMacros(c.per100));
      };
      let out = await run(true);
      if (!out.length) out = await run(false);
      return out;
    });
  }

  function offProduct(p) {
    const per100 = mapOffNutriments(p.nutriments || {});
    let servingG = Number(p.serving_quantity);
    if (!(servingG > 0)) { const m = String(p.serving_size || '').match(/([\d.,]+)\s*(g|ml)\b/i); servingG = m ? parseFloat(m[1].replace(',', '.')) : 0; }
    return {
      source: 'off', id: String(p.code || ''), name: String(p.product_name_tr || p.product_name || p.generic_name || '').trim(),
      brand: String(p.brands || '').split(',')[0].trim(), quantity: String(p.quantity || ''), servingG: servingG > 0 ? servingG : null, per100,
    };
  }
  const OFF_FIELDLIST = 'code,product_name,product_name_tr,generic_name,brands,quantity,serving_size,serving_quantity,nutriments';
  async function offBarcode(code) {
    const c = String(code).replace(/\D/g, '');
    if (c.length < 8 || c.length > 14) return null;
    let prod = await offBarcodeExact(c);
    // UPC-A (12 hane) Open Food Facts'te çoğunlukla başına 0 eklenmiş EAN-13 olarak durur ve tersi
    if (!prod && c.length === 12) prod = await offBarcodeExact('0' + c);
    if (!prod && c.length === 13 && c[0] === '0') prod = await offBarcodeExact(c.slice(1));
    return prod;
  }
  async function offBarcodeExact(c) {
    const hit = cache.get('off:bc:' + c, 30 * MONTH);
    if (hit !== undefined) return hit;
    await gate('product');
    let j;
    try { j = await getJson(`${OFF_BASE}/api/v2/product/${c}.json?fields=${OFF_FIELDLIST}`, { 'User-Agent': UA, Accept: 'application/json' }); }
    catch (e) {
      if (e.status === 404) { cache.put('off:bc:' + c, null); return null; }
      throw e;
    }
    if (!j || j.status === 0 || !j.product) { cache.put('off:bc:' + c, null); return null; }
    const prod = offProduct({ ...j.product, code: j.product.code || c });
    cache.put('off:bc:' + c, prod);
    return prod;
  }
  async function offCandidates(query) {
    const q = String(query).trim().toLowerCase().slice(0, 100);
    if (!q) return [];
    return cached('off:q:' + q, MONTH, async () => {
      const mk = tr => `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=${OFF_FIELDLIST}` +
        (tr ? '&tagtype_0=countries&tag_contains_0=contains&tag_0=turkey' : '');
      const run = async tr => {
        await gate('search');
        const j = await getJson(mk(tr), { 'User-Agent': UA, Accept: 'application/json' }, 12000);
        return (j.products || []).map(offProduct).filter(c => c.name && hasCore(c.per100) >= 3 && plausibleMacros(c.per100));
      };
      let out = await run(true);
      if (!out.length) out = await run(false);
      return out;
    });
  }
  return { usdaCandidates, offBarcode, offCandidates, usdaEnabled: () => !!usdaKey() };
}
