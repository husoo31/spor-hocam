// Hatırlatma kuralları (sunucu tarafı) testleri. Çalıştır: node test/pushrules.test.mjs
import { dueReminders, localNow, validTz } from '../pushrules.js';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const TZ = 'Europe/Istanbul';
// 2026-10-14 (Çarşamba) yerel saat t (UTC+3) → ms
const at = (hh, mm, day = 14) => Date.UTC(2026, 9, day, hh - 3, mm);
const base = { rem: { chk: '08:00', supp: '09:00', weigh: '07:30', weighDay: '3', train: '18:00', water: '2' }, trainDays: [1, 2, 3, 5], hasSupps: true, waterGoal: 3000 };
const ids = d => d.map(x => x.id).sort().join(',');

const L = localNow(at(23, 50), TZ);
ok(L.date === '2026-10-14' && L.min === 23 * 60 + 50 && L.dow === 3, 'yerel saat/tarih/gün: İstanbul 23:50 Çarşamba (UTC 20:50)');
ok(localNow(Date.UTC(2026, 9, 14, 21, 30), TZ).date === '2026-10-15', 'gece yarısını geçince yerel tarih değişir (UTC 21:30 = ertesi gün 00:30)');
ok(localNow(Date.UTC(2026, 9, 14, 12, 0), 'America/New_York').min === 8 * 60, 'saat dilimi: New York 08:00');
ok(validTz('Europe/Istanbul') && !validTz('Mars/Olympus') && !validTz(''), 'saat dilimi doğrulama');

ok(ids(dueReminders({ cfg: base, state: {}, nowMs: at(8, 5), tz: TZ })) === 'chk', '08:05: sabah kontrolü bildirilir (tartılma 07:30 + 20 dk penceresini geçti)');
ok(ids(dueReminders({ cfg: base, state: {}, nowMs: at(7, 45), tz: TZ })) === 'weigh', '07:45: tartılma günü hatırlatması');
ok(dueReminders({ cfg: base, state: {}, nowMs: at(7, 29), tz: TZ }).length === 0, '07:29: henüz saati gelmedi');
ok(dueReminders({ cfg: base, state: {}, nowMs: at(8, 21), tz: TZ }).every(x => x.id !== 'chk'), 'saatten 20 dakika sonra geç kalmış bildirim gönderilmez');
ok(ids(dueReminders({ cfg: base, state: { date: '2026-10-14', chk: true, weigh: true }, nowMs: at(8, 5), tz: TZ })) === '' && ids(dueReminders({ cfg: base, state: { date: '2026-10-14', chk: true, weigh: true }, nowMs: at(7, 45), tz: TZ })) === '', 'yapılmış işler için bildirim yok');
ok(ids(dueReminders({ cfg: base, state: { date: '2026-10-13', chk: true, weigh: true }, nowMs: at(8, 5), tz: TZ })) === 'chk', 'dünkü durum bugünü etkilemez');
ok(ids(dueReminders({ cfg: base, state: {}, nowMs: at(9, 3), tz: TZ })).includes('supp'), '09:03: takviye hatırlatması');
ok(!ids(dueReminders({ cfg: { ...base, hasSupps: false }, state: {}, nowMs: at(9, 3), tz: TZ })).includes('supp'), 'takviye tanımlı değilse hatırlatma yok');
ok(!ids(dueReminders({ cfg: base, state: { date: '2026-10-14', suppDone: true }, nowMs: at(9, 3), tz: TZ })).includes('supp'), 'takviyeler alındıysa hatırlatma yok');
ok(ids(dueReminders({ cfg: base, state: {}, nowMs: at(18, 2), tz: TZ })).includes('train'), 'antrenman günü 18:02: antrenman hatırlatması');
ok(!ids(dueReminders({ cfg: base, state: {}, nowMs: at(18, 2, 15), tz: TZ })).includes('train') && ids(dueReminders({ cfg: base, state: {}, nowMs: at(18, 2, 16), tz: TZ })).includes('train'), 'antrenman yalnızca program günlerinde (Perşembe yok, Cuma var)');
ok(!ids(dueReminders({ cfg: base, state: { date: '2026-10-14', trainDone: true }, nowMs: at(18, 2), tz: TZ })).includes('train'), 'antrenman yapıldı/atlandı/dinlenme: hatırlatma yok');
ok(!ids(dueReminders({ cfg: base, state: {}, nowMs: at(8, 5, 15), tz: TZ })).includes('weigh'), 'tartılma yalnızca seçilen günde (Çarşamba)');
// su: 2 saatte bir (09, 11, 13…), hedefin gün içindeki payının %80'inin altındaysa
const w = dueReminders({ cfg: base, state: { date: '2026-10-14', waterMl: 200 }, nowMs: at(13, 4), tz: TZ });
ok(w.length === 1 && w[0].id === 'water' && w[0].key === '2026-10-14|water|2' && /0,2 L/.test(w[0].body), 'su: 13:04 yalnızca o saatin bildirimi (slot 2), içilen miktar yazılı');
ok(dueReminders({ cfg: base, state: { date: '2026-10-14', waterMl: 2500 }, nowMs: at(13, 4), tz: TZ }).length === 0, 'su yeterliyse hatırlatma yok');
ok(dueReminders({ cfg: base, state: { date: '2026-10-14', waterMl: 0 }, nowMs: at(22, 0), tz: TZ }).length === 0, 'su: 21:00 sonrası hatırlatma yok');
ok(dueReminders({ cfg: { rem: {}, hasSupps: true }, state: {}, nowMs: at(9, 0), tz: TZ }).length === 0, 'ayar boşsa hiçbir bildirim yok');
// anahtarlar günlük benzersiz: aynı hatırlatma ertesi gün yeniden gönderilebilir
const k1 = dueReminders({ cfg: base, state: {}, nowMs: at(8, 5), tz: TZ })[0].key, k2 = dueReminders({ cfg: base, state: {}, nowMs: at(8, 5, 15), tz: TZ })[0].key;
ok(k1 !== k2 && k1.startsWith('2026-10-14'), 'tekrarı önleyen anahtar günlük (ertesi gün yeniden bildirilebilir)');
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
