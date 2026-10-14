// Sporcu takibi mantığı testleri (hazır oluş, deload, kilo hedefi, protein dağılımı, kardiyo, CSV). Çalıştır: node test/athlete.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(root, 'public/athlete-util.js'), 'utf8'))(m);
const A = m.exports;

// hazır oluş
const best = A.readiness({ en: 5, sleepq: 5, mot: 5, sore: 1, stress: 1 });
const worst = A.readiness({ en: 1, sleepq: 1, mot: 1, sore: 5, stress: 5 });
ok(best.score === 100 && best.level === 'iyi', 'her şey iyi → 100, "Hazırsın"');
ok(worst.score === 0 && worst.level === 'cok-dusuk', 'her şey kötü → 0, dinlen');
ok(A.readiness({ en: 3, sleepq: 3 }) === null, '3\'ten az cevapla skor üretilmez');
ok(A.readiness({ en: 3, sleepq: 3, mot: 3, sore: 3, stress: 3 }).score === 50, 'hepsi orta (3) → 50');
const withSleep = A.readiness({ en: 3, sleepq: 3, mot: 3, sore: 3, stress: 3 }, 8 * 60), shortSleep = A.readiness({ en: 3, sleepq: 3, mot: 3, sore: 3, stress: 3 }, 4 * 60);
ok(withSleep.score > 50 && shortSleep.score < 50, 'ölçülen uyku skoru etkiler (8 sa ↑, 4 sa ↓)');
ok(A.readiness({ en: 9, sleepq: 'x', mot: 3, sore: 3, stress: 3 }).answered === 3, 'geçersiz değerler yok sayılır');

// deload
ok(!A.deload({ consecutiveWeeks: 3, rirAvg: 2, readinessAvg: 70, strengthChange: 1, sessions14: 6 }).need, 'sağlıklı durumda deload önerilmez');
const d2 = A.deload({ consecutiveWeeks: 7, rirAvg: 0.4, readinessAvg: 70, strengthChange: 1, sessions14: 6 });
ok(d2.need && d2.reasons.length === 2, 'uzun süre + tükeniş RIR → deload önerilir (2 neden)');
ok(A.deload({ consecutiveWeeks: 2, rirAvg: null, readinessAvg: 40, strengthChange: null, sessions14: 0 }).info, 'tek neden → yalnızca bilgi');
ok(A.deload({ consecutiveWeeks: 2, rirAvg: 0.2, readinessAvg: 90, strengthChange: null, sessions14: 1 }).reasons.length === 0, 'az antrenmanla RIR nedeni sayılmaz');

// kilo hedefi
let g = A.weightGoal({ cur: 90, target: 80, perWeek: -0.5, today: '2026-10-13' });
ok(g.onTrack && Math.round(g.weeks) === 20 && g.eta === '2027-03-02', '90→80 kg, -0,5 kg/hafta ≈ 20 hafta (ETA 2027-03-02): ' + g.eta);
ok(g.recLow === 0.45 && g.recHigh === 0.68, 'güvenli aralık %0,5–0,75 vücut ağırlığı/hafta (0,45–0,68 kg)');
g = A.weightGoal({ cur: 90, target: 80, perWeek: 0.2, today: '2026-10-13' });
ok(!g.onTrack && g.eta === undefined, 'ters yönde trend: hedefe doğru gitmiyor');
g = A.weightGoal({ cur: 90, target: 80, perWeek: null, targetDate: '2026-12-01', today: '2026-10-13' });
ok(g.aggressive && g.neededRate > 1.4, 'tarih çok yakınsa gereken hız agresif işaretlenir');
ok(g.dailyKcalDelta < 0 && g.dailyKcalDelta > -1200, 'günlük kalori açığı güvenli sınırla kısıtlı: ' + g.dailyKcalDelta);
g = A.weightGoal({ cur: 70, target: 75, perWeek: 0.25, today: '2026-10-13' });
ok(g.dir === 'gain' && g.onTrack && g.dailyKcalDelta > 0, 'kilo almada fazlalık yönü pozitif');
ok(A.weightGoal({ cur: 80, target: 80.1, today: '2026-10-13' }).reached, 'hedefe ulaşıldı (±0,2 kg)');
ok(A.weightGoal({ cur: 0, target: 80 }) === null, 'kilo yoksa hesap yok');

