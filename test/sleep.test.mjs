// Apple Sağlık uyku eşitlemesi. Çalıştır: node test/sleep.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normStage, parseTime, parseSegments, buildNights, mergeNights } from '../sleep.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const TZ = 'Europe/Istanbul';

/* ---------------- 1) saf fonksiyonlar ---------------- */
ok(['Deep', 'Derin', 'DERİN'].every(x => normStage(x) === 'deep'), 'evre: Deep/Derin/DERİN → deep');
ok(['REM', 'rem', 'REM Uykusu'].every(x => normStage(x) === 'rem'), 'evre: REM');
ok(['Core', 'Çekirdek', 'ÇEKİRDEK', 'Light'].every(x => normStage(x) === 'core'), 'evre: Core/Çekirdek → core');
ok(['Awake', 'Uyanık', 'UYANIK'].every(x => normStage(x) === 'awake'), 'evre: Awake/Uyanık → awake');
ok(['In Bed', 'InBed', 'Yatakta'].every(x => normStage(x) === 'inbed'), 'evre: In Bed/Yatakta → inbed');
ok(['Asleep', 'Uyku', 'Unspecified', ''].every(x => normStage(x) === 'asleep'), 'evre: Asleep/Uyku/boş → asleep (belirtilmemiş)');
ok(normStage('3') === 'core' && normStage('4') === 'deep' && normStage('5') === 'rem' && normStage('2') === 'awake' && normStage('0') === 'inbed', 'evre: HealthKit sayı kodları (0-5)');
ok(normStage('abc') === null, 'evre: tanınmayan değer null');

ok(parseTime('2026-03-10T23:10:00+03:00', TZ) === Date.UTC(2026, 2, 10, 20, 10), 'zaman: ISO +03:00');
ok(parseTime('2026-03-10T20:10:00Z', TZ) === Date.UTC(2026, 2, 10, 20, 10), 'zaman: ISO Z');
ok(parseTime('2026-03-10 23:10', TZ) === Date.UTC(2026, 2, 10, 20, 10), 'zaman: ofsetsiz yerel → sunucu saat dilimi (İstanbul)');
ok(parseTime('10.03.2026 23:10', TZ) === Date.UTC(2026, 2, 10, 20, 10), 'zaman: 10.03.2026 23:10 (Türkçe biçim)');
ok(parseTime('2026-03-10T23:10:00-05:00', TZ) === Date.UTC(2026, 2, 11, 4, 10), 'zaman: başka saat diliminin ofseti (-05:00) doğru dönüşür');
ok(parseTime(1773173400, TZ) === 1773173400000 && parseTime('1773173400000', TZ) === 1773173400000, 'zaman: epoch saniye ve milisaniye');
ok(Number.isNaN(parseTime('dün gece', TZ)) && Number.isNaN(parseTime('2026-13-45T00:00:00', TZ)), 'zaman: geçersizler NaN');

