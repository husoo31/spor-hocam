/* İçecek tablosu (saf mantık; tarayıcıda window.DRK, Node'da module.exports).
   "250 ml beyaz monster", "1 kutu kola", "2 çay bardağı çay" gibi yazıları tanır ve 100 ml başına bilinen değerlerle miktara göre hesaplar.
   Yalnızca tablodaki içecek + miktar dışında hiçbir şey kalmayan parçalar alınır; gerisi (yiyecekler, tabloda olmayan ürünler) olduğu gibi yapay zekâya bırakılır.
   Değerler 100 ml içindir ve etiket/USDA ortalamasıdır; ülkeye ve ürün serisine göre biraz değişebilir (güven: orta). */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.DRK = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const fold = s => String(s == null ? '' : s).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.,\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  // ml: serving = miktar yazılmadığında varsayılan, can = kutu, glass = bardak (varsayılan 200), cup = fincan, caf = kafein mg/100 ml
  // ok: addaki marka/renk gibi serbest bırakılan ek sözcükler (yoksa kalan her sözcük, parçayı yapay zekâya bırakır)
  const COLORS = ['red', 'blue', 'violet', 'paradise', 'gold', 'rosa', 'kirmizi', 'mavi', 'mor', 'sari', 'pembe', 'siyah', 'black', 'zero', 'sugar', 'free', 'sugarfree', 'sekersiz', 'white', 'beyaz'];
  const DRINKS = [
    { id: 'monster-ultra', name: 'Monster Ultra (beyaz, şekersiz enerji içeceği)', conf: 'orta', serving: 500, can: 500, caf: 32,
      alias: ['beyaz monster', 'monster beyaz', 'monster ultra white', 'ultra white monster', 'monster white', 'monster ultra', 'ultra monster', 'monster zero ultra', 'monster zero', 'zero monster', 'monster sekersiz', 'sekersiz monster', 'monster sugar free', 'monster sugarfree'],
      ok: COLORS, per100: { kcal: 2, protein: 0, carbs: 0.6, fat: 0, sugar: 0 } },
    { id: 'monster', name: 'Monster Energy (klasik yeşil enerji içeceği)', conf: 'orta', serving: 500, can: 500, caf: 32,
      alias: ['monster energy', 'yesil monster', 'monster yesil', 'monster'],
      per100: { kcal: 46, protein: 0, carbs: 11, fat: 0, sugar: 11 } },
    { id: 'redbull-sf', name: 'Red Bull Sugarfree (şekersiz enerji içeceği)', conf: 'orta', serving: 250, can: 250, caf: 32,
      alias: ['red bull sugarfree', 'red bull sugar free', 'redbull sugarfree', 'red bull sekersiz', 'red bull zero', 'redbull zero', 'sekersiz red bull', 'red bull light'],
      per100: { kcal: 3, protein: 0, carbs: 0.5, fat: 0, sugar: 0 } },
    { id: 'redbull', name: 'Red Bull (enerji içeceği)', conf: 'orta', serving: 250, can: 250, caf: 32,
      alias: ['red bull', 'redbull'],
      per100: { kcal: 45, protein: 0.4, carbs: 11, fat: 0, sugar: 11 } },
    { id: 'cola-zero', name: 'Kola (şekersiz / zero / light)', conf: 'orta', serving: 330, can: 330, caf: 10,
      alias: ['coca cola zero', 'coca-cola zero', 'coca cola light', 'coca-cola light', 'coke zero', 'diet coke', 'diet cola', 'diyet kola', 'kola zero', 'kola light', 'kola sekersiz', 'sekersiz kola', 'zero kola', 'light kola', 'cola zero', 'pepsi max', 'pepsi zero', 'pepsi light'],
      per100: { kcal: 0.3, protein: 0, carbs: 0, fat: 0, sugar: 0 } },
    { id: 'cola', name: 'Kola (Coca-Cola, Pepsi vb.)', conf: 'orta', serving: 330, can: 330, caf: 10,
      alias: ['coca cola', 'coca-cola', 'cocacola', 'cola turka', 'coke', 'pepsi', 'cola', 'kola'],
      per100: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, sugar: 10.6 } },
    { id: 'burn-zero', name: 'Burn Zero (şekersiz enerji içeceği)', conf: 'orta', serving: 250, can: 250, caf: 32,
      alias: ['burn zero', 'burn sekersiz', 'sekersiz burn', 'burn light', 'burn sugarfree', 'burn sugar free'],
      per100: { kcal: 2, protein: 0, carbs: 0.5, fat: 0, sugar: 0 } },
    { id: 'burn', name: 'Burn (enerji içeceği)', conf: 'orta', serving: 250, can: 250, caf: 32,
      alias: ['burn energy', 'burn'],
      per100: { kcal: 45, protein: 0, carbs: 11, fat: 0, sugar: 11 } },
    { id: 'enerji', name: 'Enerji içeceği (marka belirtilmedi, şekerli varsayıldı)', conf: 'düşük', serving: 250, can: 250, caf: 32,
      alias: ['enerji icecegi', 'enerji icecek'],
      per100: { kcal: 45, protein: 0, carbs: 11, fat: 0, sugar: 11 } },
    { id: 'fanta', name: 'Fanta (portakallı gazlı içecek)', conf: 'düşük', serving: 330, can: 330,
      alias: ['fanta portakal', 'fanta orange', 'fanta'],
      ok: ['limon', 'mandalina', 'visne', 'seftali', 'karpuz', 'cilek', 'ananas', 'mango', 'orange'],
      per100: { kcal: 40, protein: 0, carbs: 9.6, fat: 0, sugar: 9.6 } },
    { id: 'sprite', name: 'Sprite / 7Up (limonlu gazlı içecek)', conf: 'düşük', serving: 330, can: 330,
      alias: ['sprite', '7up', '7 up', 'seven up'],
      per100: { kcal: 37, protein: 0, carbs: 9, fat: 0, sugar: 9 } },
    { id: 'gazoz', name: 'Gazoz (Uludağ vb.)', conf: 'düşük', serving: 250, can: 330,
      alias: ['uludag gazoz', 'meyveli gazoz', 'gazoz'],
      ok: ['portakal', 'limon', 'visne', 'seftali', 'elma', 'cilek', 'ananas', 'mandalina'],
      per100: { kcal: 38, protein: 0, carbs: 9.5, fat: 0, sugar: 9.5 } },
    { id: 'limonata', name: 'Limonata (Uludağ vb. hazır, şekerli)', conf: 'düşük', serving: 250, can: 330,
      alias: ['uludag limonata', 'hazir limonata', 'limonata'],
      per100: { kcal: 40, protein: 0, carbs: 9.8, fat: 0, sugar: 9.5 } },
    { id: 'icetea-zero', name: 'Ice tea (şekersiz / zero)', conf: 'orta', serving: 330, can: 330,
      alias: ['ice tea zero', 'icetea zero', 'ice tea sekersiz', 'sekersiz ice tea', 'fuse tea zero', 'fusetea zero', 'fuzetea zero', 'lipton zero', 'lipton ice tea zero', 'lipton ice tea sekersiz', 'nestea zero', 'buzlu cay sekersiz', 'sekersiz buzlu cay'],
      ok: ['seftali', 'limon', 'mango', 'ananas', 'orman', 'meyve', 'meyveli', 'visne'],
      per100: { kcal: 2, protein: 0, carbs: 0.4, fat: 0, sugar: 0 } },
    { id: 'icetea', name: 'Ice tea (Lipton, FuseTea, Nestea vb.; şekerli)', conf: 'düşük', serving: 330, can: 330,
      alias: ['lipton ice tea', 'fuse tea', 'fusetea', 'fuzetea', 'fuze tea', 'nestea', 'nestle ice tea', 'ice tea', 'icetea', 'buzlu cay', 'lipton'],
      ok: ['seftali', 'limon', 'mango', 'ananas', 'orman', 'meyve', 'meyveli', 'visne', 'karpuz', 'kavun', 'yesil', 'cay'],
      per100: { kcal: 20, protein: 0, carbs: 5, fat: 0, sugar: 5 } },
    { id: 'ayran', name: 'Ayran', conf: 'orta', serving: 200, can: 200, glass: 200,
      alias: ['yayik ayrani', 'ayran'],
      per100: { kcal: 32, protein: 2, carbs: 2.6, fat: 1.6 } },
    { id: 'sut-yagsiz', name: 'Süt (yağsız)', conf: 'orta', serving: 200,
      alias: ['yagsiz sut', 'light sut', 'sut yagsiz'],
      per100: { kcal: 35, protein: 3.4, carbs: 5, fat: 0.1, sugar: 5 } },
    { id: 'sut-yarim', name: 'Süt (yarım yağlı)', conf: 'orta', serving: 200,
      alias: ['yarim yagli sut', 'yari yagli sut', 'yarim yagli', 'sut yarim yagli'],
      per100: { kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5, sugar: 4.9 } },
    { id: 'sut', name: 'Süt (tam yağlı)', conf: 'orta', serving: 200,
      alias: ['tam yagli sut', 'inek sutu', 'sut'],
      per100: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, sugar: 4.8 } },
    { id: 'soda', name: 'Soda / maden suyu (sade)', conf: 'yüksek', serving: 200, can: 200,
      alias: ['sade soda', 'sade maden suyu', 'maden suyu', 'maden sodasi', 'soda'],
      per100: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
    { id: 'portakal-suyu', name: 'Portakal suyu', conf: 'orta', serving: 200,
      alias: ['portakal suyu', 'taze portakal suyu', 'meyve suyu portakal'],
      per100: { kcal: 45, protein: 0.7, carbs: 10.4, fat: 0.2, sugar: 8.4, fiber: 0.2 } },
    { id: 'elma-suyu', name: 'Elma suyu', conf: 'orta', serving: 200,
      alias: ['elma suyu'],
      per100: { kcal: 46, protein: 0.1, carbs: 11.3, fat: 0.1, sugar: 9.6 } },
    { id: 'meyve-suyu', name: 'Meyve suyu (paketli, cinsi belirtilmemiş)', conf: 'düşük', serving: 200,
      alias: ['meyve suyu', 'meyve suyu kutu', 'cappy', 'dimes', 'tropicana'],
      ok: ['seftali', 'visne', 'kayisi', 'karisik', 'vitamin', 'nektar', 'nektari', 'ananas', 'mango', 'kiraz', 'elma', 'portakal', 'havuc', 'multivitamin'],
      per100: { kcal: 46, protein: 0.3, carbs: 11, fat: 0.1, sugar: 10 } },
    { id: 'cay', name: 'Çay (şekersiz)', conf: 'orta', serving: 100, glass: 100,
      alias: ['sekersiz cay', 'sade cay', 'demli cay', 'cay'],
      per100: { kcal: 1, protein: 0, carbs: 0.2, fat: 0 } },
    { id: 'turk-kahvesi', name: 'Türk kahvesi (şekersiz)', conf: 'orta', serving: 70, cup: 70, glass: 100,
      alias: ['sekersiz turk kahvesi', 'sade turk kahvesi', 'turk kahvesi'],
      per100: { kcal: 2, protein: 0.1, carbs: 0.3, fat: 0.1 } },
    { id: 'filtre-kahve', name: 'Filtre kahve (şekersiz, sütsüz)', conf: 'orta', serving: 240, cup: 150, glass: 200,
      alias: ['filtre kahve', 'sade kahve', 'sekersiz kahve', 'kahve'],
      per100: { kcal: 1, protein: 0.1, carbs: 0, fat: 0 } },
  ];

  const NUMW = { yarim: 0.5, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5 };
  const FILLER = new Set(['icecek', 'icecegi', 'icecekleri', 'enerji', 'kadar', 'yaklasik', 'civari', 'olan', 'bir', 'adet', 'tane', 'kutu', 'kutusu', 'lik', 'luk', 'si']);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // eşleşme sırası: tablodaki sıra (özel olan genelden önce tanımlıdır), kalem içinde uzun ad önce; genel kalem ('enerji içeceği') bir markanın adını ezmesin
