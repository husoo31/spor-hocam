// Yapay zekâsız yedek hesaplayıcı: Türkçe yiyecek metnini ayrıştırır, yerel USDA SR Legacy tablosuyla (localdata/foods.json)
// eşleştirir. Hiçbir ağ çağrısı yapmaz; yapay zekâ ve USDA/OFF çökse bile "yaklaşık" bir sonuç verir.
// Eşleşmeyen yiyecek (menemen, lahmacun, mantı…) için değer UYDURULMAZ; "bulunamadı" olarak döner.
import fs from 'node:fs';

/* ------------------------------------------------------------------ yazı düzeltme */
export const norm = s => String(s == null ? '' : s).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9.,/\s%-]/g, ' ').replace(/\s+/g, ' ').trim();

const NUMW = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yarim: 0.5, ceyrek: 0.25 };
// birim anahtarı -> { k: tür, f: çarpan }  (k: 'g' gram, 'ml' ≈ gram, 'adet', 'dilim', 'bardak', 'ykasik', 'tkasik', 'ckasik', 'kase', 'tabak', 'porsiyon', 'avuc', 'paket', 'kutu', 'sise')
const UNITS = [
  [['g', 'gr', 'gram'], { k: 'g', f: 1 }], [['kg', 'kilo', 'kilogram'], { k: 'g', f: 1000 }],
  [['ml', 'mililitre'], { k: 'g', f: 1 }], [['l', 'lt', 'litre'], { k: 'g', f: 1000 }],
  [['adet', 'tane', 'parca'], { k: 'adet' }], [['dilim'], { k: 'dilim' }],
  [['su bardagi', 'bardak', 'bardagi', 'cay bardagi', 'fincan', 'kupa'], { k: 'bardak' }],
  [['yemek kasigi', 'kasik', 'kasigi', 'y kasigi', 'ykasik'], { k: 'ykasik' }], [['tatli kasigi'], { k: 'tkasik' }], [['cay kasigi'], { k: 'ckasik' }],
  [['kase'], { k: 'kase' }], [['tabak'], { k: 'tabak' }], [['porsiyon'], { k: 'porsiyon' }], [['avuc'], { k: 'avuc' }],
  [['paket'], { k: 'paket' }], [['kutu'], { k: 'kutu' }], [['sise'], { k: 'sise' }],
];
const UNIT_MAP = new Map(); for (const [keys, v] of UNITS) for (const k of keys) UNIT_MAP.set(k, v);
// bardak ölçüleri (ml): su bardağı 200, çay bardağı 100, fincan 100, kupa 250
const CUP_ML = { 'su bardagi': 200, bardak: 200, bardagi: 200, 'cay bardagi': 100, fincan: 100, kupa: 250 };
const SIZE = { kucuk: 0.75, orta: 1, buyuk: 1.3 };

/* ------------------------------------------------------------------ Türkçe yiyecek → USDA eşleme tablosu
   k: Türkçe anahtarlar (en az bir kelime başı eşleşmesi); q: USDA açıklamasında geçmesi gereken İngilizce kelimeler
   ('=' ile başlıyorsa tam açıklama). u: bu yiyeceğe özel birim gramları (adet, dilim, bardak, ykasik, tkasik, ckasik, kase, tabak, porsiyon, avuc, paket, kutu, sise)
   p: ölçü belirtilmediğinde tipik porsiyon (g). Rakamlar tipik Türk porsiyonlarıdır; hepsi "varsayım" olarak notla bildirilir. */