// Sabit bir gece: 10 Mart 23:10 → 11 Mart 07:05 (İstanbul); "şimdi" 11 Mart öğle
const NOW = parseTime('2026-03-11T12:00:00+03:00', TZ);
const L = (st, a, b) => `${st}|2026-03-${a.slice(0, 2)}T${a.slice(3)}:00+03:00|2026-03-${b.slice(0, 2)}T${b.slice(3)}:00+03:00`;
const night = [
  L('In Bed', '10T22:50', '11T07:20'),      // telefon: yatakta
  L('Asleep', '10T23:00', '11T07:00'),      // telefon: belirtilmemiş uyku (Watch evreleriyle çakışır)
  L('Core', '10T23:10', '10T23:40'),        // 30
  L('Deep', '10T23:40', '11T00:50'),        // 70 (gece yarısını geçer)
  L('Awake', '11T00:50', '11T01:00'),       // 10
  L('Core', '11T01:00', '11T03:00'),        // 120
  L('REM', '11T03:00', '11T03:45'),         // 45
  L('Core', '11T03:45', '11T05:30'),        // 105
  L('Deep', '11T05:30', '11T06:00'),        // 30
  L('REM', '11T06:00', '11T07:05'),         // 65
].join('\n');
let ps = parseSegments(night, TZ, NOW);
ok(ps.segs.length === 10 && ps.skipped === 0, 'ayrıştırma: 10 parça, atlanan yok');
let ns = buildNights(ps.segs, TZ);
const n = ns['2026-03-11'];
ok(Object.keys(ns).length === 1 && !!n, 'gece, UYANILAN güne (11 Mart) yazıldı; 10 Mart\'a değil');
ok(n.deep === 100 && n.core === 255 && n.rem === 110, `evreler doğru: derin ${n.deep}, çekirdek ${n.core}, REM ${n.rem} (beklenen 100/255/110)`);
ok(n.unspec === 10, `çakışan "belirtilmemiş uyku" yalnızca boşluğu doldurdu (${n.unspec} dk; evreli dakikalar çift sayılmadı)`);
ok(n.asleep === 475 && n.asleep === n.deep + n.core + n.rem + n.unspec, `toplam uyku ${n.asleep} dk = 7 sa 55 dk`);
ok(n.awake === 20 && n.inBed === 495 && n.asleep + n.awake === n.inBed, `uyanık ${n.awake} dk; yatakta ${n.inBed} dk = uyku + uyanık`);
ok(n.bed === parseTime('2026-03-10T22:50:00+03:00', TZ) && n.asleepAt === parseTime('2026-03-10T23:00:00+03:00', TZ), 'yatağa giriş 22:50, uykuya dalış 23:00');
ok(n.wake === parseTime('2026-03-11T07:05:00+03:00', TZ), 'uyanış = son uyku dakikası (07:05); sonrasındaki yatakta kalma sayılmadı');
ok(n.out === parseTime('2026-03-11T07:20:00+03:00', TZ), 'yataktan çıkış 07:20 ayrıca saklandı');
ok(n.stages === true && n.nap === 0, 'evreli veri işaretlendi, kestirme yok');
ok(n.segs.reduce((a, s) => a + s[2], 0) === n.inBed && n.segs.every(s => 'dcrau'.includes(s[0])), 'evre çizelgesi parçaları toplam süreyi kapsıyor');

// yalnızca telefon (Watch yok)
ps = parseSegments([L('In Bed', '10T23:30', '11T07:30'), L('Asleep', '10T23:45', '11T06:45')].join('\n'), TZ, NOW);
const p = buildNights(ps.segs, TZ)['2026-03-11'];
ok(p.asleep === 420 && p.deep === 0 && p.stages === false && p.awake === 15, `Watch yoksa: ${p.asleep} dk toplam, evre yok (stages=false), uyanık ${p.awake} dk`);

// kestirme: aynı güne düşen ikinci oturum ana geceyi bozmaz
ps = parseSegments([night, L('Asleep', '11T10:00', '11T10:40')].join('\n'), TZ, NOW);
const nn = buildNights(ps.segs, TZ)['2026-03-11'];
ok(nn.asleep === 475 && nn.nap === 40, 'gündüz kestirmesi ana geceden ayrı: nap = 40 dk, gece 475 dk kaldı');

// çok kısa (gürültü) oturum kaydedilmez
ps = parseSegments(L('Asleep', '11T09:00', '11T09:10'), TZ, NOW);
ok(Object.keys(buildNights(ps.segs, TZ)).length === 0, '10 dakikalık uyuklama gece sayılmadı');
ok(Object.keys(buildNights([], TZ)).length === 0, 'boş veri → gece yok');

// iki gece aynı pakette
const prev = [L('Core', '09T23:30', '10T07:00')].join('\n');
ps = parseSegments(prev + '\n' + night, TZ, NOW);
const two = buildNights(ps.segs, TZ);
ok(Object.keys(two).sort().join() === '2026-03-10,2026-03-11' && two['2026-03-10'].asleep === 450, 'iki gece ayrı günlere yazıldı (10 Mart: 450 dk, 11 Mart: 475 dk)');