// hedef kiloya göre günlük kalori
const T = { today: '2026-10-14', tdee: 3000, bmr: 1900 };
let c = A.calorieAdjust({ ...T, weight: 90, target: 96, targetDate: '2026-10-31', goal: 'bulk' });
ok(c.dir === 'bulk' && c.capped && c.needed > 2.4, 'ekran görüntüsü: 90→96 kg, 17 günde = 2,5 kg/hafta isteniyor → güvenli sınırda kalır (capped)');
ok(c.delta > 0 && c.delta <= 600 && c.kcal === 3000 + c.delta, 'kalori fazlası %20 TDEE (600 kcal) ile sınırlı: +' + c.delta);
ok(Math.abs(c.rate - 0.45) < 0.06 && c.weeks > 12 && c.weeks < 16 && /^2027-0[12]/.test(c.eta), 'güvenli hızla ≈ 13 hafta, ETA ' + c.eta);
c = A.calorieAdjust({ ...T, weight: 90, target: 80, targetDate: '2027-03-01', goal: 'keep' });
ok(c.dir === 'cut' && !c.capped && c.delta < 0 && c.delta > -700, '90→80 kg, 20 haftada: makul açık ' + c.delta + ' kcal (yön hedeften gelir, seçili hedef "koru" olsa bile)');
c = A.calorieAdjust({ ...T, weight: 90, target: 80, targetDate: '2026-11-14', goal: 'cut' });
ok(c.capped && c.delta >= -750 && c.rate <= 0.9 + 1e-9, 'çok kısa tarihte açık güvenli sınırla (≤ %1/hafta ve ≤ %25 TDEE): ' + c.delta);
c = A.calorieAdjust({ ...T, tdee: 2000, bmr: 1900, weight: 90, target: 80, targetDate: '2026-11-14' });
ok(c.kcal === 1900, 'kalori bazal metabolizmanın altına inmez');
c = A.calorieAdjust({ ...T, weight: 90, target: 80, goal: 'cut' });
ok(Math.abs(c.rate - 0.5625) < 0.01 && c.eta, 'tarih yoksa önerilen orta hız (%0,625/hafta ≈ 0,56 kg)');
c = A.calorieAdjust({ ...T, weight: 80, target: 80.1, goal: 'cut' });
ok(!c.target && c.delta === -500, 'hedef kiloya zaten ulaşıldıysa (±0,2 kg) eski hedef seçimine döner');
c = A.calorieAdjust({ ...T, weight: 80, target: 0, goal: 'bulk' });
ok(!c.target && c.delta === 300 && c.kcal === 3300, 'hedef kilo yoksa eski davranış (kas +300)');
c = A.calorieAdjust({ ...T, weight: 70, target: 75, targetDate: '2026-10-10', goal: 'bulk' });
ok(c.pastDue && c.target, 'geçmiş tarih işaretlenir');