export const ALIASES = [
  // --- yumurta ve süt ürünleri
  { k: ['haslanmis yumurta'], q: '=Egg, whole, cooked, hard-boiled', u: { adet: 50 }, p: 50 },
  { k: ['sahanda yumurta', 'kizarmis yumurta'], q: '=Egg, whole, cooked, fried', u: { adet: 46 }, p: 46 },
  { k: ['omlet'], q: '=Egg, whole, cooked, omelet', u: { adet: 61 }, p: 120 },
  { k: ['cirpilmis yumurta'], q: '=Egg, whole, cooked, scrambled', u: { adet: 61 }, p: 120 },
  { k: ['yumurta'], q: '=Egg, whole, cooked, hard-boiled', u: { adet: 50 }, p: 50, note: 'yumurtanın pişirilme şekli belirtilmedi, haşlanmış varsayıldı' },
  { k: ['yagsiz sut'], q: '=Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)', u: { bardak: 245 }, p: 200 },
  { k: ['sut'], q: '=Milk, whole, 3.25% milkfat, with added vitamin D', u: { bardak: 244 }, p: 200 },
  { k: ['suzme yogurt', 'sade yogurt', 'yogurt'], q: '=Yogurt, plain, whole milk', u: { bardak: 245, kase: 200, ykasik: 15 }, p: 170 },
  { k: ['yagsiz yogurt'], q: '=Yogurt, plain, skim milk', u: { bardak: 245, kase: 200 }, p: 170 },
  { k: ['beyaz peynir'], q: '=Cheese, feta', u: { dilim: 30, adet: 30 }, p: 40 },
  { k: ['kasar', 'kashar'], q: '=Cheese, provolone', u: { dilim: 20, adet: 20 }, p: 30 },
  { k: ['cheddar', 'cedar peyniri'], q: '=Cheese, cheddar, sharp, sliced', u: { dilim: 20 }, p: 30 },
  { k: ['mozzarella'], q: '=Cheese, mozzarella, whole milk', u: { dilim: 20 }, p: 30 },
  { k: ['lor'], q: '=Cheese, cottage, lowfat, 2% milkfat', u: { kase: 113 }, p: 100 },
  { k: ['krem peynir'], q: '=Cheese, cream', u: { ykasik: 15 }, p: 30 },
  { k: ['tereyagi'], q: '=Butter, salted', u: { ykasik: 14, ckasik: 5, tkasik: 9 }, p: 10 },
  // --- et, tavuk, balık
  { k: ['tavuk gogsu', 'tavuk', 'izgara tavuk'], q: '=Chicken, broilers or fryers, breast, meat only, cooked, roasted', u: { porsiyon: 150 }, p: 150 },
  { k: ['cig tavuk gogsu'], q: '=Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', p: 150 },
  { k: ['tavuk but', 'tavuk baget'], q: '=Chicken, broilers or fryers, thigh, meat only, cooked, roasted', u: { adet: 116 }, p: 116 },
  { k: ['dana kiyma', 'kiyma'], q: '=Beef, ground, unspecified fat content, cooked', p: 100 },
  { k: ['kofte'], q: '=Beef, ground, patties, frozen, cooked, broiled', u: { adet: 40 }, p: 120, note: 'ızgara köfte için ince kıyma tahmini; baharat/ekmek içeriği dahil değil' },
  { k: ['kuzu', 'kuzu eti'], q: '=Lamb, ground, cooked, broiled', p: 100 },
  { k: ['hindi'], q: '=Turkey, whole, breast, meat only, cooked, roasted', p: 100 },
  { k: ['hindi fume', 'hindi jambon'], q: '=Turkey breast, sliced, prepackaged', u: { dilim: 16 }, p: 48 },
  { k: ['jambon'], q: '=Ham, sliced, regular (approximately 11% fat)', u: { dilim: 28 }, p: 56 },
  { k: ['ton baligi', 'ton'], q: '=Fish, tuna, light, canned in water, drained solids (Includes foods for USDA\'s Food Distribution Program)', u: { kutu: 140 }, p: 100 },
  { k: ['somon'], q: '=Fish, salmon, Atlantic, farmed, cooked, dry heat', p: 150 },
  { k: ['karides'], q: '=Crustaceans, shrimp, cooked', p: 100 },
  // --- tahıl ve bakliyat
  { k: ['pilav', 'pirinc pilavi', 'pisirilmis pirinc'], q: '=Rice, white, long-grain, regular, enriched, cooked', u: { tabak: 200, bardak: 158, kase: 160 }, p: 200, note: 'sade haşlanmış pirinç değeri; pilava eklenen tereyağı/yağ dahil değil' },
  { k: ['cig pirinc', 'pirinc'], q: '=Rice, white, long-grain, regular, raw, enriched', u: { bardak: 185 }, p: 100 },
  { k: ['makarna', 'spagetti'], q: '=Pasta, cooked, enriched, without added salt', u: { tabak: 200, bardak: 140 }, p: 200 },
  { k: ['cig makarna'], q: '=Pasta, dry, enriched', p: 80 },
  { k: ['bulgur pilavi', 'bulgur'], q: '=Bulgur, cooked', u: { tabak: 200, bardak: 182 }, p: 200, note: 'sade pişmiş bulgur değeri; eklenen yağ dahil değil' },
  { k: ['yulaf ezmesi', 'yulaf'], q: '=Cereals, oats, regular and quick, not fortified, dry', u: { bardak: 81, ykasik: 6 }, p: 40 },
  { k: ['misir gevregi'], q: 'cereals ready-to-eat corn flakes', u: { bardak: 28, kase: 40 }, p: 30 },
  { k: ['tam bugday ekmegi', 'tam bugday ekmek', 'kepek ekmegi'], q: '=Bread, whole-wheat, commercially prepared', u: { dilim: 28 }, p: 56 },
  { k: ['cavdar ekmegi'], q: '=Bread, rye', u: { dilim: 32 }, p: 64 },
  { k: ['pide', 'lavas'], q: '=Bread, pita, white, enriched', u: { adet: 60 }, p: 60 },
  { k: ['ekmek', 'beyaz ekmek', 'tost ekmegi'], q: '=Bread, white wheat', u: { dilim: 28 }, p: 56 },
  { k: ['nohut'], q: '=Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt', u: { bardak: 164, kase: 164 }, p: 150, note: 'sade haşlanmış nohut değeri' },
  { k: ['kirmizi mercimek', 'mercimek'], q: '=Lentils, mature seeds, cooked, boiled, without salt', u: { bardak: 198, kase: 198 }, p: 150 },
  { k: ['kuru fasulye', 'fasulye'], q: '=Beans, white, mature seeds, cooked, boiled, without salt', u: { bardak: 179, tabak: 200 }, p: 200, note: 'sade haşlanmış fasulye değeri; yemeğe eklenen yağ, et ve salça dahil değil' },
  { k: ['barbunya'], q: '=Beans, pinto, mature seeds, cooked, boiled, without salt', u: { bardak: 171 }, p: 150 },
  { k: ['kinoa'], q: '=Quinoa, cooked', u: { bardak: 185 }, p: 150 },
  // --- sebze
  { k: ['patates kizartmasi', 'cips patates'], q: '=Fast foods, potato, french fried in vegetable oil', u: { porsiyon: 117 }, p: 117 },
  { k: ['haslanmis patates', 'patates'], q: '=Potatoes, boiled, cooked in skin, flesh, without salt', u: { adet: 170 }, p: 170 },
  { k: ['domates'], q: '=Tomatoes, red, ripe, raw, year round average', u: { adet: 123 }, p: 123 },
  { k: ['salatalik'], q: 'cucumber with peel raw', u: { adet: 100 }, p: 100 },
  { k: ['havuc'], q: '=Carrots, raw', u: { adet: 61 }, p: 61 },
  { k: ['sogan'], q: '=Onions, raw', u: { adet: 110 }, p: 110 },
  { k: ['biber', 'yesil biber'], q: '=Peppers, sweet, green, raw', u: { adet: 119 }, p: 100 },
  { k: ['patlican'], q: '=Eggplant, cooked, boiled, drained, without salt', p: 150 },
  { k: ['kabak'], q: '=Squash, summer, zucchini, includes skin, cooked, boiled, drained, without salt', p: 150 },
  { k: ['ispanak'], q: '=Spinach, cooked, boiled, drained, without salt', u: { bardak: 180 }, p: 150 },
  { k: ['brokoli'], q: '=Broccoli, cooked, boiled, drained, without salt', u: { bardak: 156 }, p: 150 },
  { k: ['karnabahar'], q: '=Cauliflower, cooked, boiled, drained, without salt', p: 150 },
  { k: ['marul'], q: '=Lettuce, cos or romaine, raw', u: { avuc: 30 }, p: 50 },
  { k: ['misir'], q: '=Corn, sweet, yellow, cooked, boiled, drained, without salt', u: { adet: 90 }, p: 100 },
  { k: ['mantar'], q: '=Mushrooms, white, raw', p: 70 },
  { k: ['zeytin'], q: 'olives ripe canned', u: { adet: 4 }, p: 30 },
  // --- meyve
  { k: ['elma'], q: '=Apples, raw, with skin (Includes foods for USDA\'s Food Distribution Program)', u: { adet: 182 }, p: 182 },
  { k: ['muz'], q: '=Bananas, raw', u: { adet: 118 }, p: 118 },
  { k: ['portakal'], q: '=Oranges, raw, all commercial varieties', u: { adet: 131 }, p: 131 },
  { k: ['mandalina'], q: '=Tangerines, (mandarin oranges), raw', u: { adet: 88 }, p: 88 },
  { k: ['uzum'], q: '=Grapes, red or green (European type, such as Thompson seedless), raw', u: { avuc: 80 }, p: 100 },
  { k: ['cilek'], q: '=Strawberries, raw', u: { avuc: 80, bardak: 152 }, p: 100 },
  { k: ['karpuz'], q: '=Watermelon, raw', u: { dilim: 286 }, p: 200 },
  { k: ['kavun'], q: '=Melons, cantaloupe, raw', u: { dilim: 200 }, p: 200 },
  { k: ['seftali'], q: '=Peaches, yellow, raw', u: { adet: 150 }, p: 150 },
  { k: ['armut'], q: '=Pears, raw', u: { adet: 178 }, p: 178 },
  { k: ['kiraz'], q: '=Cherries, sweet, raw', u: { avuc: 60 }, p: 100 },
  { k: ['kayisi'], q: '=Apricots, raw', u: { adet: 35 }, p: 105 },
  { k: ['kuru kayisi'], q: '=Apricots, dried, sulfured, uncooked', u: { adet: 8 }, p: 40 },
  { k: ['incir'], q: '=Figs, raw', u: { adet: 50 }, p: 100 },
  { k: ['kuru uzum'], q: '=Raisins, golden, seedless', u: { avuc: 30 }, p: 30 },
  { k: ['hurma'], q: '=Dates, medjool', u: { adet: 24 }, p: 48 },
  { k: ['avokado'], q: '=Avocados, raw, all commercial varieties', u: { adet: 201 }, p: 100 },
  { k: ['nar'], q: '=Pomegranates, raw', u: { adet: 282 }, p: 100 },
  { k: ['kivi'], q: 'kiwifruit green raw', u: { adet: 69 }, p: 69 },
  { k: ['ananas'], q: '=Pineapple, raw, all varieties', u: { dilim: 84 }, p: 100 },
  { k: ['limon'], q: '=Lemons, raw, without peel', u: { adet: 58 }, p: 58 },
  // --- kuruyemiş ve yağlar
  { k: ['badem'], q: '=Nuts, almonds', u: { avuc: 28, adet: 1.2 }, p: 30 },
  { k: ['ceviz'], q: '=Nuts, walnuts, english', u: { avuc: 28, adet: 5 }, p: 30 },
  { k: ['findik'], q: '=Nuts, hazelnuts or filberts', u: { avuc: 28, adet: 1.4 }, p: 30 },
  { k: ['antep fistigi', 'fistik'], q: '=Nuts, pistachio nuts, raw', u: { avuc: 28 }, p: 30 },
  { k: ['yer fistigi'], q: '=Peanuts, all types, raw', u: { avuc: 28 }, p: 30 },
  { k: ['kaju'], q: '=Nuts, cashew nuts, raw', u: { avuc: 28 }, p: 30 },
  { k: ['ay cekirdegi'], q: '=Seeds, sunflower seed kernels, dried', u: { avuc: 30 }, p: 30 },
  { k: ['fistik ezmesi'], q: '=Peanut butter, smooth style, with salt (Includes foods for USDA\'s Food Distribution Program)', u: { ykasik: 16, ckasik: 5, tkasik: 10 }, p: 32 },
  { k: ['tahin'], q: '=Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)', u: { ykasik: 15 }, p: 15 },
  { k: ['zeytinyagi', 'zeytin yagi'], q: '=Oil, olive, salad or cooking', u: { ykasik: 13.5, tkasik: 9, ckasik: 4.5 }, p: 14 },
  { k: ['aycicek yagi', 'sivi yag'], q: '=Oil, sunflower, linoleic, (approx. 65%)', u: { ykasik: 13.6, tkasik: 9, ckasik: 4.5 }, p: 14 },
  // --- tatlılar ve şekerler
  { k: ['bal', 'cicek bali', 'petek bali', 'ballar'], q: '=Honey', u: { ykasik: 21, tkasik: 14, ckasik: 7 }, p: 21 },
  { k: ['seker'], q: '=Sugars, granulated', u: { ykasik: 12.5, tkasik: 8, ckasik: 4 }, p: 4 },
  { k: ['sutlu cikolata', 'cikolata'], q: '=Candies, milk chocolate', u: { adet: 5, dilim: 5 }, p: 30 },
  { k: ['bitter cikolata'], q: '=Chocolate, dark, 70-85% cacao solids', u: { dilim: 5 }, p: 30 },
  { k: ['recel'], q: '=Jams and preserves', u: { ykasik: 20, ckasik: 7 }, p: 20 },
  { k: ['dondurma'], q: '=Ice creams, vanilla', u: { kase: 66 }, p: 100 },
  // --- içecekler
  { k: ['kola', 'cola'], q: '=Beverages, carbonated, cola, regular', u: { bardak: 200, kutu: 330, sise: 330 }, p: 200 },
  { k: ['gazoz'], q: '=Beverages, carbonated, lemon-lime soda, no caffeine', u: { bardak: 200, kutu: 330, sise: 330 }, p: 200 },
  { k: ['portakal suyu'], q: '=Orange juice, raw (Includes foods for USDA\'s Food Distribution Program)', u: { bardak: 200 }, p: 200 },
  { k: ['elma suyu'], q: 'apple juice canned or bottled unsweetened without added ascorbic acid', u: { bardak: 200 }, p: 200 },
  { k: ['cay', 'sekersiz cay'], q: '=Beverages, tea, black, brewed, prepared with tap water', u: { bardak: 100 }, p: 100 },
  { k: ['kahve', 'turk kahvesi', 'filtre kahve'], q: '=Beverages, coffee, brewed, prepared with tap water', u: { bardak: 100, fincan: 60 }, p: 100 },
  { k: ['bira'], q: '=Alcoholic beverage, beer, regular, all', u: { bardak: 250, kutu: 330, sise: 330 }, p: 330 },
  { k: ['sarap'], q: '=Alcoholic beverage, wine, table, red', u: { bardak: 150 }, p: 150 },
  { k: ['su'], q: '=Beverages, water, tap, drinking', u: { bardak: 200 }, p: 200 },
  // --- hazır yiyecek
  { k: ['pizza'], q: '=Pizza, meat and vegetable topping, regular crust, frozen, cooked', u: { dilim: 100 }, p: 200, note: 'dilim gramajı pizza boyuna göre çok değişir' },
  { k: ['hamburger'], q: 'fast foods hamburger large single patty with condiments', u: { adet: 226 }, p: 226 },
  { k: ['humus'], q: '=Hummus, commercial', u: { ykasik: 15 }, p: 60 },
];

