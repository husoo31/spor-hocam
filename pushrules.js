// Hatırlatma kuralları (sunucu tarafı): hangi bildirimin şimdi gönderilmesi gerektiğini belirler. Saf mantık; test/pushrules.test.mjs ile sınanır.
// Mantık, istemcideki "Bekleyenler" kartıyla aynıdır: yalnızca henüz yapılmamış işler için ve yalnızca belirlenen saatten sonraki 20 dakika içinde bildirir.

export const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: String(tz) }); return true; } catch (e) { return false; } };

// bir an için kullanıcının yerel tarihi, gün başından beri dakika ve haftanın günü (0 = Pazar)
export function localNow(nowMs, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date(nowMs)).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour) * 60 + (+p.minute), dow };
}
const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? (+m[1]) * 60 + (+m[2]) : null; };

export const WINDOW_MIN = 20;
// cfg: { rem:{chk,supp,weigh,weighDay,train,water}, trainDays:[0-6], hasSupps, waterGoal }, state: { date, chk, suppDone, weigh, trainDone, waterMl }
export function dueReminders({ cfg, state, nowMs, tz }) {
  const out = [], L = localNow(nowMs, tz), R = (cfg && cfg.rem) || {}, st = state && state.date === L.date ? state : {}; // bugün eşitlenmemişse hiçbir şey yapılmamış sayılır
  const add = (id, at, title, body, slot) => { if (at !== null && L.min >= at && L.min - at <= WINDOW_MIN) out.push({ id, title, body, key: `${L.date}|${id}|${slot || 0}`, tag: 'sh-' + id }); };
  if (R.chk && !st.chk) add('chk', toMin(R.chk), '🔋 Sabah kontrolü', 'Nasıl hissediyorsun? Hazır oluş sorularını cevapla.');
  if (R.supp && cfg.hasSupps && !st.suppDone) add('supp', toMin(R.supp), '💊 Takviyeler', 'Bugünkü takviyelerini işaretlemeyi unutma.');
  if (R.weigh && R.weighDay !== undefined && R.weighDay !== '' && +R.weighDay === L.dow && !st.weigh) add('weigh', toMin(R.weigh), '⚖ Tartılma günü', 'Bugün tartılma günün; sabah aç karnına tart.');
  if (R.train && (cfg.trainDays || []).includes(L.dow) && !st.trainDone) add('train', toMin(R.train), '🏋 Antrenman', 'Bugün antrenman günün.');
  const wh = +R.water || 0;
  if (wh >= 1 && wh <= 3) {
    const goal = Number(cfg.waterGoal) > 0 ? Number(cfg.waterGoal) : 2500, have = Number(st.waterMl) || 0;
    for (let h = 9, i = 0; h <= 21; h += wh, i++) {
      if (have < goal * Math.min(1, (h - 8) / 13) * 0.8) add('water', h * 60, '💧 Su', `Su içmeyi unutma; bugün şu ana kadar ${(have / 1000).toFixed(1).replace('.', ',')} L.`, i);
    }
  }
  return out;
}