// kendi dinlenme süren
const pr = A.parseRest;
ok(pr('75') === 75 && pr('75 sn') === 75 && pr('75sn') === 75 && pr('75 saniye') === 75 && pr('75s') === 75, 'parseRest: 75 / 75 sn / 75sn / 75 saniye / 75s → 75 saniye');
ok(pr('1:30') === 90 && pr('0:45') === 45 && pr('2:00') === 120 && pr('1:5') === 65, 'parseRest: dakika:saniye (1:30 = 90, 0:45 = 45, 1:5 = 65)');
ok(pr('2 dk') === 120 && pr('2dk') === 120 && pr('1,5 dk') === 90 && pr('1.5 dakika') === 90 && pr('2 min') === 120, 'parseRest: dakika (2 dk, 1,5 dk, 2 min)');
ok(pr('1 dk 30 sn') === 90 && pr('2 dk 15') === 135, 'parseRest: "1 dk 30 sn" = 90, "2 dk 15" = 135');
ok(pr('3') === 180 && pr('2') === 120 && pr('9') === 540 && pr('10') === 10 && pr('90') === 90, 'parseRest: yalın sayı 10\'un altı dakika (3 = 3 dk), 10 ve üstü saniye (90 = 90 sn)');
ok(pr('') === null && pr('abc') === null && pr('1:75') === null && pr('-5') === null && pr(null) === null && pr('1 saat') === null, 'parseRest: geçersiz girdiler null');
ok(pr('9 sn') === null && pr('5 sn') === null && pr('16 dk') === null && pr('2000') === null && pr('0') === null, 'parseRest: 10 sn altı ve 15 dk üstü reddedilir');
ok(pr('  75  SN ') === 75 && pr('1:30 ') === 90, 'parseRest: boşluk ve büyük harf toleransı');

// protein
let p = A.proteinPlan({ weightKg: 80, goal: 'cut', meals: [{ type: 'Kahvaltı', protein: 30 }, { type: 'Öğle', protein: 45 }, { type: 'Akşam', protein: 50 }, { type: 'Atıştırmalık', protein: 20 }], trained: false });
ok(Math.abs(p.gkg - 145 / 80) < 1e-9 && p.status === 'ok' && p.spread === 'iyi' && p.strong === 4, 'iyi dağılmış 145 g / 80 kg = 1,81 g/kg → ok');
ok(p.perMeal === 30, '80 kg için öğün başı hedef 30 g');
p = A.proteinPlan({ weightKg: 80, goal: 'cut', meals: [{ type: 'Akşam', protein: 120 }], trained: true });
ok(p.spread === 'zayif' && p.timing === 'eksik', 'tek öğünde yığılma = zayıf dağılım; antrenman sonrası protein yok = eksik');
p = A.proteinPlan({ weightKg: 80, goal: 'bulk', meals: [{ type: 'Antrenman sonrası', protein: 35 }, { type: 'Akşam', protein: 40 }], trained: true });
ok(p.timing === 'iyi' && p.post === 35, 'antrenman sonrası ≥20 g protein = iyi');
ok(A.proteinPlan({ weightKg: 80, goal: 'cut', meals: [], trained: false }).spread === null, 'öğün yoksa dağılım değerlendirilmez');
ok(A.proteinPlan({ weightKg: 80, goal: 'cut', meals: [{ type: 'Öğle', protein: 40 }] }).status === 'low', 'günlük protein çok düşükse "low"');

// kardiyo
ok(A.cardioStat('Koşu', 30, 5) === '30 dk · 5 km · 6:00 /km', 'koşu temposu 6:00 /km: ' + A.cardioStat('Koşu', 30, 5));
ok(A.cardioStat('Bisiklet', 60, 24) === '60 dk · 24 km · 24 km/sa', 'bisiklet hızı km/sa');
ok(A.cardioStat('Yüzme', 30, 1.5) === '30 dk · 1,5 km · 2:00 /100 m', 'yüzme 100 m temposu');
ok(A.cardioStat('Koşu', 20, 0) === '20 dk' && A.cardioStat('Koşu', 0, 5) === '', 'mesafe/süre yoksa yalnızca süre ya da boş');

// CSV
const csv = A.toCsv(['Tarih', 'Not', 'Kilo'], [['2026-10-13', 'a;b "c"', 80.5], ['2026-10-14', '=1+1', null]]);
ok(csv === 'Tarih;Not;Kilo\r\n2026-10-13;"a;b ""c""";80,5\r\n2026-10-14;\'=1+1;\r\n', 'CSV: ayraç, tırnak kaçışı, ondalık virgül, formül enjeksiyonu engeli');

console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