/* ------------------------------------------------------------------ ayrıştırma
   Her sözcük {n: düzeltilmiş, o: kullanıcının yazdığı} çifti olarak taşınır; böylece ekranda Türkçe karakterli özgün ad görünür. */
function parseNumber(tok) {
  if (NUMW[tok] !== undefined) return NUMW[tok];
  let m = tok.match(/^(\d+)\/(\d+)$/); if (m) return Number(m[1]) / Number(m[2]);
  m = tok.match(/^(\d+(?:[.,]\d+)?)(?:-\d+(?:[.,]\d+)?)?$/); if (m) return Number(m[1].replace(',', '.'));
  return null;
}
// "2 yumurta, 1 dilim ekmek ve süt" -> ["2 yumurta", "1 dilim ekmek", "süt"] (özgün yazımla)
export function parseSegments(text) {
  return String(text || '').replace(/\s+(ve|ile|ILE|VE|Ve|İle|Ile)\s+/g, ',').replace(/[+;&\n]/g, ',').split(',').map(s => s.trim()).filter(Boolean);
}
// "2 su bardağı süt", "150 g tavuk göğsü", "yumurta 2 adet", "yarım muz", "iki buçuk dilim ekmek"
export function parseItem(seg) {
  let tk = seg.split(/\s+/).filter(Boolean).map(o => ({ o, n: norm(o) })).filter(t => t.n);
  let qty = null, unit = null, size = 1;
  // "150g", "250ml" gibi yapışık yazım
  tk = tk.flatMap(t => { const m = t.n.match(/^(\d+(?:[.,]\d+)?)(g|gr|kg|ml|l|lt)$/); return m ? [{ o: m[1], n: m[1] }, { o: m[2], n: m[2] }] : [t]; });
  const ni = tk.findIndex(t => parseNumber(t.n) !== null);
  if (ni >= 0) {
    qty = parseNumber(tk[ni].n); tk.splice(ni, 1);
    if (tk[ni] && tk[ni].n === 'bucuk') { qty += 0.5; tk.splice(ni, 1); }
  }
  for (let i = 0; i < tk.length; i++) { // iki kelimeli birimler önce
    const two = tk[i].n + ' ' + (tk[i + 1] ? tk[i + 1].n : ''), one = tk[i].n;
    if (UNIT_MAP.has(two)) { unit = { key: two, ...UNIT_MAP.get(two) }; tk.splice(i, 2); break; }
    if (UNIT_MAP.has(one)) { unit = { key: one, ...UNIT_MAP.get(one) }; tk.splice(i, 1); break; }
  }
  tk = tk.filter(t => { if (SIZE[t.n] !== undefined) { size = SIZE[t.n]; return false; } return !['boy', 'kadar', 'yaklasik', 'civari'].includes(t.n); });
  return { qty, unit, size, name: tk.map(t => t.n).join(' '), shown: tk.map(t => t.o).join(' ') };
}

