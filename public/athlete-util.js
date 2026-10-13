/* Sporcu takibi için saf mantık (tarayıcıda window.ATH, Node'da module.exports).
   Hazır oluş skoru, deload (hafif hafta) kuralı, kilo hedefi hızı, protein dağılımı, kardiyo hızı ve CSV üretimi.
   Hiçbir DOM/ağ erişimi yoktur; hepsi test/athlete.test.mjs ile sınanır. Öneriler genel spor bilimi kurallarıdır, tıbbi tavsiye değildir. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.ATH = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = x => { const n = Number(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) ? n : 0; };
  const r1 = x => Math.round(x * 10) / 10;

  /* ---------- sabah kontrolü / hazır oluş ---------- */
  // alan: [ad, soru, yüksek iyi mi, ağırlık]
  const CHK = [
    ['en', 'Enerji', true, 0.25], ['sleepq', 'Uyku kalitesi', true, 0.25], ['mot', 'Motivasyon', true, 0.15],
    ['sore', 'Kas ağrısı', false, 0.20], ['stress', 'Stres', false, 0.15],
  ];
  // chk: {en,sleepq,mot,sore,stress} (1-5); asleepMin: Apple Sağlık'tan gelen uyku süresi (dk) ya da null
  function readiness(chk, asleepMin) {
    const c = chk || {};
    let sum = 0, wsum = 0, answered = 0;
    for (const [k, , good, w] of CHK) {
      const v = num(c[k]);
      if (!(v >= 1 && v <= 5)) continue;
      answered++;
      let n = (v - 1) / 4; if (!good) n = 1 - n;
      if (k === 'sleepq' && asleepMin > 0) n = 0.5 * n + 0.5 * clamp((asleepMin / 60 - 4) / 4, 0, 1); // ölçülen uykuyla birleştir
      sum += n * w; wsum += w;
    }
    if (answered < 3) return null;
    const score = Math.round(sum / wsum * 100);
    return { score, answered, ...readinessAdvice(score) };
  }
  function readinessAdvice(score) {
    if (score >= 75) return { level: 'iyi', label: 'Hazırsın', advice: 'Toparlanman iyi görünüyor: planlı antrenmanı tam yap, ağır setlere yüklenebilirsin.' };
    if (score >= 55) return { level: 'orta', label: 'Normal', advice: 'Planlı antrenmanı yap; set aralarını ihmal etme, RIR 1–3 bandında kal.' };
    if (score >= 40) return { level: 'dusuk', label: 'Yorgunsun', advice: 'Hacmi yaklaşık %20–30 azalt ya da kiloyu %5–10 düşür; tükeniş setlerini bırak.' };
    return { level: 'cok-dusuk', label: 'Dinlenmeye ihtiyacın var', advice: 'Bugün dinlen ya da çok hafif hareket et (yürüyüş, esneme). Uykuyu öne al.' };
  }

  /* ---------- deload önerisi ---------- */
  // x: {consecutiveWeeks, rirAvg (son 14 gün, null olabilir), readinessAvg (son 7 gün), strengthChange (% hafta/hafta), sessions14}
  function deload(x) {
    const reasons = [];
    if (x.consecutiveWeeks >= 6) reasons.push(`${x.consecutiveWeeks} haftadır ara vermeden antrenman yapıyorsun`);
    if (x.rirAvg !== null && x.rirAvg !== undefined && x.sessions14 >= 3 && x.rirAvg <= 0.8) reasons.push(`setlerin çoğu tükenişe çok yakın (ort. RIR ${r1(x.rirAvg)})`);
    if (x.readinessAvg !== null && x.readinessAvg !== undefined && x.readinessAvg < 55) reasons.push(`hazır oluş skorun düşük (ort. ${Math.round(x.readinessAvg)}/100)`);
    if (x.strengthChange !== null && x.strengthChange !== undefined && x.strengthChange <= -3) reasons.push(`gücün geçen haftaya göre %${r1(Math.abs(x.strengthChange))} düştü`);
    const need = reasons.length >= 2;
    return { need, info: !need && reasons.length === 1, reasons,
      plan: 'Bir hafta boyunca set sayısını yaklaşık yarıya indir, kiloyu %10 düşür, her sette RIR 3–4 bırak; uyku ve proteini koru.' };
  }

  /* ---------- kilo hedefi ---------- */
  // cur/target kg; perWeek: trend kg/hafta (null olabilir); targetDate 'YYYY-MM-DD' (isteğe bağlı); today 'YYYY-MM-DD'
  function weightGoal({ cur, target, perWeek, targetDate, today }) {
    cur = num(cur); target = num(target);
    if (!(cur > 0) || !(target > 0)) return null;
    const diff = target - cur, dir = diff < 0 ? 'loss' : 'gain';
    if (Math.abs(diff) < 0.2) return { reached: true, diff };
    const recLow = dir === 'loss' ? cur * 0.005 : cur * 0.0025, recHigh = dir === 'loss' ? cur * 0.0075 : cur * 0.005; // kg/hafta
    const out = { reached: false, diff, dir, remaining: Math.abs(diff), recLow: Math.round(recLow * 100) / 100, recHigh: Math.round(recHigh * 100) / 100 };
    const pw = perWeek === null || perWeek === undefined ? null : Number(perWeek);
    if (pw !== null) {
      const right = (dir === 'loss' && pw < -0.05) || (dir === 'gain' && pw > 0.05);
      out.rate = pw; out.onTrack = right;
      if (right) { out.weeks = Math.abs(diff) / Math.abs(pw); const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + Math.round(out.weeks * 7)); out.eta = d.toISOString().slice(0, 10); }
    }
    if (targetDate && today && targetDate > today) {
      const wk = (new Date(targetDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 864e5 / 7;
      out.neededRate = Math.abs(diff) / wk; out.neededPct = out.neededRate / cur * 100;
      out.aggressive = dir === 'loss' ? out.neededPct > 1 : out.neededPct > 0.6;
    } else if (targetDate && today && targetDate <= today) out.pastDue = true;
    // önerilen haftalık hız: tarih varsa gereken (güvenli aralıkla sınırlı), yoksa aralığın ortası
    const chosen = out.neededRate ? clamp(out.neededRate, recLow, recHigh * 1.4) : (recLow + recHigh) / 2;
    out.chosenRate = chosen;
    out.dailyKcalDelta = Math.round(chosen * 7700 / 7) * (dir === 'loss' ? -1 : 1); // gerçek harcamaya eklenecek kcal
    return out;
  }

  /* ---------- hedef kiloya göre günlük kalori ----------
     Hedef kilo (ve varsa tarih) → haftalık hız → günlük kalori açığı/fazlası (1 kg ≈ 7700 kcal).
     Hız güvenli sınırlarda tutulur: verirken en çok %1, alırken en çok %0,5 vücut ağırlığı / hafta; günlük açık en çok TDEE'nin %25'i (ve 1000 kcal),
     fazla en çok %20'si. Kalori bazal metabolizmanın altına inmez. Hedef yoksa eski davranış: yağ yakma -%20 (en çok 500), kas +300. */
  function calorieAdjust({ weight, target, targetDate, today, tdee, bmr, goal }) {
    weight = num(weight); target = num(target); tdee = num(tdee); bmr = num(bmr);
    const floor = k => Math.round(Math.max(k, bmr));
    const hasT = weight > 0 && target > 0 && Math.abs(target - weight) >= 0.2;
    if (!hasT) {
      const d = goal === 'cut' ? -Math.min(500, tdee * 0.2) : goal === 'bulk' ? 300 : 0;
      return { target: false, dir: goal || 'keep', delta: Math.round(d), rate: Math.abs(d) * 7 / 7700, kcal: floor(tdee + d) };
    }
    const diff = target - weight, loss = diff < 0, remaining = Math.abs(diff);
    const minRate = weight * (loss ? 0.0025 : 0.0015), maxRate = weight * (loss ? 0.01 : 0.005), mid = weight * (loss ? 0.00625 : 0.00375);
    let needed;
    if (targetDate && today && targetDate > today) needed = remaining / ((new Date(targetDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 864e5 / 7);
    let rate = needed !== undefined ? clamp(needed, minRate, maxRate) : mid;
    let delta = rate * 7700 / 7;
    delta = Math.min(delta, loss ? Math.min(tdee * 0.25, 1000) : tdee * 0.2);
    let kcal = loss ? tdee - delta : tdee + delta;
    if (loss && bmr > 0 && kcal < bmr) { kcal = bmr; delta = tdee - bmr; }
    rate = delta * 7 / 7700;
    const out = { target: true, dir: loss ? 'cut' : 'bulk', remaining, delta: Math.round(loss ? -delta : delta), rate, kcal: Math.round(kcal), weeks: rate > 0 ? remaining / rate : null };
    if (out.weeks && today) { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + Math.round(out.weeks * 7)); out.eta = d.toISOString().slice(0, 10); }
    if (needed !== undefined) { out.needed = needed; out.capped = needed > rate * 1.05; }
    if (targetDate && today && targetDate <= today) out.pastDue = true;
    return out;
  }

  /* ---------- protein dağılımı ---------- */
  const PRO_RANGE = { cut: [1.8, 2.4], keep: [1.4, 2.0], bulk: [1.6, 2.2] };
  // meals: [{type, protein}]; trained: bugün antrenman var/yapıldı
  function proteinPlan({ weightKg, goal, meals, trained }) {
    const w = num(weightKg), list = meals || [];
    const total = list.reduce((a, m) => a + num(m.protein), 0);
    const range = PRO_RANGE[goal] || PRO_RANGE.keep;
    const out = { total: Math.round(total), range };
    if (w > 0) {
      out.gkg = total / w;
      out.status = out.gkg < range[0] * 0.9 ? 'low' : out.gkg > range[1] * 1.15 ? 'high' : 'ok';
      out.perMeal = clamp(Math.round(0.4 * w / 5) * 5, 20, 45); // öğün başına hedef protein
    } else out.perMeal = 30;
    const by = {};
    list.forEach(m => { by[m.type] = (by[m.type] || 0) + num(m.protein); });
    out.by = by;
    const strong = Object.values(by).filter(v => v >= 20).length; // 20 g ve üzeri protein içeren öğün sayısı
    out.strong = strong;
    out.spread = list.length === 0 ? null : strong >= 3 ? 'iyi' : strong === 2 ? 'orta' : 'zayif';
    out.pre = by['Antrenman öncesi'] || 0; out.post = by['Antrenman sonrası'] || 0;
    out.timing = !trained ? null : (out.post >= 20 ? 'iyi' : 'eksik');
    return out;
  }

  /* ---------- kardiyo ---------- */
  const CARDIO = ['Koşu', 'Yürüyüş', 'Bisiklet', 'Yüzme', 'Kürek', 'Eliptik', 'HIIT', 'Diğer'];
  function cardioStat(t, min, km) {
    min = num(min); km = num(km);
    if (!(min > 0)) return '';
    if (!(km > 0)) return `${Math.round(min)} dk`;
    const dist = `${String(r1(km)).replace('.', ',')} km`;
    if (t === 'Koşu' || t === 'Yürüyüş') { const p = min / km, m = Math.floor(p), s = Math.round((p - m) * 60); return `${Math.round(min)} dk · ${dist} · ${m}:${String(s === 60 ? 59 : s).padStart(2, '0')} /km`; }
    if (t === 'Yüzme') { const p = min / (km * 10), m = Math.floor(p), s = Math.round((p - m) * 60); return `${Math.round(min)} dk · ${dist} · ${m}:${String(s === 60 ? 59 : s).padStart(2, '0')} /100 m`; }
    return `${Math.round(min)} dk · ${dist} · ${String(r1(km / (min / 60))).replace('.', ',')} km/sa`;
  }

  /* ---------- CSV (Excel TR için ; ayracı ve ondalık virgül; BOM indirirken eklenir) ---------- */
  function toCsv(headers, rows, sep) {
    sep = sep || ';';
    const cell = v => {
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formül enjeksiyonu: Excel'in hücreyi formül saymasını engelle
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers, ...rows].map(r => r.map(cell).join(sep)).join('\r\n') + '\r\n';
  }

  return { CHK, readiness, readinessAdvice, deload, weightGoal, calorieAdjust, proteinPlan, cardioStat, CARDIO, toCsv, PRO_RANGE };
});
