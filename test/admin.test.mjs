// Yönetici paneli testleri. Çalıştır: node test/admin.test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sha-'));
const APP = 18110, MOCK = 18111;
let geminiHits = 0;
const mock = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  geminiHits++; res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }] })); }); });
await new Promise(r => mock.listen(MOCK, r));
const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: APP, DATA_DIR: dir, INVITE_CODE: 'master-kod', GEMINI_API_KEY: 'k', GEMINI_BASE: `http://127.0.0.1:${MOCK}/v1beta`, AI_CHAIN: 'gemini:m1' } });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch (e) { /* bekle */ } await new Promise(r => setTimeout(r, 100)); }

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const base = `http://127.0.0.1:${APP}`;
const jar = () => ({ c: '' });
async function call(method, p, body, j) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam' }; if (j && j.c) headers.Cookie = j.c;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (j && sc) j.c = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
  let x = null; try { x = await r.json(); } catch (e) { /* boş */ } return { s: r.status, j: x };
}
const reg = (j, u, pw, invite = 'master-kod', consent = true) => call('POST', '/api/register', { username: u, password: pw, invite, consent }, j);
const A = jar(), B = jar(), C = jar(), D = jar();
const PWA = 'admin-sifre-1', PWB = 'bora-sifre-22', PWC = 'cem-sifre-333';
try {
  /* ---- kayıt, rol, onay ---- */
  let r = await reg(A, 'Admin', PWA, 'master-kod', false);
  ok(r.s === 200 && r.j.user.isAdmin === true, 'onay kutusu/alanı olmadan doğrudan kayıt olunuyor; ilk hesap otomatik yönetici');
  r = await reg(B, 'Bora', PWB, 'master-kod', false);
  ok(r.s === 200 && r.j.user.isAdmin === false, 'sonraki hesap yönetici değil');
  const boraId = r.j.user.id;
  ok((await call('GET', '/api/admin/overview', undefined, B)).s === 403, 'yönetici olmayan kullanıcı panele erişemiyor (403)');
  ok((await call('GET', '/api/admin/overview', undefined, jar())).s === 401, 'oturumsuz erişim 401');

  /* Bora gerçek veri yazsın: dün ne yedi */
  await call('PUT', '/api/docs/core', { data: { profile: { sex: 'm', weight: 80 }, goals: { kcal: 2200, protein: 170 } } }, B);
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  await call('PUT', '/api/docs/m-' + yesterday.slice(0, 7), { data: { days: { [yesterday]: { meals: [{ name: 'Yulaf', kcal: 300, protein: 12, type: 'Kahvaltı' }], water: [500] } } } }, B);

  /* ---- genel bakış ---- */
  r = await call('GET', '/api/admin/overview', undefined, A);
  const ov = r.j;
  ok(r.s === 200 && ov.users.length === 2 && ov.stats.users === 2, 'genel bakış: iki kullanıcı listelendi');
  const bu = ov.users.find(u => u.username === 'Bora');
  ok(bu.docCount === 2 && bu.bytes > 50 && bu.lastActivity > 0 && bu.aiToday === 0, 'kullanıcı satırı: kayıt sayısı, boyut, son hareket, bugünkü yapay zekâ');
  ok(!JSON.stringify(ov).includes('hash') && !JSON.stringify(ov).includes('salt'), 'genel bakışta şifre özeti/tuz yok');
  ok(ov.settings.aiUserLimit === 80 && ov.settings.maxUsers === 10 && ov.masterInvite === true && ov.system.geminiKey === true, 'ayarlar ve sistem durumu');

  /* ---- kullanıcının verisini görme + şeffaflık kaydı ---- */
  r = await call('GET', `/api/admin/users/${boraId}/data`, undefined, A);
  const m = r.j.docs.find(d => d.id.startsWith('m-'));
  ok(r.s === 200 && m.data.days[yesterday].meals[0].name === 'Yulaf', 'yönetici Bora\'nın dünkü öğününü görebiliyor');
  await call('GET', `/api/admin/users/${boraId}/data`, undefined, A);
  r = await call('GET', '/api/account/access-log', undefined, B);
  ok(r.s === 200 && r.j.log.length === 0, 'varsayılan: yöneticinin "verilerine baktı" kaydı Bora\'nın ekranında GÖRÜNMÜYOR');
  const adminLog = (await call('GET', '/api/admin/log', undefined, A)).j.log.filter(x => x.action === 'view_data');
  ok(adminLog.length === 1 && adminLog[0].target === 'Bora', 'ama yönetici kendi işlem kaydında görüntülemeyi görüyor (10 dk içinde tekrarlar tek kayıt)');
  ok((await call('GET', '/api/admin/overview', undefined, A)).j.settings.showAccessLog === false, 'ayar varsayılanı: kapalı');
  await call('POST', '/api/admin/settings', { showAccessLog: true }, A);
  r = await call('GET', '/api/account/access-log', undefined, B);
  ok(r.j.log.length === 1 && r.j.log[0].action === 'view_data' && r.j.log[0].admin === 'Admin', 'yönetici ayarı açınca Bora aynı kaydı görüyor');
  await call('POST', '/api/admin/settings', { showAccessLog: false }, A);
  ok((await call('GET', `/api/admin/users/${boraId}/data`, undefined, B)).s === 403, 'Bora başkasının verisine bakamıyor');

  /* ---- veritabanı yedeği indirme ---- */
  const dl = (j, body) => fetch(base + '/api/admin/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'spor-hocam', Cookie: j.c }, body: JSON.stringify(body) });
  ok((await dl(B, { adminPassword: PWB })).status === 403, 'yönetici olmayan yedek indiremiyor (403)');
  ok((await dl(jar(), { adminPassword: PWA })).status === 401, 'oturumsuz yedek indirilemiyor (401)');
  ok((await dl(A, {})).status === 403, 'şifresiz yedek indirilemiyor');
  ok((await dl(A, { adminPassword: 'yanlis-sifre' })).status === 403, 'yanlış şifreyle yedek indirilemiyor');
  const bk = await dl(A, { adminPassword: PWA });
  const bkBuf = Buffer.from(await bk.arrayBuffer());
  ok(bk.status === 200 && /attachment; filename="spor-hocam-yedek-\d{4}-\d{2}-\d{2}\.db"/.test(bk.headers.get('content-disposition') || ''), 'doğru şifreyle yedek dosya olarak iniyor');
  ok(bkBuf.length > 4096 && bkBuf.subarray(0, 15).toString() === 'SQLite format 3', 'indirilen dosya geçerli bir SQLite veritabanı');
  const bkFile = path.join(dir, 'indirilen-yedek.db'); fs.writeFileSync(bkFile, bkBuf);
  const { DatabaseSync } = await import('node:sqlite');
  const bdb = new DatabaseSync(bkFile, { readOnly: true });
  ok(bdb.prepare('SELECT COUNT(*) AS n FROM users').get().n === 2 && bdb.prepare('SELECT COUNT(*) AS n FROM docs').get().n === 2, 'yedek tüm kullanıcıları ve Bora\'nın kayıtlarını içeriyor');
  bdb.close();
  await new Promise(r => setTimeout(r, 300));
  ok(!fs.existsSync(path.join(dir, 'backups')) || fs.readdirSync(path.join(dir, 'backups')).every(f => !f.startsWith('tmp-')), 'geçici yedek dosyası sunucuda kalmadı');
  ok((await call('GET', '/api/admin/log', undefined, A)).j.log.some(x => x.action === 'download_backup' && x.admin === 'Admin'), 'yedek indirme yönetici işlem kaydına yazıldı');
  ok((await call('GET', '/api/account/access-log', undefined, B)).j.log.length === 0, 'yedek indirme Bora\'nın ekranında ayrı bir kayıt olarak görünmüyor');

  /* ---- davet kodları ---- */
  r = await call('POST', '/api/admin/invites', { label: 'Cem için', maxUses: 1, expiresDays: 7 }, A);
  const inv = r.j;
  ok(r.s === 200 && /^SPOR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(inv.code), 'tek kullanımlık davet kodu üretildi: ' + inv.code);
  r = await reg(C, 'Cem', PWC, inv.code.toLowerCase());
  ok(r.s === 200, 'davet kodu (küçük harfle yazılsa da) çalıştı');
  r = await reg(D, 'Deniz', 'deniz-sifre-4', inv.code);
  ok(r.s === 403 && r.j.code === 'bad_invite', 'tek kullanımlık kod ikinci kez kullanılamadı');
  const ov2 = (await call('GET', '/api/admin/overview', undefined, A)).j;
  ok(ov2.invites[0].uses === 1 && ov2.invites[0].status === 'doldu', 'davet listesinde kullanım 1/1, durum "doldu"');
  r = await call('POST', '/api/admin/invites', { label: 'sınırsız', maxUses: 0, expiresDays: 0 }, A);
  const inv2 = r.j;
  await call('POST', `/api/admin/invites/${inv2.id}/revoke`, {}, A);
  ok((await reg(jar(), 'Efe', 'efe-sifre-5555', inv2.code)).s === 403, 'iptal edilen kod çalışmıyor');
  await call('POST', `/api/admin/invites/${inv2.id}/restore`, {}, A);
  r = await reg(D, 'Efe', 'efe-sifre-5555', inv2.code);
  ok(r.s === 200, 'geri açılan kod çalışıyor');
  ok((await call('POST', '/api/admin/invites', { maxUses: -1 }, A)).s === 400, 'geçersiz davet ayarı reddedildi');

  /* ---- limitler ve kotalar ---- */
  r = await call('POST', `/api/admin/users/${boraId}/update`, { aiLimit: 1 }, A);
  ok(r.s === 200, 'Bora için günlük yapay zekâ limiti 1 yapıldı');
  r = await call('POST', '/api/ai', { prompt: 'bir', json: true }, B);
  ok(r.s === 200, 'Bora ilk çağrıyı yaptı');
  r = await call('POST', '/api/ai', { prompt: 'iki', json: true }, B);
  ok(r.s === 429 && r.j.code === 'quota' && /1 çağrı/.test(r.j.error), 'kişiye özel limit çalıştı: ikinci çağrı 429 (1 çağrı)');
  await call('POST', `/api/admin/users/${boraId}/update`, { aiLimit: 0 }, A);
  r = await call('POST', '/api/ai', { prompt: 'üç', json: true }, B);
  ok(r.s === 429 && /kapalı/.test(r.j.error), 'limit 0: yapay zekâ bu hesapta kapalı mesajı');
  await call('POST', `/api/admin/users/${boraId}/update`, { aiLimit: null }, A);
  r = await call('POST', '/api/admin/settings', { aiUserLimit: 1 }, A);
  r = await call('POST', '/api/ai', { prompt: 'dört', json: true }, C);
  const r2 = await call('POST', '/api/ai', { prompt: 'beş', json: true }, C);
  ok(r.s === 200 && r2.s === 429, 'genel kişi başı limit (ayarlardan) uygulandı');
  await call('POST', '/api/admin/settings', { aiUserLimit: 50, aiGlobalLimit: 1 }, A);
  r = await call('POST', '/api/ai', { prompt: 'altı', json: true }, A);
  ok(r.s === 429 && /ortak/.test(r.j.error), 'toplam günlük limit dolunca herkes için 429');
  await call('POST', '/api/admin/settings', { aiGlobalLimit: 300 }, A);
  ok((await call('POST', '/api/admin/settings', { aiUserLimit: 'abc' }, A)).s === 400, 'geçersiz limit değeri reddedildi');

  /* ---- askıya alma ---- */
  await call('POST', `/api/admin/users/${boraId}/update`, { disabled: true }, A);
  ok([401, 403].includes((await call('GET', '/api/docs', undefined, B)).s), 'askıya alınan kullanıcının açık oturumu kapandı');
  r = await call('POST', '/api/login', { username: 'bora', password: PWB }, jar());
  ok(r.s === 403 && r.j.code === 'disabled', 'askıdaki hesap giriş yapamıyor (Türkçe mesaj)');
  await call('POST', `/api/admin/users/${boraId}/update`, { disabled: false }, A);
  ok((await call('POST', '/api/login', { username: 'bora', password: PWB }, B)).s === 200, 'askı kaldırılınca giriş yapıyor');
  r = await call('GET', '/api/admin/overview', undefined, A);
  const adminId = r.j.users.find(u => u.username === 'Admin').id;
  ok((await call('POST', `/api/admin/users/${adminId}/update`, { disabled: true }, A)).s === 409, 'yönetici kendi hesabını askıya alamıyor');

  /* ---- şifre sıfırlama (geçici şifre + zorunlu değişim) ---- */
  r = await call('POST', `/api/admin/users/${boraId}/reset-password`, { adminPassword: 'yanlis' }, A);
  ok(r.s === 403 && /Yönetici şifresi/.test(r.j.error), 'yönetici şifresi yanlışsa sıfırlama yapılmadı');
  r = await call('POST', `/api/admin/users/${boraId}/reset-password`, { adminPassword: PWA }, A);
  const temp = r.j.tempPassword;
  ok(r.s === 200 && temp.length === 12, 'geçici şifre üretildi (12 karakter)');
  ok((await call('GET', '/api/docs', undefined, B)).s === 401, 'sıfırlanan kullanıcının eski oturumları kapandı');
  ok((await call('POST', '/api/login', { username: 'bora', password: PWB }, jar())).s === 401, 'eski şifre artık geçersiz');
  r = await call('POST', '/api/login', { username: 'bora', password: temp }, B);
  ok(r.s === 200 && r.j.user.mustChange === true, 'geçici şifreyle giriş: şifre değişimi zorunlu işaretli');
  ok((await call('GET', '/api/docs', undefined, B)).j.code === 'must_change', 'zorunlu değişim bitene kadar veriye erişim yok');
  ok((await call('POST', '/api/ai', { prompt: 'x' }, B)).j.code === 'must_change', 'yapay zekâ da kilitli');
  r = await call('POST', '/api/account/force-password', { new: temp }, B);
  ok(r.s === 400, 'yeni şifre geçici şifreyle aynı olamıyor');
  r = await call('POST', '/api/account/force-password', { new: 'bora-yeni-sifre-9' }, B);
  ok(r.s === 200 && r.j.user.mustChange === false, 'yeni şifre belirlendi');
  r = await call('GET', '/api/docs', undefined, B);
  ok(r.s === 200 && r.j.docs.length === 2, 'şifre değişince veriye erişim açıldı, veriler duruyor');
  r = await call('GET', '/api/account/access-log', undefined, B);
  ok(r.j.log.some(x => x.action === 'reset_password') && !r.j.log.some(x => x.action === 'view_data'), 'ayar kapalıyken bile Bora şifresinin sıfırlandığını görüyor, "baktı" kayıtları hâlâ gizli');

  /* ---- rol değişimi ve son yönetici koruması ---- */
  ok((await call('POST', `/api/admin/users/${boraId}/update`, { isAdmin: true }, A)).s === 403, 'yönetici yapmak için yönetici şifresi gerekli');
  r = await call('POST', `/api/admin/users/${boraId}/update`, { isAdmin: true, adminPassword: PWA }, A);
  ok(r.s === 200, 'Bora yönetici yapıldı');
  ok((await call('GET', '/api/admin/overview', undefined, B)).s === 200, 'Bora artık panele girebiliyor');
  r = await call('POST', `/api/admin/users/${adminId}/update`, { isAdmin: false, adminPassword: PWA }, A);
  ok(r.s === 200, 'iki yönetici varken biri yetkisini bırakabiliyor');
  ok((await call('GET', '/api/admin/overview', undefined, A)).s === 403, 'yetkisi alınan artık panele giremiyor');
  r = await call('POST', `/api/admin/users/${boraId}/update`, { isAdmin: false, adminPassword: 'bora-yeni-sifre-9' }, B);
  ok(r.s === 409 && r.j.code === 'last_admin', 'son yöneticinin yetkisi kaldırılamıyor');
  await call('POST', `/api/admin/users/${adminId}/update`, { isAdmin: true, adminPassword: 'bora-yeni-sifre-9' }, B);

  /* ---- ayarlar: kayıt modu ---- */
  r = await call('POST', '/api/admin/settings', { registration: 'closed' }, B);
  ok((await reg(jar(), 'Gizem', 'gizem-sifre-6', 'master-kod')).j.code === 'closed', 'kayıt kapatılınca kimse kayıt olamıyor (ana kod bile)');
  ok((await call('GET', '/api/me', undefined, jar())).j.config.registration === 'closed', 'istemciye kayıt modu "closed" bildirildi');
  ok((await call('POST', '/api/admin/settings', { registration: 'open' }, B)).s === 403, 'kaydı herkese açmak yönetici şifresi istiyor');
  r = await call('POST', '/api/admin/settings', { registration: 'open', adminPassword: 'bora-yeni-sifre-9' }, B);
  r = await reg(jar(), 'Gizem', 'gizem-sifre-6', '');
  ok(r.s === 200, 'açık kayıtta davet kodsuz kayıt olunabiliyor');
  await call('POST', '/api/admin/settings', { registration: 'invite', maxUsers: 5 }, B);
  r = await reg(jar(), 'Hale', 'hale-sifre-777', 'master-kod');
  ok(r.s === 403 && r.j.code === 'full', 'kullanıcı sınırı ayarlardan değişti (5)');

  /* ---- veri silme / hesap silme ---- */
  const cemId = (await call('GET', '/api/admin/overview', undefined, B)).j.users.find(u => u.username === 'Cem').id;
  await call('PUT', '/api/docs/core', { data: { profile: { x: 1 } } }, C);
  ok((await call('POST', `/api/admin/users/${cemId}/wipe-data`, { adminPassword: 'yanlis' }, B)).s === 403, 'veri silme: yanlış yönetici şifresi reddedildi');
  await call('POST', `/api/admin/users/${cemId}/wipe-data`, { adminPassword: 'bora-yeni-sifre-9' }, B);
  ok((await call('GET', '/api/docs', undefined, C)).j.docs.length === 0, 'Cem\'in verileri silindi, hesabı duruyor');
  r = await call('POST', `/api/admin/users/${cemId}/delete`, { adminPassword: 'bora-yeni-sifre-9' }, B);
  ok(r.s === 200, 'Cem\'in hesabı silindi');
  ok((await call('POST', '/api/login', { username: 'cem', password: PWC }, jar())).s === 401, 'silinen hesapla giriş yok');
  ok((await call('GET', '/api/admin/overview', undefined, B)).j.users.every(u => u.username !== 'Cem'), 'silinen kullanıcı listeden kalktı');
  const borasId = boraId;
  ok((await call('POST', `/api/admin/users/${borasId}/delete`, { adminPassword: 'bora-yeni-sifre-9' }, B)).s === 409, 'yönetici kendini panelden silemiyor');

  /* ---- denetim kaydı ---- */
  r = await call('GET', '/api/admin/log', undefined, B);
  const acts = new Set(r.j.log.map(x => x.action));
  ok(['view_data', 'create_invite', 'update_user', 'reset_password', 'update_settings', 'wipe_data', 'delete_user'].every(a => acts.has(a)), 'yönetici işlem kaydı tüm işlem türlerini içeriyor');
  ok((await call('GET', '/api/admin/log', undefined, jar())).s === 401, 'işlem kaydı oturumsuz erişime kapalı');
  ok(!/sifre12345|admin-sifre|bora-|temp/i.test(log) && !JSON.stringify(r.j).includes(temp), 'günlüklerde ve kayıtta şifre yok');
} catch (e) { fail++; console.log('TEST HATASI', e); }
srv.kill(); mock.close();
console.log(`\n${pass} geçti, ${fail} başarısız`);
if (fail) console.log('--- sunucu günlüğü ---\n' + log);
process.exit(fail ? 1 : 0);