/* ------------------------------------------------------------------ eşleme */
// Bunlardan biri geçiyorsa yemek bir "hazır/karışık yemek"tir; tek bir hammaddeyle eşleştirmek yanıltıcı olur
const DISH_WORDS = ['corba', 'yemegi', 'salata', 'tatlisi', 'borek', 'dolma', 'sarma', 'kavurma', 'musakka', 'kebap', 'kebabi', 'graten', 'sos', 'soslu', 'ezme', 'haslama', 'tava', 'guvec', 'turlu', 'cacik', 'mucver', 'pilaki', 'kizartma', 'kizartmasi', 'kremali', 'firinda', 'sandvic', 'tost', 'durum', 'doner', 'lahmacun', 'manti', 'menemen', 'pide', 'sote', 'kavrulmus', 'yahni', 'tencere', 'izgarasi', 'sarmasi'];
const tokOf = s => norm(s).split(' ').filter(Boolean);
// Dönüş: { alias } | { composite: true } | null
function aliasMatch(name) {
  const nt = tokOf(name), matches = [];
  for (const a of ALIASES) for (const key of a.k) {
    const kt = tokOf(key);
    for (let i = 0; i + kt.length <= nt.length; i++) {
      // kısa (<4) anahtarlar tam eşleşmeli; uzunlar kelime başı (ek almış hâllerle) eşleşir
      if (kt.every((k, j) => nt[i + j] === k || (k.length >= 4 && nt[i + j].startsWith(k))))
        matches.push({ a, start: i, end: i + kt.length, score: kt.length * 100 + key.length, short: key.length < 4 });
    }
  }
  if (!matches.length) return null;
  matches.sort((x, y) => y.score - x.score);
  const best = matches[0];
  // çok kısa anahtarlar (su, bal, ton, lor) yalnızca ifadenin TAMAMI o kelimeyse geçerli: "şu bilinmeyen ürün" ≠ su
  if (best.short && nt.length > best.end - best.start) return null;
  // aynı kelimelere oturmayan başka bir besin de varsa: karışık yemek ("domatesli makarna")
  if (matches.some(m => m.a !== best.a && (m.end <= best.start || m.start >= best.end))) return { composite: true };
  // yemek sözcüğü varsa (ve anahtarın kendisi o sözcüğü içermiyorsa) hazır yemektir
  const keyToks = new Set(best.a.k.flatMap(tokOf));
  if (nt.some(t => DISH_WORDS.some(w => (t === w || t.startsWith(w)) && !keyToks.has(t)))) return { composite: true };
  return { alias: best.a };
}