const ALIASES = DRINKS.flatMap(d => d.alias.map(a => ({ a: fold(a), d })).sort((x, y) => y.a.length - x.a.length));
  const num = s => { s = String(s).replace(',', '.'); return NUMW[s] !== undefined ? NUMW[s] : Number(s); };
  const NUM = '(\\d+(?:[.,]\\d+)?|yarim|bir|iki|uc|dort|bes)';

  // tek bir parçayı (kısa metin) çözer: { drink, ml, count, qty, note } ya da null
  function parseSegment(seg, userNames) {
    let s = ' ' + fold(seg) + ' ';
    if (s.trim().length < 3) return null;
    s = s.replace(/ su bardagi /g, ' su_bardagi ').replace(/ cay bardagi /g, ' cay_bardagi '); // birim, "çay" / "su" adıyla karışmasın
    if ((userNames || []).some(n => n && s.includes(' ' + fold(n) + ' '))) return null; // kullanıcının kendi doğrulanmış ürünü önceliklidir
    let hit = null;
    for (const x of ALIASES) { const re = new RegExp('(^|\\s)' + esc(x.a) + '(?=\\s|$)'); if (re.test(s)) { hit = x; break; } }
    if (!hit) return null;
    const d = hit.d;
    s = s.replace(new RegExp('(^|\\s)' + esc(hit.a) + '(?=\\s|$)'), ' ');
    let ml = 0, count = 1, how = '', m;
    if ((m = s.match(new RegExp('(?:^|\\s)' + NUM + '\\s*(ml|cl|lt|litre|liter|l)(?=\\s|$)')))) {
      const v = num(m[1]), u = m[2];
      ml = u === 'ml' ? v : u === 'cl' ? v * 10 : v * 1000; how = 'ml';
      s = s.replace(m[0], ' ');
    } else if ((m = s.match(new RegExp('(?:^|\\s)(?:' + NUM + '\\s*)?(su_bardagi|cay_bardagi|bardak|bardagi|fincan|kutu|sise|kupa)(?=\\s|$)')))) {
      count = m[1] ? num(m[1]) : 1;
      const u = m[2];
      const per = u === 'cay_bardagi' ? 100 : u === 'su_bardagi' ? 200 : u === 'kupa' ? 250
        : (u === 'bardak' || u === 'bardagi') ? (d.glass || 200) : u === 'fincan' ? (d.cup || d.serving)
        : u === 'kutu' ? (d.can || d.serving) : d.serving; // şişe boyu bilinmez: varsayılan porsiyon
      ml = count * per; how = u === 'sise' ? 'sise' : 'unit';
      s = s.replace(m[0], ' ');
    } else if ((m = s.match(new RegExp('(?:^|\\s)' + NUM + '(?=\\s|$)')))) { // "2 monster"
      count = num(m[1]); ml = count * d.serving; how = 'count';
      s = s.replace(m[0], ' ');
    } else { ml = d.serving; how = 'default'; }
    // geriye yalnızca dolgu sözcükler (ve markaya özgü serbest sözcükler) kalmalı
    const left = s.split(' ').filter(Boolean).filter(w => !FILLER.has(w) && !(d.ok && d.ok.includes(w)));
    if (left.length) return null;
    if (!(ml >= 10 && ml <= 3000)) return null;
    return { drink: d, ml, how, count };
  }

  const r1 = x => Math.round(x * 10) / 10;
  function toItem(p) {
    const d = p.drink, ml = p.ml;
    const qty = (p.how === 'default' || p.how === 'sise') ? `${r1(ml)} ml (varsayılan porsiyon)` : `${r1(ml)} ml`;
    const notes = [];
    if (d.caf) notes.push(`Kafein ≈ ${Math.round(d.caf * ml / 100)} mg.`);
    if (p.how === 'default' || p.how === 'sise') notes.push('Miktar yazılmadığı için tipik ' + d.serving + ' ml varsayıldı; farklıysa miktarı düzelt.');
    if (d.conf !== 'yüksek') notes.push('Değerler tipik etiket ortalamasıdır; paketteki değeri kontrol et.');
    return { name: d.name, qty, g: ml, conf: p.how === 'default' || p.how === 'sise' ? 'düşük' : d.conf, basis: 'içecek tablosu', note: notes.join(' '),
      per100: { ...d.per100 }, drink: d.id };
  }

  // metni parçalara böler; içecek olanları kalem yapar, kalanı (yapay zekâya gidecek metin) geri verir
  function extract(text, userNames) {
    const segs = String(text || '').split(/\s*(?:;|\+|&|\n|\bve\b|\bile\b|(?<!\d),|,(?!\d))\s*/i).filter(x => x.trim());
    const items = [], rest = [];
    for (const sg of segs) { const p = parseSegment(sg, userNames); if (p) items.push(toItem(p)); else rest.push(sg.trim()); }
    return { items, rest: rest.join(', ') };
  }
  return { fold, DRINKS, parseSegment, extract };
});