// bozuk satırlar
ps = parseSegments('çöp satır\nFoo|2026-03-10T23:00:00+03:00|2026-03-10T23:30:00+03:00\nCore|bozuk|2026-03-10T23:30:00+03:00\nCore|2026-03-10T23:30:00+03:00|2026-03-10T23:00:00+03:00\n\nCore|2026-03-10T23:00:00+03:00|2026-03-10T23:30:00+03:00', TZ, NOW);
ok(ps.segs.length === 1 && ps.skipped === 4 && ps.unknown.includes('Foo'), 'bozuk/ters/tanınmayan satırlar atlandı ve sayıldı (1 geçerli, 4 atlanan), bilinmeyen evre adı raporlandı');
ps = parseSegments([{ stage: 'Deep', start: '2026-03-10T23:00:00+03:00', end: '2026-03-11T00:00:00+03:00' }, { stage: 'core', start: '2026-03-11T00:00:00+03:00', end: '2026-03-11T05:00:00+03:00' }], TZ, NOW);
ok(ps.segs.length === 2 && buildNights(ps.segs, TZ)['2026-03-11'].asleep === 360, 'nesne dizisi biçimi de kabul ediliyor');
ps = parseSegments('Core|2026-03-10T23:00:00+03:00|2026-03-12T23:00:00+03:00', TZ, NOW);
ok(ps.segs.length === 0, '16 saatten uzun tek parça geçersiz sayıldı');
ps = parseSegments('Core;2026-03-10 23:00;2026-03-11 06:00', TZ, NOW);
ok(ps.segs.length === 1 && buildNights(ps.segs, TZ)['2026-03-11'].asleep === 420, 'noktalı virgül ayırıcı ve ofsetsiz zaman çalışıyor');

// birleştirme korumaları
const full = { '2026-03-11': { ...n, ts: 1, src: 'sync' } };
const tr = buildNights(parseSegments(L('Core', '11T01:00', '11T07:05'), TZ, NOW).segs, TZ);
let mg = mergeNights(full, tr, parseTime('2026-03-11T01:00:00+03:00', TZ));
ok(mg.kept.includes('2026-03-11') && mg.days['2026-03-11'].asleep === 475, 'pencerenin kenarında kesilmiş (eksik) veri dolu geceyi ezmedi');
const upd = buildNights(parseSegments(night + '\n' + L('Core', '11T07:05', '11T07:30'), TZ, NOW).segs, TZ);
mg = mergeNights(full, upd, parseTime('2026-03-10T22:50:00+03:00', TZ));
ok(mg.saved.includes('2026-03-11') && mg.days['2026-03-11'].asleep === 500, 'aynı gecenin güncel/uzamış verisi eskinin yerine geçti');
const other = buildNights(parseSegments(L('Asleep', '11T14:00', '11T14:40'), TZ, NOW).segs, TZ);
mg = mergeNights(full, other, parseTime('2026-03-11T14:00:00+03:00', TZ));
ok(mg.kept.includes('2026-03-11') && mg.days['2026-03-11'].asleep === 475, 'alakasız kısa oturum dolu geceyi ezmedi');
const big = {}; for (let i = 1; i <= 130; i++) big['2025-01-' + String(i).padStart(3, '0')] = { asleep: 400, bed: 0, out: 0 };
ok(Object.keys(mergeNights(big, {}, 0).days).length === 120, 'en fazla 120 gece saklanıyor');