export function createLocalFoods({ file }) {
  let db = null, byDesc = null;
  function load() {
    if (db) return db;
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    db = j; byDesc = new Map(j.foods.map(f => [f.d, f]));
    for (const f of j.foods) f.lc = f.d.toLowerCase();
    return db;
  }
  function findFood(q) {
    load();
    if (q.startsWith('=')) return byDesc.get(q.slice(1)) || null;
    const toks = q.toLowerCase().split(/\s+/);
    let best = null;
    for (const f of db.foods) {
      if (!toks.every(t => f.lc.includes(t))) continue;
      if (!best || f.d.length < best.d.length) best = f;
    }
    return best;
  }
  function portionGrams(food, alias, unit, qty, size) {
    const per = (alias.u && unit && alias.u[unit.k]);
    if (unit && unit.k === 'g') return { g: qty * unit.f, how: '' };
    if (per) return { g: qty * per * size, how: `1 ${unitLabel(unit)} ≈ ${per} g varsayıldı` };
    if (unit && ['bardak'].includes(unit.k)) { // USDA "cup" ölçüsünden (236,6 ml) ml'ye çevir
      const ml = CUP_ML[unit.key] || 200, cup = (food.m.find(m => /^1 cup/.test(m[0])) || [])[1];
      if (cup) return { g: qty * cup * ml / 236.6, how: `1 ${unitLabel(unit)} (${ml} ml) ≈ ${Math.round(cup * ml / 236.6)} g (USDA "cup" ölçüsünden)` };
      return { g: qty * ml, how: `1 ${unitLabel(unit)} ≈ ${ml} g varsayıldı` };
    }
    const ytbl = { ykasik: 15, tkasik: 10, ckasik: 5, avuc: 30 };
    if (unit && ytbl[unit.k]) return { g: qty * ytbl[unit.k], how: `1 ${unitLabel(unit)} ≈ ${ytbl[unit.k]} g varsayıldı` };
    if (unit && ['kase', 'tabak', 'porsiyon', 'paket'].includes(unit.k)) return { g: qty * (alias.p || 150), how: `1 ${unitLabel(unit)} ≈ ${alias.p || 150} g varsayıldı` };
    // USDA porsiyon tablosundan "1 large/medium/slice/each…" ara
    const want = unit && unit.k === 'dilim' ? /slice/ : /^1 (large|medium|each|whole|fruit|unit|piece|item)|^1 [a-z]+$/;
    const hit = (food.m || []).find(m => want.test(m[0]));
    if (hit && unit) return { g: qty * hit[1] * size, how: `1 ${unitLabel(unit)} ≈ ${hit[1]} g (USDA "${hit[0]}")` };
    return null;
  }
  const unitLabel = u => ({ adet: 'adet', dilim: 'dilim', bardak: 'bardak', ykasik: 'yemek kaşığı', tkasik: 'tatlı kaşığı', ckasik: 'çay kaşığı', kase: 'kase', tabak: 'tabak', porsiyon: 'porsiyon', avuc: 'avuç', paket: 'paket', kutu: 'kutu', sise: 'şişe', g: 'g' }[u.k] || u.key);

  function estimate(text) {
    load();
    const items = [], unmatched = [];
    for (const seg of parseSegments(text)) {
      const it = parseItem(seg);
      if (!it.name) continue;
      const am = aliasMatch(it.name);
      const alias = am && am.alias, food = alias && findFood(alias.q);
      const shown = it.shown.charAt(0).toLocaleUpperCase('tr') + it.shown.slice(1);
      if (!alias || !food) { unmatched.push(shown); continue; }
      let g = null, how = '';
      if (it.qty === null) { g = alias.p; how = `miktar yazılmadı, tipik porsiyon ${alias.p} g varsayıldı`; }
      else {
        const unit = it.unit || (it.qty !== null ? { k: 'adet', key: 'adet' } : null);
        const r = portionGrams(food, alias, unit, it.qty, it.size);
        if (r) { g = r.g; how = r.how; }
        else { g = (alias.p || 100) * it.qty; how = `birim bilinmiyor, ${it.qty} × ${alias.p || 100} g varsayıldı`; }
      }
      g = Math.round(g * 10) / 10;
      const notes = [`Yapay zekâsız yedek mod: USDA "${food.d.replace(/ \(Includes foods for USDA's Food Distribution Program\)/, '')}" tablosuyla eşleştirildi.`];
      if (how) notes.push(how + '.');
      if (alias.note) notes.push(alias.note + '.');
      items.push({ name: shown, qty: [it.qty === null ? '' : String(it.qty), it.unit ? unitLabel(it.unit) : (it.qty === null ? '' : 'adet')].filter(Boolean).join(' '),
        g, conf: 'düşük', basis: 'veri tabanı', note: notes.join(' '), search: null, brand: null, barcode: null, per100: { ...food.p }, src: { id: food.id, name: food.d } });
    }
    return { items, unmatched, source: db.source };
  }
  return { estimate, findFood, stats: () => { load(); return { foods: db.foods.length, aliases: ALIASES.length, source: db.source, built: db.built }; } };
}
