// Apple Sağlık uyku verisi: iPhone Kısayolları'nın gönderdiği parçaları (evre, başlangıç, bitiş) geceler hâlinde toplar.
// Saf fonksiyonlar; sunucu bunları /api/health-sync içinde kullanır, testler doğrudan çağırır.

const MIN = 60000;
const GAP_MIN = 90;            // iki parça arasında bundan uzun boşluk varsa ayrı uyku oturumu
const MIN_SLEEP_MIN = 15;      // bundan kısa oturumlar (kestirme/gürültü) kaydedilmez
const MAX_SEG_MIN = 16 * 60;   // tek parça bundan uzunsa geçersiz say
const KEEP_NIGHTS = 120;

// Evre öncelikleri (aynı dakikada birden çok kaynak varsa yüksek olan kazanır)
// deep > rem > core > awake > asleep (belirtilmemiş) > inbed
const PRIO = { deep: 6, rem: 5, core: 4, awake: 3, asleep: 2, inbed: 1 };

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ı/g, 'i');

// "Deep", "Derin", "REM", "Core", "Çekirdek", "Awake", "Uyanık", "In Bed", "Yatakta", "Asleep", 0-5 sayıları (HKCategoryValueSleepAnalysis)
export function normStage(raw) {
  const t = fold(raw).trim();
  if (!t) return 'asleep';
  if (/^[0-5]$/.test(t)) return ['inbed', 'asleep', 'awake', 'core', 'deep', 'rem'][Number(t)];
  const c = t.replace(/[^a-z0-9]/g, '');
  if (/awake|uyan/.test(c)) return 'awake';
  if (/inbed|yatak/.test(c)) return 'inbed';
  if (/deep|derin/.test(c)) return 'deep';
  if (/^rem|rem$|remsleep|remuyku/.test(c)) return 'rem';
  if (/core|cekirdek|light|hafif/.test(c)) return 'core';
  if (/asleep|sleep|uyku|unspecified|belirtilmemis/.test(c)) return 'asleep';
  return null;
}

function tzOffsetMs(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; for (const x of f.formatToParts(new Date(ts))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}
function localToMs(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = guess - tzOffsetMs(guess, tz);
  ts = guess - tzOffsetMs(ts, tz); // yaz/kış saati geçişine yakın tarihlerde ikinci düzeltme
  return ts;
}

// ISO 8601 (+03:00 / Z ile ya da yerel), "2026-10-11 02:10", "11.10.2026 02:10", epoch (sn ya da ms)
export function parseTime(v, tz) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e11 ? v : v * 1000;
  let s = String(v ?? '').trim();
  if (!s) return NaN;
  if (/^\d{9,13}(\.\d+)?$/.test(s)) { const n = Number(s); return n > 1e11 ? n : n * 1000; }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  let y, mo, d, h, mi, sec, off;
  if (m) { [, y, mo, d, h, mi, sec, off] = m; }
  else {
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*()$/);
    if (!m) return NaN;
    [, d, mo, y, h, mi, sec] = m; off = undefined;
  }
  y = +y; mo = +mo; d = +d; h = +h; mi = +mi; sec = +(sec || 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 24 || mi > 59 || sec > 59) return NaN;
  if (off) {
    if (/^z$/i.test(off)) return Date.UTC(y, mo - 1, d, h, mi, sec);
    const sg = off[0] === '-' ? -1 : 1, hh = +off.slice(1, 3), mm = +off.replace(':', '').slice(3, 5);
    return Date.UTC(y, mo - 1, d, h, mi, sec) - sg * (hh * 60 + mm) * MIN;
  }
  return localToMs(y, mo, d, h, mi, sec, tz);
}

// Girdi: satırlar ("Deep|2026-10-11T02:10:00+03:00|2026-10-11T02:40:00+03:00") ya da {stage,start,end} nesneleri dizisi
export function parseSegments(raw, tz, nowMs = Date.now()) {
  const out = [], unknown = new Set();
  let skipped = 0;
  let items = raw;
  if (typeof raw === 'string') items = raw.split(/\r?\n/);
  if (!Array.isArray(items)) return { segs: out, skipped: 1, unknown: [] };
  items = items.slice(0, 4000);
  for (let it of items) {
    let stage, a, b;
    if (it && typeof it === 'object' && !Array.isArray(it)) {
      stage = it.stage ?? it.type ?? it.value ?? it.evre; a = it.start ?? it.s ?? it.baslangic; b = it.end ?? it.e ?? it.bitis;
    } else {
      const line = String(it ?? '').trim();
      if (!line) continue;
      let parts = line.split(/\s*[|;\t]\s*/);
      if (parts.length !== 3) parts = line.split(/\s*,\s*/);
      if (parts.length !== 3) { skipped++; continue; }
      [stage, a, b] = parts;
    }
    const st = normStage(stage);
    if (!st) { skipped++; unknown.add(String(stage).slice(0, 30)); continue; }
    const s0 = parseTime(a, tz), e0 = parseTime(b, tz);
    if (!Number.isFinite(s0) || !Number.isFinite(e0)) { skipped++; continue; }
    const m0 = Math.round(s0 / MIN), m1 = Math.round(e0 / MIN);
    if (m1 <= m0 || m1 - m0 > MAX_SEG_MIN || m1 * MIN > nowMs + 12 * 3600e3 || m0 * MIN < nowMs - 6 * 864e5) { skipped++; continue; }
    out.push({ stage: st, m0, m1 });
  }
  return { segs: out, skipped, unknown: [...unknown].slice(0, 5) };
}