/* ---------------- 2) sunucu uçtan uca ---------------- */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-sleep-'));
const PORT = 18097, base = `http://127.0.0.1:${PORT}`;
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT, DATA_DIR: dir, INVITE_CODE: 'davet-kodu-123' } });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }
const jar = () => ({ c: '' });
async function call(method, p, body, j) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }; if (j && j.c) headers.Cookie = j.c;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (j && sc) j.c = sc.split(';')[0];
  let x = null; try { x = await r.json(); } catch (e) { /* boş */ } return { s: r.status, j: x };
}
const sync = (key, body) => fetch(base + '/api/health-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: JSON.stringify(body) })
  .then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
const ymd = off => new Date(Date.now() + off * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ });
const TODAY = ymd(0), YEST = ymd(-1);
const T = (d, hm) => `${d}T${hm}:00+03:00`;
const SL = (st, d1, h1, d2, h2) => `${st}|${T(d1, h1)}|${T(d2, h2)}`;
// dünden bugüne gece (gerçek tarihlerle): 23:10 → 07:05, bugünün saatleri henüz gelmemiş olabilir (en fazla +12 sa kabul)
const live = [
  SL('Core', YEST, '23:10', YEST, '23:40'), SL('Deep', YEST, '23:40', TODAY, '00:50'), SL('Awake', TODAY, '00:50', TODAY, '01:00'),
  SL('Core', TODAY, '01:00', TODAY, '03:00'), SL('REM', TODAY, '03:00', TODAY, '03:45'), SL('Core', TODAY, '03:45', TODAY, '05:30'),
  SL('Deep', TODAY, '05:30', TODAY, '06:00'), SL('REM', TODAY, '06:00', TODAY, '07:05'),
].join('\n');
const A = jar(), B = jar();
try {
  await call('POST', '/api/register', { username: 'Ali', password: 'sifre12345-xyz', invite: 'davet-kodu-123', consent: true }, A);
  await call('POST', '/api/register', { username: 'Bora', password: 'bora-sifre-22', invite: 'davet-kodu-123', consent: true }, B);
  const key = (await call('POST', '/api/sync-key', {}, A)).j.key;

  let r = await call('GET', '/api/sleep', undefined, A);
  ok(r.s === 200 && Object.keys(r.j.days).length === 0 && r.j.last === null, 'başlangıçta uyku kaydı yok');
  ok((await call('GET', '/api/sleep', undefined, jar())).s === 401, 'oturumsuz /sleep 401');
  ok((await sync(null, { sleep: live })).s === 401 && (await sync('sh_yanlis-anahtar-yanlis-anahtar', { sleep: live })).s === 401, 'anahtarsız / yanlış anahtarlı uyku gönderimi reddedildi');

  // yalnızca uyku (kcal yok)
  r = await sync(key, { sleep: live });
  ok(r.s === 200 && r.j.result === 'no_kcal' && r.j.sleep.date === TODAY && r.j.sleep.asleepMin === 465 && r.j.sleep.segments === 8, `yalnızca uyku gönderildi: ${r.j.sleep && r.j.sleep.asleepMin} dk (beklenen 465), kcal kaydı oluşmadı`);
  ok(Object.keys((await call('GET', '/api/burn', undefined, A)).j.days).length === 0, 'yalnızca uyku gönderilince yakılan kalori kaydı oluşmadı');
  r = await call('GET', '/api/sleep', undefined, A);
  const sn = r.j.days[TODAY];
  ok(sn && sn.asleep === 465 && sn.deep === 100 && sn.core === 255 && sn.rem === 110 && sn.awake === 10 && sn.stages === true && r.j.last > 0 && r.j.info.segments === 8, 'GET /sleep: gece uyanılan güne (bugün) yazıldı, evreler ve eşitleme bilgisi doğru');
  ok(sn.wake - sn.asleepAt === (465 + 10) * 60000, 'uykuya dalış–uyanış aralığı uyku + uyanık süresine eşit');

  // aynı veri tekrar: tek kayıt, yinelenmez
  r = await sync(key, { sleep: live });
  ok(r.s === 200 && Object.keys((await call('GET', '/api/sleep', undefined, A)).j.days).length === 1, 'aynı veri tekrar gönderilince kayıt yinelenmedi (idempotent)');

  // kısmi (kesik) yeniden gönderim iyi geceyi bozmaz
  r = await sync(key, { sleep: [SL('Core', TODAY, '01:00', TODAY, '03:00'), SL('REM', TODAY, '03:00', TODAY, '03:45')].join('\n') });
  ok(r.s === 200 && (await call('GET', '/api/sleep', undefined, A)).j.days[TODAY].asleep === 465, 'kesik/eksik paket dolu geceyi küçültmedi');

  // kcal + uyku birlikte; yeni kısayol
  r = await sync(key, { kcal: 420, steps: 9000, sleep: live });
  ok(r.s === 200 && r.j.result === 'saved' && r.j.kcal === 420 && r.j.sleep.asleepMin === 465, 'kalori ve uyku aynı istekte birlikte işlendi');
  ok((await call('GET', '/api/burn', undefined, A)).j.days[TODAY].kcal === 420, 'birlikte gönderilen kalori kaydedildi');

  // kcal boş metin + uyku: kalori sessizce yok sayılır, uyku yine kaydedilir (Kısayol boş sonuç verirse)
  r = await sync(key, { kcal: '', sleep: live });
  ok(r.s === 200 && r.j.result === 'no_kcal', 'kcal boş metin ve uyku var: hata verilmedi');
  // eski kısayol (yalnızca kcal) hâlâ çalışır; uykuya dokunmaz
  r = await sync(key, { kcal: 500 });
  ok(r.s === 200 && r.j.result === 'saved' && r.j.sleep === undefined && (await call('GET', '/api/sleep', undefined, A)).j.days[TODAY].asleep === 465, 'eski kısayol (yalnızca kcal) çalışıyor, uyku kaydına dokunmuyor');

  // doğrulama
  ok((await sync(key, {})).s === 400, 'ne kcal ne uyku: 400');
  ok((await sync(key, { sleep: live, kcal: 'abc' })).s === 400, 'uyku varken geçersiz (boş olmayan) kcal yine reddedilir');
  r = await sync(key, { sleep: 'saçma\nsatırlar\nFoo|x|y' });
  ok(r.s === 200 && r.j.sleep.segments === 0 && r.j.sleep.skipped === 3, 'tamamen bozuk uyku metni: çökmeden 200, hiçbiri kaydedilmedi');
  r = await sync(key, { sleep: 'Moo|' + T(TODAY, '01:00') + '|' + T(TODAY, '02:00') });
  ok(r.j.sleep.unknown.includes('Moo'), 'tanınmayan evre adı yanıtta bildiriliyor (kısayol hatasını bulmak için)');
  ok((await sync(key, { sleep: SL('Core', ymd(-30), '23:00', ymd(-29), '07:00') })).j.sleep.saved.length === 0, '30 gün öncesi uyku yazılmadı');
  ok(Object.keys((await call('GET', '/api/sleep', undefined, A)).j.days).length === 1, 'reddedilen/bozuk gönderimler kayıt sayısını değiştirmedi');

  // büyük paket (Authorization başlığıyla) kabul, başlıksız büyük gövde reddedilir
  const many = []; for (let i = 0; i < 1500; i++) many.push(SL('Core', TODAY, '01:00', TODAY, '01:01'));
  ok((await sync(key, { sleep: many.join('\n') })).s === 200, 'binlerce satırlık paket (~130 KB) Authorization ile kabul edildi');
  // sunucu aşırı büyük gövdede bağlantıyı keser (413 ya da bağlantı sıfırlama); önemli olan reddedilmesi ve sunucunun ayakta kalması
  const big413 = await sync(null, { key, sleep: many.join('\n') }).catch(() => ({ s: 'kesildi' }));
  ok(big413.s === 413 || big413.s === 'kesildi', 'anahtar gövdedeyse büyük paket reddedildi (' + big413.s + ')');
  ok((await fetch(base + '/api/health')).ok, 'büyük paket denemesinden sonra sunucu ayakta');

  // kullanıcı ayrımı + bağlantı kapatma
  ok(Object.keys((await call('GET', '/api/sleep', undefined, B)).j.days).length === 0, 'Bora Ali\'nin uykusunu görmüyor');
  await call('POST', '/api/sync-key/revoke', {}, A);
  ok((await sync(key, { sleep: live })).s === 401 && (await call('GET', '/api/sleep', undefined, A)).j.days[TODAY].asleep === 465, 'bağlantı kapatılınca uyku gönderilemiyor ama mevcut kayıt silinmiyor');
  ok(!/sh_[\w-]{30,}/.test(log), 'günlükte anahtar yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
await new Promise(r => { srv.once('exit', r); srv.kill(); setTimeout(r, 3000).unref(); });
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* Windows dosyayı biraz geç bırakabilir */ }
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log);
process.exit(fail ? 1 : 0);