const dayOf = (ms, tz) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: tz });
const CODE = { deep: 'd', core: 'c', rem: 'r', awake: 'a', asleep: 'u', inbed: 'a' };

// Parçaları dakikalara boyar (çakışmada öncelik), oturumlara böler ve her oturumu uyandığın güne yazar.
// Dönüş: { nights: { 'YYYY-AA-GG': gece }, ... } — gün = uyanılan gün (Apple Sağlık da böyle sayar)
export function buildNights(segs, tz) {
  if (!segs.length) return {};
  const paint = new Map();
  for (const { stage, m0, m1 } of segs) {
    const p = PRIO[stage];
    for (let m = m0; m < m1; m++) { const c = paint.get(m); if (!c || PRIO[c] < p) paint.set(m, stage); }
  }
  const mins = [...paint.keys()].sort((a, b) => a - b);
  const sessions = [];
  let cur = null;
  for (const m of mins) {
    if (cur && m - cur.last <= GAP_MIN) { cur.last = m; cur.list.push(m); }
    else { cur = { first: m, last: m, list: [m] }; sessions.push(cur); }
  }
  const byDate = {};
  for (const s of sessions) {
    let firstSleep = null, lastSleep = null;
    for (const m of s.list) {
      const st = paint.get(m);
      if (st === 'deep' || st === 'core' || st === 'rem' || st === 'asleep') { if (firstSleep === null) firstSleep = m; lastSleep = m; }
    }
    if (firstSleep === null) continue;
    // Uyanıştan sonra yatakta kalınan dakikalar (uyanık/yatakta) uyku analizine girmez
    const cnt = { deep: 0, core: 0, rem: 0, asleep: 0, awake: 0, inbed: 0 };
    for (const m of s.list) if (m <= lastSleep) cnt[paint.get(m)]++;
    const asleep = cnt.deep + cnt.core + cnt.rem + cnt.asleep;
    if (asleep < MIN_SLEEP_MIN) continue;
    const wakeMs = (lastSleep + 1) * MIN;
    (byDate[dayOf(wakeMs - 1, tz)] ||= []).push({ s, cnt, asleep, firstSleep, lastSleep, wakeMs });
  }
  const nights = {};
  for (const [date, arr] of Object.entries(byDate)) {
    arr.sort((a, b) => b.asleep - a.asleep);
    const { s, cnt, asleep, firstSleep, lastSleep, wakeMs } = arr[0];
    const nap = arr.slice(1).reduce((a, x) => a + x.asleep, 0);
    const bedM = s.first, span = lastSleep - bedM + 1; // yatağa giriş = oturumun ilk dakikası
    const segsOut = [];
    for (const m of s.list) {
      if (m > lastSleep) break;
      const code = CODE[paint.get(m)], prev = segsOut[segsOut.length - 1];
      if (prev && prev[0] === code && prev[1] + prev[2] === m - bedM) prev[2]++;
      else segsOut.push([code, m - bedM, 1]);
    }
    nights[date] = {
      bed: bedM * MIN, asleepAt: firstSleep * MIN, wake: wakeMs, out: s.last * MIN + MIN,
      asleep, inBed: span, deep: cnt.deep, core: cnt.core, rem: cnt.rem, unspec: cnt.asleep,
      awake: cnt.awake + cnt.inbed, nap, stages: cnt.deep + cnt.core + cnt.rem > 0, segs: segsOut,
    };
  }
  return nights;
}

// Mevcut kayıtla birleştir: eksik (pencerenin kenarında kesilmiş) ya da alakasız kısa veri iyi kaydın üstüne yazılmaz
export function mergeNights(existing, incoming, minStartMs) {
  const days = { ...existing };
  const saved = [], kept = [];
  for (const [date, n] of Object.entries(incoming)) {
    const old = days[date];
    if (old) {
      const overlap = n.bed < old.out && old.bed < n.out;
      const truncated = n.bed - minStartMs < 15 * MIN && old.bed < n.bed; // pencerenin sol kenarında başlamış, eskiden daha erken başlıyordu
      if (truncated || (!overlap && n.asleep <= old.asleep)) { kept.push(date); continue; }
    }
    days[date] = { ...n, ts: Date.now(), src: 'sync' };
    saved.push(date);
  }
  const keys = Object.keys(days).sort().slice(-KEEP_NIGHTS), out = {};
  keys.forEach(k => { out[k] = days[k]; });
  return { days: out, saved, kept };
}
