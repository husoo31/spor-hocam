// Spor Hocam sunucusu: hesaplar, veriler (SQLite) ve yapay zekâ yönlendirmesi.
// Dış bağımlılık yok; yalnızca Node.js 22.13+ yerleşik modülleri kullanılır.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRefDb, pickBest } from './refdb.js';
import { createLocalFoods } from './localfoods.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

/* ------------------------------------------------------------------ ayarlar */
const PORT = Number(env.PORT) || 3000;
const DATA_DIR = env.DATA_DIR || path.join(__dirname, 'data');
const TRUST_PROXY = env.TRUST_PROXY !== 'false';
const TZ = env.AI_TZ || 'Europe/Istanbul';
const GEMINI_BASE = (env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const OPENROUTER_BASE = (env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const NVIDIA_BASE = (env.NVIDIA_BASE || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
// Ölçüme göre sıralı (16 yemek, USDA referansı): en doğru + hızlı + güvenilir önde. Yavaş sağlayıcılar (NVIDIA DeepSeek ~200 sn, ücretsiz OpenRouter Qwen ~50 sn) varsayılana alınmadı.
const DEFAULT_CHAIN = 'gemini:gemini-3.1-flash-lite,gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash,groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b,groq:qwen/qwen3.8-27b,openrouter:openrouter/free';
const CHAINS = {
  default: parseChain(env.AI_CHAIN || DEFAULT_CHAIN),
  quick: parseChain(env.AI_CHAIN_QUICK || env.AI_CHAIN || DEFAULT_CHAIN),
  complex: parseChain(env.AI_CHAIN_COMPLEX || env.AI_CHAIN || DEFAULT_CHAIN),
};
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const USERNAME_RE = /^[\p{L}\p{N}._-]{3,24}$/u;
const DOC_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

function parseChain(s) {
  return String(s).split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf(':');
    return i < 0 ? null : { provider: x.slice(0, i), model: x.slice(i + 1) };
  }).filter(Boolean);
}
const SETTING_DEFAULTS = () => ({
  registration: env.OPEN_REGISTRATION === 'true' ? 'open' : 'invite',
  ai_user_limit: String(Number(env.AI_DAILY_LIMIT_PER_USER) || 80),
  ai_global_limit: String(Number(env.AI_DAILY_LIMIT_GLOBAL) || 300),
  max_users: String(Number(env.MAX_USERS) || 10),
  // Kullanıcılar, yöneticinin verilerine baktığını (view_data) kendi ekranlarında görsün mü? Varsayılan: hayır.
  show_access_log: 'false',
});
// Ayar önceliği: yönetici panelinde kaydedilen değer > ortam değişkeni > varsayılan
function getSetting(key) { const r = q.setGet.get(key); return r ? r.value : SETTING_DEFAULTS()[key]; }
function validInvites() {
  const now = Date.now();
  return q.invList.all().filter(r => r.active && (!r.expires || r.expires > now) && (!r.max_uses || r.uses < r.max_uses));
}
function regMode() {
  const m = getSetting('registration');
  if (m === 'closed') return 'closed';
  if (m === 'open') return 'open';
  return env.INVITE_CODE || validInvites().length ? 'invite' : 'closed';
}

/* ------------------------------------------------------------------ veritabanı */
const DB_FILE = path.join(DATA_DIR, 'spor.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Docker'da /data kalıcı bir volume değilse, her güncellemede (yeni konteyner) veritabanı sıfırlanır.
// Bunu sessizce kabul etme: boş veritabanıyla başlamayı reddet, yoksa ilk kayıt olan kişi yönetici olur.
function isMountPoint(dir) {
  try {
    const target = path.resolve(dir);
    return fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n')
      .some(l => (l.split(' ')[4] || '').replace(/\\040/g, ' ') === target);
  } catch (e) { return null; } // Linux değil ya da okunamadı: bilinmiyor
}
if (process.platform === 'linux' && fs.existsSync('/.dockerenv') && env.ALLOW_EPHEMERAL_DATA !== 'true' && isMountPoint(DATA_DIR) === false) {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`DURDURULDU: ${DATA_DIR} kalıcı bir volume değil ve veritabanı yok. Bu hâlde her güncellemede tüm veriler silinir.\n` +
      `Coolify → Persistent Storage → Volume ekle (Destination Path: ${DATA_DIR}), sonra yeniden deploy et. (Bilerek geçici kullanacaksan ALLOW_EPHEMERAL_DATA=true)`);
    process.exit(1);
  }
  console.warn(`UYARI: ${DATA_DIR} kalıcı bir volume değil; bir sonraki güncellemede veriler SİLİNECEK. Hemen volume ekle.`);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);

// Güncelleme anı güvencesi: açılışta, şema değişikliğinden ÖNCE tutarlı bir kopya alır (start-*.db, son `keep` tanesi). Günlük doğrulanmış yedek aşağıdaki runBackup()'tadır.
function backupDb(kind, keep) {
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get()) return;
    if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) return; // boş veritabanını yedekleme
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/\..*/, '').replace(/[-:]/g, '').replace('T', '-');
    const file = path.join(BACKUP_DIR, `${kind}-${stamp}.db`);
    if (fs.existsSync(file)) return;
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(kind + '-') && f.endsWith('.db')).sort().reverse().slice(keep)
      .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    console.log(`[yedek] ${path.basename(file)} alındı`);
  } catch (e) { console.error('[yedek] alınamadı:', e.message); }
}
backupDb('start', Number(env.BACKUP_KEEP_START) || 5);
db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, username TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, rc_salt TEXT NOT NULL, rc_hash TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS docs(
  user_id TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS ai_cache(key TEXT PRIMARY KEY, response TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_usage(day TEXT NOT NULL, user_id TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(day,user_id));
CREATE TABLE IF NOT EXISTS food_cache(key TEXT PRIMARY KEY, value TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites(
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0,
  expires INTEGER, created INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS admin_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, admin_id TEXT, target_id TEXT, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS admin_log_target ON admin_log(target_id);
`);
function addCol(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addCol('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'must_change', 'INTEGER NOT NULL DEFAULT 0');
addCol('users', 'ai_limit', 'INTEGER');
addCol('users', 'last_login', 'INTEGER');
addCol('users', 'consent', 'TEXT');
addCol('users', 'sync_hash', 'TEXT'); // iPhone Kısayolları (Apple Sağlık) anahtarının özeti; anahtarın kendisi saklanmaz
db.exec('CREATE INDEX IF NOT EXISTS users_sync ON users(sync_hash)');
// Yönetici yoksa (eski sürümden geçiş) en eski hesap yönetici olur
db.exec(`UPDATE users SET is_admin=1 WHERE id=(SELECT id FROM users ORDER BY created, rowid LIMIT 1)
  AND NOT EXISTS(SELECT 1 FROM users WHERE is_admin=1)`);
const q = {
  userByKey: db.prepare('SELECT * FROM users WHERE key=?'),
  userById: db.prepare('SELECT * FROM users WHERE id=?'),
  userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
  insUser: db.prepare('INSERT INTO users(id,username,key,pw_salt,pw_hash,rc_salt,rc_hash,created,is_admin,consent) VALUES(?,?,?,?,?,?,?,?,?,?)'),
  setPw: db.prepare('UPDATE users SET pw_salt=?,pw_hash=? WHERE id=?'),
  setRc: db.prepare('UPDATE users SET rc_salt=?,rc_hash=? WHERE id=?'),
  setName: db.prepare('UPDATE users SET username=?,key=? WHERE id=?'),
  delUser: db.prepare('DELETE FROM users WHERE id=?'),
  insSess: db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)'),
  sess: db.prepare('SELECT user_id,expires FROM sessions WHERE token_hash=?'),
  delSess: db.prepare('DELETE FROM sessions WHERE token_hash=?'),
  delUserSess: db.prepare('DELETE FROM sessions WHERE user_id=?'),
  delOtherSess: db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?'),
  purgeSess: db.prepare('DELETE FROM sessions WHERE expires<?'),
  docs: db.prepare('SELECT id,data FROM docs WHERE user_id=?'),
  docGet: db.prepare('SELECT data FROM docs WHERE user_id=? AND id=?'),
  userBySync: db.prepare('SELECT * FROM users WHERE sync_hash=?'),
  setSync: db.prepare('UPDATE users SET sync_hash=? WHERE id=?'),
  docCount: db.prepare('SELECT COUNT(*) AS n FROM docs WHERE user_id=?'),
  putDoc: db.prepare('INSERT INTO docs(user_id,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,updated=excluded.updated'),
  delDoc: db.prepare('DELETE FROM docs WHERE user_id=? AND id=?'),
  delDocs: db.prepare('DELETE FROM docs WHERE user_id=?'),
  cacheGet: db.prepare('SELECT response FROM ai_cache WHERE key=? AND created>?'),
  cachePut: db.prepare('INSERT OR REPLACE INTO ai_cache(key,response,created) VALUES(?,?,?)'),
  cachePurge: db.prepare('DELETE FROM ai_cache WHERE created<?'),
  usageGet: db.prepare('SELECT n FROM ai_usage WHERE day=? AND user_id=?'),
  usageSum: db.prepare('SELECT COALESCE(SUM(n),0) AS n FROM ai_usage WHERE day=?'),
  usageInc: db.prepare('INSERT INTO ai_usage(day,user_id,n) VALUES(?,?,1) ON CONFLICT(day,user_id) DO UPDATE SET n=n+1'),
  usagePurge: db.prepare('DELETE FROM ai_usage WHERE day<?'),
  setGet: db.prepare('SELECT value FROM settings WHERE key=?'),
  setPut: db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
  invByCode: db.prepare('SELECT * FROM invites WHERE code=?'),
  invById: db.prepare('SELECT * FROM invites WHERE id=?'),
  invList: db.prepare('SELECT * FROM invites ORDER BY created DESC'),
  invIns: db.prepare('INSERT INTO invites(id,code,label,max_uses,uses,expires,created,active) VALUES(?,?,?,?,0,?,?,1)'),
  invUse: db.prepare('UPDATE invites SET uses=uses+1 WHERE id=?'),
  invSet: db.prepare('UPDATE invites SET active=? WHERE id=?'),
  invDel: db.prepare('DELETE FROM invites WHERE id=?'),
  logIns: db.prepare('INSERT INTO admin_log(ts,admin_id,target_id,action,detail) VALUES(?,?,?,?,?)'),
  logLastView: db.prepare("SELECT ts FROM admin_log WHERE admin_id=? AND target_id=? AND action='view_data' ORDER BY id DESC LIMIT 1"),
  logRecent: db.prepare('SELECT l.id,l.ts,l.action,l.detail,a.username AS admin,t.username AS target FROM admin_log l LEFT JOIN users a ON a.id=l.admin_id LEFT JOIN users t ON t.id=l.target_id ORDER BY l.id DESC LIMIT 150'),
  logForUser: db.prepare('SELECT l.ts,l.action,l.detail,a.username AS admin FROM admin_log l LEFT JOIN users a ON a.id=l.admin_id WHERE l.target_id=? ORDER BY l.id DESC LIMIT 100'),
  setFlags: db.prepare('UPDATE users SET ai_limit=?,disabled=?,is_admin=? WHERE id=?'),
  setMust: db.prepare('UPDATE users SET must_change=? WHERE id=?'),
  setLogin: db.prepare('UPDATE users SET last_login=? WHERE id=?'),
  adminCount: db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin=1 AND disabled=0'),
  delUsage: db.prepare('DELETE FROM ai_usage WHERE user_id=?'),
  cacheCount: db.prepare('SELECT COUNT(*) AS n FROM ai_cache'),
  foodCacheCount: db.prepare('SELECT COUNT(*) AS n FROM food_cache'),
  adminUsers: db.prepare(`SELECT u.id,u.username,u.created,u.is_admin,u.disabled,u.must_change,u.ai_limit,u.last_login,
    (SELECT COALESCE(MAX(updated),0) FROM docs d WHERE d.user_id=u.id) AS last_activity,
    (SELECT COUNT(*) FROM docs d WHERE d.user_id=u.id) AS doc_count,
    (SELECT COALESCE(SUM(LENGTH(data)),0) FROM docs d WHERE d.user_id=u.id) AS bytes,
    (SELECT COALESCE(SUM(n),0) FROM ai_usage a WHERE a.user_id=u.id AND a.day=?) AS ai_today,
    (SELECT COALESCE(SUM(n),0) FROM ai_usage a WHERE a.user_id=u.id AND a.day>=?) AS ai_week
    FROM users u ORDER BY u.created, u.rowid`),
  fcGet: db.prepare('SELECT value,created FROM food_cache WHERE key=?'),
  fcPut: db.prepare('INSERT OR REPLACE INTO food_cache(key,value,created) VALUES(?,?,?)'),
  fcPurge: db.prepare('DELETE FROM food_cache WHERE created<?'),
};

/* referans veritabanı önbelleği (USDA / Open Food Facts); bulunamayanlar (null) da 1 gün saklanır */
const refCache = {
  get(key, ttl) {
    const r = q.fcGet.get(key);
    if (!r) return undefined;
    const v = JSON.parse(r.value);
    const age = Date.now() - r.created;
    if (v === null ? age > 864e5 : age > ttl) return undefined;
    return v;
  },
  put(key, value) { q.fcPut.run(key, JSON.stringify(value === undefined ? null : value), Date.now()); },
};
const ref = createRefDb({ env, cache: refCache });
// Yapay zekâ ve USDA/OFF çökse bile çalışan yerel besin tablosu (USDA SR Legacy kopyası)
const localFoods = createLocalFoods({ file: path.join(__dirname, 'localdata', 'foods.json') });
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ------------------------------------------------------------------ yardımcılar */
class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const b64 = buf => Buffer.from(buf).toString('base64');
const rnd = n => crypto.randomBytes(n);
const normU = s => String(s || '').trim().toLocaleLowerCase('tr-TR');
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const scryptAsync = (pw, saltB64) => new Promise((res, rej) =>
  crypto.scrypt(String(pw).normalize('NFKC'), Buffer.from(saltB64, 'base64'), 64,
    { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? rej(e) : res(k)));
async function hashSecret(secret) {
  const salt = b64(rnd(16));
  return { salt, hash: b64(await scryptAsync(secret, salt)) };
}
const DUMMY_SALT = b64(Buffer.alloc(16));
async function verifySecret(secret, saltB64, hashB64) {
  const got = await scryptAsync(secret, saltB64 || DUMMY_SALT);
  if (!hashB64) return false;
  const want = Buffer.from(hashB64, 'base64');
  return want.length === got.length && crypto.timingSafeEqual(got, want);
}
function genCode() {
  const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = rnd(12);
  let s = '';
  for (let i = 0; i < 12; i++) { s += al[b[i] % al.length]; if (i % 4 === 3 && i < 11) s += '-'; }
  return s;
}
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const publicUser = u => ({ id: u.id, username: u.username, created: u.created, isAdmin: !!u.is_admin, mustChange: !!u.must_change });

/* hatalı deneme sınırlayıcı (bellekte) */
const fails = new Map();
function rlCheck(...keys) {
  for (const k of keys) {
    const f = fails.get(k);
    if (f && f.until > Date.now())
      throw new HttpError(429, 'rate_limited', `Çok fazla hatalı deneme. ${Math.ceil((f.until - Date.now()) / 1000)} sn sonra tekrar dene.`);
  }
}
function rlFail(...keys) {
  for (const k of keys) {
    const ipKey = k.startsWith('ip:');
    const f = fails.get(k) || { n: 0, until: 0, last: 0 };
    f.n++; f.last = Date.now();
    if (ipKey ? f.n >= 25 : f.n >= 5) f.until = Date.now() + (ipKey ? 300000 : 30000 * Math.min(16, 2 ** (f.n - 5)));
    fails.set(k, f);
  }
}
const rlOk = (...keys) => keys.forEach(k => fails.delete(k));
setInterval(() => { const t = Date.now() - 3600000; for (const [k, f] of fails) if (f.last < t && f.until < Date.now()) fails.delete(k); }, 600000).unref();
setInterval(() => {
  try {
    q.purgeSess.run(Date.now());
    q.cachePurge.run(Date.now() - 90 * 864e5);
    q.usagePurge.run(new Date(Date.now() - 40 * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ }));
    q.fcPurge.run(Date.now() - 120 * 864e5);
  } catch (e) { console.error('temizlik hatası', e.message); }
}, 3600000).unref();

/* ------------------------------------------------------------------ otomatik yedek
   SQLite'ın VACUUM INTO komutu, yazma sürerken bile tutarlı bir kopya üretir (dosyayı elle kopyalamak WAL yüzünden bozuk yedek verebilir).
   Her yedek açılıp bütünlük denetiminden geçirilir; yalnızca geçenler saklanır. Eskiler döndürülür. */
const BACKUP_KEEP = Math.max(3, Number(env.BACKUP_KEEP) || 14), BACKUP_EVERY_H = Number(env.BACKUP_EVERY_HOURS) || 24;
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const BACKUP_RE = /^spor-\d{8}-\d{4}\.db$/;
const listBackups = () => fs.readdirSync(BACKUP_DIR).filter(f => BACKUP_RE.test(f)).sort();
function backupInfo() {
  const l = listBackups(), f = l[l.length - 1];
  if (!f) return { count: 0, last: null };
  const st = fs.statSync(path.join(BACKUP_DIR, f));
  return { count: l.length, last: { file: f, at: st.mtimeMs, bytes: st.size } };
}
function runBackup() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const file = path.join(BACKUP_DIR, `spor-${stamp}.db`), tmp = file + '.tmp';
  try { fs.unlinkSync(tmp); } catch (e) { /* yok */ }
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const chk = new DatabaseSync(tmp, { readOnly: true });
  try {
    const r = chk.prepare('PRAGMA integrity_check').get();
    if (!r || r.integrity_check !== 'ok') throw new Error('bütünlük denetimi başarısız');
    chk.prepare('SELECT COUNT(*) AS n FROM users').get(); // tablo okunabiliyor mu
  } catch (e) { chk.close(); try { fs.unlinkSync(tmp); } catch (x) { /* yok */ } throw e; }
  chk.close();
  fs.renameSync(tmp, file);
  for (const old of listBackups().slice(0, -BACKUP_KEEP)) { try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) { /* yok */ } }
  return backupInfo().last;
}
function backupIfDue() {
  try {
    const { last } = backupInfo();
    if (!last || Date.now() - last.at > BACKUP_EVERY_H * 3600000) { const r = runBackup(); console.log(`[yedek] ${r.file} (${r.bytes} bayt)`); }
  } catch (e) { console.error('[yedek] HATA', e.message); }
}
setTimeout(backupIfDue, Number(env.BACKUP_DELAY_MS) || 5000).unref();
setInterval(backupIfDue, Number(env.BACKUP_CHECK_MS) || 3600000).unref();

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}
const isHttps = req => (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || env.COOKIE_SECURE === 'true';

function parseCookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}
function sessionCookie(req, token, maxAgeSec) {
  let c = `sh_session=${token}; HttpOnly; Path=/; SameSite=Lax`;
  if (maxAgeSec !== undefined) c += `; Max-Age=${maxAgeSec}`;
  if (isHttps(req)) c += '; Secure';
  return c;
}
function createSession(userId, remember) {
  const token = rnd(32).toString('base64url');
  const ttl = remember ? 30 * 864e5 : 864e5;
  q.insSess.run(sha256(token), userId, Date.now() + ttl);
  return { token, maxAge: remember ? 30 * 86400 : undefined };
}
function currentUser(req) {
  const t = parseCookies(req).sh_session;
  if (!t) return null;
  const h = sha256(t), s = q.sess.get(h);
  if (!s) return null;
  if (s.expires < Date.now()) { q.delSess.run(h); return null; }
  const u = q.userById.get(s.user_id);
  return u ? { user: u, tokenHash: h } : null;
}
function requireUser(req, allowMustChange = false) {
  const c = currentUser(req);
  if (!c) throw new HttpError(401, 'unauthorized', 'Oturumun süresi doldu, tekrar giriş yap.');
  if (c.user.disabled) { q.delUserSess.run(c.user.id); throw new HttpError(403, 'disabled', 'Hesabın askıya alındı. Yönetici ile iletişime geç.'); }
  if (c.user.must_change && !allowMustChange) throw new HttpError(403, 'must_change', 'Devam etmek için yeni bir şifre belirlemelisin.');
  return c;
}
function logAdmin(adminId, targetId, action, detail) {
  q.logIns.run(Date.now(), adminId, targetId || null, action, detail ? JSON.stringify(detail) : null);
}
function checkInvite(raw) {
  const c = String(raw || '').trim();
  if (!c) return null;
  if (env.INVITE_CODE && crypto.timingSafeEqual(Buffer.from(sha256(c)), Buffer.from(sha256(String(env.INVITE_CODE))))) return { master: true };
  const r = q.invByCode.get(c.toUpperCase());
  if (!r || !r.active) return null;
  if (r.expires && r.expires < Date.now()) return null;
  if (r.max_uses && r.uses >= r.max_uses) return null;
  return r;
}
const TEMP_AL = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genTemp(n = 12) { const b = rnd(n); let s = ''; for (let i = 0; i < n; i++) s += TEMP_AL[b[i] % TEMP_AL.length]; return s; }
function genInviteCode() {
  const al = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = rnd(8);
  let s = 'SPOR-';
  for (let i = 0; i < 8; i++) { s += al[b[i] % al.length]; if (i === 3) s += '-'; }
  return s;
}

/* ------------------------------------------------------------------ yanıt/okuma */
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers,
  });
  res.end(data);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'too_large', 'İstek çok büyük.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new HttpError(400, 'bad_json', 'Geçersiz istek.')); }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ yapay zekâ */
class AiErr extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
function extractJson(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(t); } catch (e) { /* devam */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* devam */ } }
  return null;
}
async function callGemini(model, prompt, images, wantJson, timeout) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new AiErr('ai_disabled', 'Gemini anahtarı tanımlı değil.');
  const parts = [{ text: prompt }, ...images.map(i => ({ inlineData: { mimeType: i.mime, data: i.data } }))];
  const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 16384 } };
  if (wantJson) body.generationConfig.responseMimeType = 'application/json';
  const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new AiErr(r.status === 429 ? 'rate_limited' : 'upstream_error', `Gemini ${r.status}`, r.status);
  const j = await r.json();
  const c = j.candidates && j.candidates[0];
  const text = ((c && c.content && c.content.parts) || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
  if (!text) throw new AiErr(c && c.finishReason === 'SAFETY' ? 'refused' : 'empty_completion', 'Boş cevap');
  return text;
}
/* OpenAI uyumlu sağlayıcılar (aynı istek biçimi): OpenRouter, Groq, Cerebras, Mistral. Anahtar yoksa "kapalı" sayılır. */
const OPENAI_COMPAT = {
  openrouter: { name: 'OpenRouter', base: OPENROUTER_BASE, keyEnv: 'OPENROUTER_API_KEY', extra: { 'X-Title': 'Spor Hocam' } },
  groq: { name: 'Groq', base: (env.GROQ_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, ''), keyEnv: 'GROQ_API_KEY' },
  cerebras: { name: 'Cerebras', base: (env.CEREBRAS_BASE || 'https://api.cerebras.ai/v1').replace(/\/$/, ''), keyEnv: 'CEREBRAS_API_KEY' },
  mistral: { name: 'Mistral', base: (env.MISTRAL_BASE || 'https://api.mistral.ai/v1').replace(/\/$/, ''), keyEnv: 'MISTRAL_API_KEY' },
};
function callOpenAICompat(prov) {
  const c = OPENAI_COMPAT[prov];
  return async (model, prompt, images, wantJson, timeout) => {
    const key = env[c.keyEnv];
    if (!key) throw new AiErr('ai_disabled', `${c.name} anahtarı tanımlı değil.`);
    const content = [{ type: 'text', text: prompt }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))];
    const body = { model, messages: [{ role: 'user', content: images.length ? content : prompt }] };
    if (wantJson) body.response_format = { type: 'json_object' };
    const r = await fetch(`${c.base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(c.extra || {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw new AiErr(r.status === 429 ? 'rate_limited' : 'upstream_error', `${c.name} ${r.status}`, r.status);
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw new AiErr('empty_completion', 'Boş cevap');
    return String(text);
  };
}
/* NVIDIA (build.nvidia.com, OpenAI uyumlu). DeepSeek gibi "düşünen" modeller cevabı önce reasoning_content'te düşünür;
   ücretsiz uç noktada ilk parça ~1 dk sürebilir, bu yüzden akışlı okunur ve yalnızca asıl cevap (content) alınır. Görsel desteklemez. */
async function callNvidia(model, prompt, images, wantJson, timeout) {
  const key = env.NVIDIA_API_KEY;
  if (!key) throw new AiErr('ai_disabled', 'NVIDIA anahtarı tanımlı değil.');
  const r = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, Accept: 'text/event-stream' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 16384, stream: true }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new AiErr(r.status === 429 ? 'rate_limited' : 'upstream_error', `NVIDIA ${r.status}`, r.status);
  const dec = new TextDecoder(); let buf = '', text = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (typeof c === 'string') text += c; } catch (e) { /* eksik parça */ }
    }
  }
  if (!text.trim()) throw new AiErr('empty_completion', 'Boş cevap');
  return text;
}
const PROVIDERS = { gemini: callGemini, openrouter: callOpenAICompat('openrouter'), groq: callOpenAICompat('groq'), cerebras: callOpenAICompat('cerebras'),
  mistral: callOpenAICompat('mistral'), nvidia: callNvidia };
const KEY_ENV = { gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY', cerebras: 'CEREBRAS_API_KEY', mistral: 'MISTRAL_API_KEY', nvidia: 'NVIDIA_API_KEY' };
// Fotoğraf okuyabilir mi? Gemini/OpenRouter/Mistral evet; NVIDIA DeepSeek ve Cerebras hayır; Groq yalnızca görüntü destekli modellerde (scout/maverick/vision/qwen3.5+; gpt-oss metin modelidir)
const canImage = e => !['nvidia', 'cerebras'].includes(e.provider) && (e.provider !== 'groq' || /scout|maverick|vision|llava|qwen\/qwen3\.[5-9]/i.test(e.model));
const aiEnabled = () => Object.values(CHAINS).some(ch => ch.some(e => PROVIDERS[e.provider] && env[KEY_ENV[e.provider]]));

/* ---- devre kesici: bozuk bir model her istekte zaman kaybettirmesin ----
   Hata türüne göre geçici dışlanır (429: 1 dk→30 dk, 404/401/403: 5 dk→6 sa, 5xx/zaman aşımı: 15 sn→5 dk); başarıyla sıfırlanır.
   Hepsi dışlanmışsa yine de sırayla denenir (kurtarma fark edilsin). */
const BREAKER = new Map();
const FAST_MS = Number(env.AI_FAST_TIMEOUT_MS) || 35000, FAST_IMG_MS = Number(env.AI_FAST_TIMEOUT_IMG_MS) || 60000; // son çare olmayan modele tanınan azami süre
const entryKey = e => `${e.provider}:${e.model}`;
const breakerLeft = e => { const b = BREAKER.get(entryKey(e)); return b && b.until > Date.now() ? b.until - Date.now() : 0; };
function breakerFail(e, err) {
  const k = entryKey(e), b = BREAKER.get(k) || { fails: 0 };
  b.fails++;
  const st = err.status, n = Math.min(b.fails - 1, 8);
  const ms = err.code === 'rate_limited' ? Math.min(60000 * 2 ** n, 30 * 60000)
    : [401, 403, 404].includes(st) ? Math.min(5 * 60000 * 2 ** n, 6 * 3600000)
    : Math.min(15000 * 2 ** n, 5 * 60000);
  b.until = Date.now() + ms; b.last = { code: err.code || 'upstream_error', status: st || null, at: Date.now() };
  BREAKER.set(k, b);
}
const breakerOk = e => BREAKER.delete(entryKey(e));
function chainState(chain) {
  return chain.filter(e => PROVIDERS[e.provider] && env[KEY_ENV[e.provider]]).map(e => {
    const left = breakerLeft(e), b = BREAKER.get(entryKey(e));
    return { model: entryKey(e), state: left ? 'bekliyor' : 'hazır', seconds: Math.ceil(left / 1000), reason: left && b && b.last ? (b.last.status ? `HTTP ${b.last.status}` : b.last.code) : '', image: canImage(e) };
  });
}

async function runChain(chain, prompt, images, wantJson, tier) {
  const timeout = tier === 'complex' ? 120000 : 75000;
  const usable = chain.filter(e => PROVIDERS[e.provider] && env[KEY_ENV[e.provider]] && !(images.length && !canImage(e)));
  const lastIdx = usable.length - 1;
  let last = null, jsonErr = null; // jsonErr: bir model ulaşıldı ama bozuk cevap verdi; bu, sonradan gelen bağlantı hatalarından daha bilgilendiricidir
  const attempt = async (e, isLast) => {
    // her modele kısa süre tanı (yavaş olan NVIDIA hariç): asılan bir model sıradakini ve yedek tabloyu geciktirmesin
    const t = e.provider === 'nvidia' ? Math.max(timeout, 150000) : Math.min(timeout, images.length ? FAST_IMG_MS : FAST_MS);
    try {
      const text = await PROVIDERS[e.provider](e.model, prompt, images, wantJson, t);
      if (!wantJson) { breakerOk(e); return { text, model: entryKey(e) }; }
      const parsed = extractJson(text);
      if (parsed && typeof parsed === 'object') { breakerOk(e); return { json: parsed, model: entryKey(e) }; }
      last = jsonErr = new AiErr('invalid_json', 'Cevap okunamadı.');
      console.error(`[ai] ${entryKey(e)} -> invalid_json`);
    } catch (err) {
      last = err instanceof AiErr ? err : new AiErr('upstream_error', String(err && err.message || err));
      if (err && err.name === 'TimeoutError') last = new AiErr('timeout', 'Zaman aşımı');
      breakerFail(e, last);
      console.error(`[ai] ${entryKey(e)} -> ${last.code} ${last.message}`);
    }
    return null;
  };
  const skipped = [];
  for (let i = 0; i < usable.length; i++) {
    const e = usable[i];
    if (breakerLeft(e)) { skipped.push([e, i === lastIdx]); continue; }
    const r = await attempt(e, i === lastIdx);
    if (r) return r;
  }
  // sağlıklı model kalmadıysa dışlananları da sırayla bir kez dene
  for (const [e, isLast] of skipped) { const r = await attempt(e, isLast); if (r) return r; }
  throw jsonErr || last || new AiErr('ai_disabled', 'Yapay zekâ ayarlanmamış.');
}

async function handleAi(req, res, user) {
  const body = await readBody(req, 12 * 1024 * 1024);
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt || prompt.length > 60000) throw new HttpError(400, 'bad_request', 'Metin boş ya da çok uzun.');
  const wantJson = !!body.json;
  const tier = ['quick', 'default', 'complex'].includes(body.tier) ? body.tier : 'default';
  const useCache = body.cache !== false;
  let images = [];
  if (Array.isArray(body.images) && body.images.length) {
    if (body.images.length > 4) throw new HttpError(400, 'bad_request', 'En fazla 4 fotoğraf.');
    images = body.images.map(i => {
      if (!i || !IMG_TYPES.includes(i.mime) || typeof i.data !== 'string' || i.data.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(i.data))
        throw new HttpError(400, 'image_rejected', 'Fotoğraf okunamadı; JPEG/PNG/WebP olmalı.');
      return { mime: i.mime, data: i.data };
    });
  }
  const chain = CHAINS[tier];
  if (!aiEnabled()) throw new HttpError(503, 'ai_disabled', 'Yapay zekâ bu sunucuda ayarlanmamış. Yiyeceği elle girebilirsin.');

  const cacheKey = sha256(JSON.stringify([chain.map(c => c.provider + ':' + c.model), wantJson, prompt]));
  if (useCache && !images.length) {
    const hit = q.cacheGet.get(cacheKey, Date.now() - 90 * 864e5);
    if (hit) {
      const out = JSON.parse(hit.response);
      return send(res, 200, { ...out, cached: true });
    }
  }
  const day = today();
  const mine = (q.usageGet.get(day, user.id) || { n: 0 }).n, all = q.usageSum.get(day).n;
  const userLimit = user.ai_limit !== null && user.ai_limit !== undefined ? Number(user.ai_limit) : Number(getSetting('ai_user_limit'));
  if (mine >= userLimit)
    throw new HttpError(429, 'quota', userLimit === 0
      ? 'Yapay zekâ bu hesapta kapalı. Yiyeceği elle girebilirsin.'
      : `Bugünkü yapay zekâ hakkın doldu (${userLimit} çağrı). Yiyeceği elle girebilirsin; hak yarın yenilenir.`);
  if (all >= Number(getSetting('ai_global_limit')))
    throw new HttpError(429, 'quota', 'Bugünkü ortak yapay zekâ hakkı doldu. Yiyeceği elle girebilirsin; hak yarın yenilenir.');
  try {
    const out = await runChain(chain, prompt, images, wantJson, tier);
    q.usageInc.run(day, user.id);
    const payload = wantJson ? { json: out.json } : { text: out.text };
    if (useCache && !images.length) q.cachePut.run(cacheKey, JSON.stringify(payload), Date.now());
    return send(res, 200, { ...payload, model: out.model });
  } catch (e) {
    const code = e.code || 'upstream_error';
    if (code === 'invalid_json') q.usageInc.run(day, user.id); // sağlayıcıya ulaştı, kota harcandı
    const msgs = {
      invalid_json: 'Cevap okunamadı, tekrar dene.',
      refused: 'Bu istek yanıtlanamadı, farklı yaz.',
      ai_disabled: 'Yapay zekâ bu sunucuda ayarlanmamış.',
    };
    throw new HttpError(code === 'invalid_json' ? 502 : 503, code,
      msgs[code] || 'Yapay zekâ servisi şu an yanıt vermiyor (günlük kota dolmuş olabilir). Yiyeceği elle girebilirsin.');
  }
}

/* ------------------------------------------------------------------ referans veritabanı araması */
const lookups = new Map();
function lookupLimit(userId, perTenMin) {
  const now = Date.now(), e = lookups.get(userId) || { n: 0, t: now };
  if (now - e.t > 600000) { e.n = 0; e.t = now; }
  e.n++; lookups.set(userId, e);
  if (e.n > perTenMin) throw new HttpError(429, 'rate_limited', 'Çok sık arama yapıldı, birkaç dakika sonra tekrar dene.');
}
const STOP = new Set(['the', 'and', 'with', 'without', 'of', 'in', 'a']);
/* ------------------------------------------------------------------ sistem durumu
   Giriş yapmış kullanıcı, dış servislerin açık olup olmadığını ve cevap sürelerini (ms) görür.
   Hafif "okuma" istekleri kullanılır (yapay zekâ üretim kotası harcanmaz); sonuç 20 sn önbelleğe alınır. */
const STATUS_TTL = 20000;
let statusCache = { at: 0, data: null }, statusRun = null;
async function probe(id, name, check) {
  const t0 = performance.now();
  const done = (state, detail) => ({ id, name, state, ms: Math.round(performance.now() - t0), detail });
  try {
    const r = await check();
    if (r.off) return { id, name, state: 'off', ms: null, detail: r.off };
    const d = done(r.ok ? 'ok' : 'down', r.detail || '');
    if (r.noMs) d.ms = null;
    return d;
  } catch (e) {
    return done('down', e && e.name === 'TimeoutError' ? 'zaman aşımı (8 sn)' : 'bağlanılamadı');
  }
}
const httpOk = async (url, headers) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  try { await r.arrayBuffer(); } catch (e) { /* gövde önemsiz */ }
  return { ok: r.ok, detail: r.ok ? 'çalışıyor' : `HTTP ${r.status}` };
};
async function runStatus() {
  const items = await Promise.all([
    probe('db', 'Sunucu ve veritabanı', async () => { db.prepare('SELECT 1').get(); return { ok: true, detail: 'çalışıyor' }; }),
    probe('backup', 'Veritabanı yedeği (günlük)', async () => {
      const b = backupInfo();
      if (!b.last) return { ok: false, detail: 'henüz yedek yok', noMs: true };
      const ageH = (Date.now() - b.last.at) / 3600000, when = ageH < 1 ? Math.max(1, Math.round(ageH * 60)) + ' dk' : Math.round(ageH) + ' sa';
      return { ok: ageH < BACKUP_EVERY_H + 6, detail: `son yedek ${when} önce, ${Math.round(b.last.bytes / 1024)} KB, ${b.count} yedek saklanıyor`, noMs: true };
    }),
    probe('local', 'Yerel besin tablosu (yedek)', async () => { const st = localFoods.stats(); return { ok: st.foods > 1000, detail: `${st.foods} besin, ${st.aliases} Türkçe eşleme` }; }),
    probe('gemini', 'Gemini (yapay zekâ)', async () => !env.GEMINI_API_KEY ? { off: 'anahtar tanımlı değil' }
      : httpOk(`${GEMINI_BASE}/models?pageSize=1`, { 'x-goog-api-key': env.GEMINI_API_KEY })),
    probe('openrouter', 'OpenRouter (yedek yapay zekâ)', async () => !env.OPENROUTER_API_KEY ? { off: 'anahtar tanımlı değil' }
      : httpOk(`${OPENROUTER_BASE}/key`, { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` })),
    probe('nvidia', 'NVIDIA DeepSeek', async () => !env.NVIDIA_API_KEY ? { off: 'anahtar tanımlı değil' }
      : httpOk(`${NVIDIA_BASE}/models`, { Authorization: `Bearer ${env.NVIDIA_API_KEY}` })),
    ...['groq', 'cerebras', 'mistral'].filter(k => env[KEY_ENV[k]]).map(k => probe(k, `${OPENAI_COMPAT[k].name} (yedek yapay zekâ)`,
      () => httpOk(`${OPENAI_COMPAT[k].base}/models`, { Authorization: `Bearer ${env[KEY_ENV[k]]}` }))),
    probe('usda', 'USDA (besin veritabanı)', async () => !ref.usdaEnabled() ? { off: 'anahtar tanımlı değil' }
      : httpOk(`${(env.USDA_BASE || 'https://api.nal.usda.gov/fdc/v1').replace(/\/$/, '')}/foods/search?query=egg&pageSize=1&api_key=${encodeURIComponent(env.USDA_API_KEY)}`, {})),
    probe('off', 'Open Food Facts (barkod)', async () => httpOk(`${(env.OFF_BASE || 'https://world.openfoodfacts.org').replace(/\/$/, '')}/api/v2/product/5449000000996.json?fields=code`,
      { 'User-Agent': `SporHocam/1.0 (${env.OFF_CONTACT || 'kisisel-kullanim'})`, Accept: 'application/json' })),
  ]);
  const ai = items.filter(i => ['gemini', 'openrouter', 'nvidia', 'groq', 'cerebras', 'mistral'].includes(i.id));
  const aiOk = ai.some(i => i.state === 'ok');
  const anyDown = items.some(i => i.state === 'down');
  return { at: Date.now(), items, summary: !aiOk && ai.some(i => i.state !== 'off') ? 'down' : anyDown ? 'warn' : 'ok' };
}
async function handleStatus(req, res) {
  // yapay zekâ sırası (hangi model hazır / geçici dışlanmış) her istekte taze hesaplanır; dış servis ölçümleri önbellekten gelebilir
  const seen = new Set(), entries = [];
  for (const ch of Object.values(CHAINS)) for (const e of ch) if (!seen.has(entryKey(e))) { seen.add(entryKey(e)); entries.push(e); }
  const chain = chainState(entries);
  if (statusCache.data && Date.now() - statusCache.at < STATUS_TTL) return send(res, 200, { ...statusCache.data, chain, cached: true });
  if (!statusRun) statusRun = runStatus().then(d => { statusCache = { at: Date.now(), data: d }; return d; }).finally(() => { statusRun = null; });
  return send(res, 200, { ...(await statusRun), chain });
}

async function handleLookup(req, res, user) {
  const body = await readBody(req, 200000);
  const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
  lookupLimit(user.id, 30);
  let offSearches = 0;
  const out = [];
  for (const it of items) {
    const ai = it && it.ai && typeof it.ai === 'object' ? it.ai : null;
    let found = null, why = null;
    try {
      const barcode = String(it.barcode || '').replace(/\D/g, '');
      if (barcode.length >= 8 && barcode.length <= 14) {
        const prod = await ref.offBarcode(barcode);
        if (prod) found = { ...prod, accepted: true, dist: null, kcalErr: null };
        else why = 'barcode_not_found';
      }
      if (!found && !it.brand && it.search && ref.usdaEnabled()) {
        const cands = await ref.usdaCandidates(String(it.search));
        const toks = String(it.search).toLowerCase().split(/[^a-z]+/).filter(t => t.length > 2 && !STOP.has(t));
        found = pickBest(cands, ai, toks);
        if (!found) why = 'no_match';
      } else if (!found && it.brand && offSearches < 2) {
        offSearches++;
        const cands = await ref.offCandidates(`${it.brand} ${it.name || ''}`);
        found = pickBest(cands, ai, null);
        if (!found) why = 'no_match';
      }
    } catch (e) { why = 'unavailable'; console.error('[ref]', e.message); }
    out.push({ ix: it.ix, ref: found, why });
  }
  return send(res, 200, { results: out });
}

/* ------------------------------------------------------------------ yönetici paneli */
const dbBytes = () => { let n = 0; for (const f of ['spor.db', 'spor.db-wal', 'spor.db-shm']) { try { n += fs.statSync(path.join(DATA_DIR, f)).size; } catch (e) { /* yok */ } } return n; };
async function adminPw(admin, pw, ip) {
  const k1 = `ipa:${ip}|${admin.id}`, k2 = `ip:${ip}`;
  rlCheck(k1, k2);
  const ok = await verifySecret(String(pw || ''), admin.pw_salt, admin.pw_hash);
  if (!ok) { rlFail(k1, k2); throw new HttpError(403, 'bad_password', 'Yönetici şifresi hatalı.'); }
  rlOk(k1);
}
const intIn = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'bad_request', `${name} ${min}-${max} arasında bir tam sayı olmalı.`);
  return n;
};
async function handleAdmin(req, res, p, m, cu, ip) {
  const admin = cu.user;
  if (!admin.is_admin) throw new HttpError(403, 'forbidden', 'Bu işlem için yönetici olmalısın.');

  if (p === '/api/admin/overview' && m === 'GET') {
    const day = today(), weekAgo = new Date(Date.now() - 6 * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ });
    const users = q.adminUsers.all(day, weekAgo).map(u => ({
      id: u.id, username: u.username, created: u.created, isAdmin: !!u.is_admin, disabled: !!u.disabled, mustChange: !!u.must_change,
      aiLimit: u.ai_limit, lastLogin: u.last_login, lastActivity: u.last_activity || null, docCount: u.doc_count, bytes: u.bytes, aiToday: u.ai_today, aiWeek: u.ai_week,
    }));
    const now = Date.now();
    return send(res, 200, {
      users,
      invites: q.invList.all().map(r => ({ id: r.id, code: r.code, label: r.label, maxUses: r.max_uses, uses: r.uses, expires: r.expires, created: r.created,
        status: !r.active ? 'iptal' : r.expires && r.expires < now ? 'süresi doldu' : r.max_uses && r.uses >= r.max_uses ? 'doldu' : 'geçerli' })),
      masterInvite: !!env.INVITE_CODE,
      settings: { registration: getSetting('registration'), aiUserLimit: Number(getSetting('ai_user_limit')), aiGlobalLimit: Number(getSetting('ai_global_limit')), maxUsers: Number(getSetting('max_users')), showAccessLog: getSetting('show_access_log') === 'true' },
      backup: backupInfo(),
      stats: { users: users.length, aiToday: q.usageSum.get(day).n, aiCache: q.cacheCount.get().n, foodCache: q.foodCacheCount.get().n, dbBytes: dbBytes() },
      system: {
        chain: CHAINS.default.map(c => c.provider + ':' + c.model), geminiKey: !!env.GEMINI_API_KEY, openrouterKey: !!env.OPENROUTER_API_KEY, nvidiaKey: !!env.NVIDIA_API_KEY, groqKey: !!env.GROQ_API_KEY, cerebrasKey: !!env.CEREBRAS_API_KEY, mistralKey: !!env.MISTRAL_API_KEY, usdaKey: ref.usdaEnabled(),
        registrationEffective: regMode(), tz: TZ,
      },
    });
  }

  // Tüm veritabanının (tüm kullanıcılar, şifre özetleri dahil) anlık kopyası: yalnızca yönetici, şifre yeniden istenir, kayda geçer.
  if (p === '/api/admin/backup' && m === 'POST') {
    const b = await readBody(req, 2000);
    await adminPw(admin, b.adminPassword, ip);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    for (const f of fs.readdirSync(BACKUP_DIR)) { // çökmeden kalmış geçici dosyaları temizle
      try { if (f.startsWith('tmp-') && Date.now() - fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs > 3600000) fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* başkası sildi */ }
    }
    const file = path.join(BACKUP_DIR, `tmp-${rnd(6).toString('hex')}.db`);
    try { db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); }
    catch (e) { console.error('[yedek] indirme için alınamadı:', e.message); throw new HttpError(500, 'backup_failed', 'Yedek oluşturulamadı.'); }
    const size = fs.statSync(file).size;
    logAdmin(admin.id, null, 'download_backup', { bytes: size });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="spor-hocam-yedek-${today()}.db"` });
    const st = fs.createReadStream(file);
    st.on('close', () => fs.rm(file, { force: true }, () => {}));
    res.on('close', () => st.destroy());
    st.on('error', () => res.destroy());
    st.pipe(res);
    return;
  }

  if (p === '/api/admin/backup-now' && m === 'POST') {
    try { const r = runBackup(); return send(res, 200, { ok: true, last: r, count: backupInfo().count }); }
    catch (e) { throw new HttpError(500, 'backup_failed', 'Yedek alınamadı: ' + e.message); }
  }

  if (p === '/api/admin/log' && m === 'GET') {
    return send(res, 200, { log: q.logRecent.all().map(r => ({ ts: r.ts, action: r.action, admin: r.admin || '—', target: r.target || null, detail: r.detail ? JSON.parse(r.detail) : null })) });
  }

  if (p === '/api/admin/settings' && m === 'POST') {
    const b = await readBody(req, 5000);
    const out = {};
    if (b.registration !== undefined) {
      if (!['invite', 'open', 'closed'].includes(b.registration)) throw new HttpError(400, 'bad_request', 'Geçersiz kayıt modu.');
      out.registration = b.registration;
    }
    if (b.aiUserLimit !== undefined) out.ai_user_limit = String(intIn(b.aiUserLimit, 0, 100000, 'Kişi başı günlük limit'));
    if (b.aiGlobalLimit !== undefined) out.ai_global_limit = String(intIn(b.aiGlobalLimit, 0, 1000000, 'Toplam günlük limit'));
    if (b.maxUsers !== undefined) out.max_users = String(intIn(b.maxUsers, 1, 1000, 'En fazla kullanıcı'));
    if (b.showAccessLog !== undefined) out.show_access_log = b.showAccessLog ? 'true' : 'false';
    if (b.registration === 'open') await adminPw(admin, b.adminPassword, ip);   // herkese açmak riskli: şifre iste
    tx(() => { for (const [k, v] of Object.entries(out)) q.setPut.run(k, v); });
    logAdmin(admin.id, null, 'update_settings', out);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/invites' && m === 'POST') {
    const b = await readBody(req, 5000);
    const label = String(b.label || '').trim().slice(0, 60);
    const maxUses = intIn(b.maxUses ?? 0, 0, 1000, 'Kullanım sayısı');
    const days = intIn(b.expiresDays ?? 0, 0, 3650, 'Süre (gün)');
    const id = 'i' + rnd(6).toString('hex'), code = genInviteCode();
    q.invIns.run(id, code, label || null, maxUses || null, days ? Date.now() + days * 864e5 : null, Date.now());
    logAdmin(admin.id, null, 'create_invite', { label, maxUses, days });
    return send(res, 200, { id, code });
  }
  const im = p.match(/^\/api\/admin\/invites\/([a-z0-9]+)\/(revoke|restore|delete)$/);
  if (im && m === 'POST') {
    const inv = q.invById.get(im[1]);
    if (!inv) throw new HttpError(404, 'not_found', 'Davet kodu bulunamadı.');
    if (im[2] === 'delete') q.invDel.run(inv.id); else q.invSet.run(im[2] === 'revoke' ? 0 : 1, inv.id);
    logAdmin(admin.id, null, im[2] + '_invite', { label: inv.label });
    return send(res, 200, { ok: true });
  }

  const um = p.match(/^\/api\/admin\/users\/(u[0-9a-f]+)(?:\/(data|update|reset-password|wipe-data|delete))?$/);
  if (um) {
    const target = q.userById.get(um[1]);
    if (!target) throw new HttpError(404, 'not_found', 'Kullanıcı bulunamadı.');
    const action = um[2];

    if (action === 'data' && m === 'GET') {
      const last = q.logLastView.get(admin.id, target.id);
      if (!last || Date.now() - last.ts > 10 * 60000) logAdmin(admin.id, target.id, 'view_data');
      const docs = q.docs.all(target.id).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
      return send(res, 200, { user: { id: target.id, username: target.username, created: target.created }, docs });
    }
    if (m !== 'POST') throw new HttpError(405, 'method', 'Geçersiz yöntem.');
    const b = await readBody(req, 5000);
    const self = target.id === admin.id;

    if (action === 'update') {
      const next = { ai_limit: target.ai_limit, disabled: target.disabled, is_admin: target.is_admin };
      const changed = {};
      if (b.aiLimit !== undefined) { next.ai_limit = b.aiLimit === null || b.aiLimit === '' ? null : intIn(b.aiLimit, 0, 100000, 'Günlük limit'); changed.aiLimit = next.ai_limit; }
      if (b.disabled !== undefined) {
        if (self) throw new HttpError(409, 'self', 'Kendi hesabını askıya alamazsın.');
        next.disabled = b.disabled ? 1 : 0; changed.disabled = !!next.disabled;
      }
      if (b.isAdmin !== undefined && !!b.isAdmin !== !!target.is_admin) {
        await adminPw(admin, b.adminPassword, ip);
        if (!b.isAdmin && (self || target.is_admin) && q.adminCount.get().n <= 1) throw new HttpError(409, 'last_admin', 'Son yöneticinin yetkisi kaldırılamaz.');
        next.is_admin = b.isAdmin ? 1 : 0; changed.isAdmin = !!next.is_admin;
      }
      tx(() => { q.setFlags.run(next.ai_limit, next.disabled, next.is_admin, target.id); if (next.disabled) q.delUserSess.run(target.id); });
      logAdmin(admin.id, target.id, 'update_user', changed);
      return send(res, 200, { ok: true });
    }
    if (action === 'reset-password') {
      await adminPw(admin, b.adminPassword, ip);
      const temp = genTemp(12), pw = await hashSecret(temp);
      tx(() => { q.setPw.run(pw.salt, pw.hash, target.id); q.setMust.run(1, target.id); q.delUserSess.run(target.id); });
      logAdmin(admin.id, target.id, 'reset_password');
      return send(res, 200, { tempPassword: temp });
    }
    if (action === 'wipe-data') {
      await adminPw(admin, b.adminPassword, ip);
      q.delDocs.run(target.id);
      logAdmin(admin.id, target.id, 'wipe_data');
      return send(res, 200, { ok: true });
    }
    if (action === 'delete') {
      if (self) throw new HttpError(409, 'self', 'Kendi hesabını burada silemezsin (Ayarlar → Hesap).');
      await adminPw(admin, b.adminPassword, ip);
      if (target.is_admin && q.adminCount.get().n <= 1) throw new HttpError(409, 'last_admin', 'Son yönetici silinemez.');
      logAdmin(admin.id, null, 'delete_user', { username: target.username });
      tx(() => { q.delDocs.run(target.id); q.delUserSess.run(target.id); q.delUsage.run(target.id); q.delUser.run(target.id); });
      return send(res, 200, { ok: true });
    }
  }
  throw new HttpError(404, 'not_found', 'Bulunamadı.');
}

/* ------------------------------------------------------------------ API yönlendirme */
async function pwChecks(pw, username) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'weak_password', 'Şifre en az 8 karakter olmalı.');
  if (pw.length > 200) throw new HttpError(400, 'weak_password', 'Şifre çok uzun.');
  if (normU(pw) === normU(username)) throw new HttpError(400, 'weak_password', 'Şifre kullanıcı adıyla aynı olamaz.');
}
function checkUsername(u) {
  if (!USERNAME_RE.test(String(u || '').trim()))
    throw new HttpError(400, 'bad_username', 'Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanabilirsin.');
}
async function verifyUserPassword(user, pw, ip) {
  const k1 = `ipu:${ip}|${user.id}`, k2 = `ip:${ip}`;
  rlCheck(k1, k2);
  const ok = await verifySecret(String(pw || ''), user.pw_salt, user.pw_hash);
  if (!ok) { rlFail(k1, k2); throw new HttpError(403, 'bad_password', 'Mevcut şifre hatalı.'); }
  rlOk(k1);
}

/* ------------------------------------------------------------------ yakılan kalori (Apple Sağlık / elle) */
// Ayrı bir kayıtta ('health') tutulur; arayüz ay kayıtlarını ('m-*') bütün olarak yazdığı için sunucu onlara dokunmaz.
// Biçim: { days: { 'YYYY-MM-DD': { kcal, steps?, src: 'sync' | 'manual', ts } }, last }
const HEALTH_DOC = 'health';
function readHealth(userId) {
  try { const r = q.docGet.get(userId, HEALTH_DOC); const d = r ? JSON.parse(r.data) : {}; return { days: d.days || {}, last: d.last || null }; }
  catch (e) { return { days: {}, last: null }; }
}
function writeHealth(userId, h) {
  const days = {};
  Object.keys(h.days).sort().slice(-400).forEach(k => { days[k] = h.days[k]; });
  q.putDoc.run(userId, HEALTH_DOC, JSON.stringify({ days, last: h.last }), Date.now());
}
// Kısayollar sayıyı "312,5 kcal" ya da "1.234,5" gibi metin olarak da gönderebilir
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}
function dayStr(offsetDays) { return new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ }); }
function burnDate(raw, maxBackDays) {
  const d = raw === undefined || raw === null || raw === '' ? today() : String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < dayStr(-maxBackDays) || d > dayStr(1)) throw new HttpError(400, 'bad_date', `Tarih YYYY-AA-GG biçiminde ve son ${maxBackDays} gün içinde olmalı.`);
  return d;
}
function genSyncKey() { return 'sh_' + rnd(24).toString('base64url'); }

async function handleApi(req, res, url) {
  const m = req.method, p = url.pathname;
  const ip = clientIp(req);

  if (p === '/api/health') return send(res, 200, { ok: true });

  // iPhone Kısayolları buradan veri gönderir. Çerez değil, kişisel anahtar kullanır (tarayıcıdan tetiklenemez), bu yüzden CSRF başlığı aranmaz.
  if (p === '/api/health-sync' && m === 'POST') {
    const b = await readBody(req, 5000);
    const auth = String(req.headers.authorization || '');
    const key = (/^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '') : String(b.key || '')).trim();
    rlCheck(`sync:${ip}`);
    const u = key.length >= 20 && key.length <= 100 ? q.userBySync.get(sha256(key)) : null;
    if (!u) { rlFail(`sync:${ip}`); throw new HttpError(401, 'bad_key', 'Anahtar geçersiz. Uygulamada Ayarlar → Sağlık bölümünden yeni anahtar üret.'); }
    if (u.disabled) throw new HttpError(403, 'disabled', 'Hesap askıya alınmış.');
    const kcal = parseNum(b.kcal ?? b.activeKcal);
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 15000) throw new HttpError(400, 'bad_kcal', 'kcal 0-15000 arasında bir sayı olmalı.');
    const date = burnDate(b.date, 7);
    const stepsN = b.steps === undefined ? NaN : parseNum(b.steps);
    const h = readHealth(u.id);
    let result = 'saved';
    // Anahtar açıkken elle giriş kapalıdır; Sağlık'tan gelen değer, eskiden elle girilmiş olanın da üstüne yazar
    if (kcal === 0) result = 'skipped_zero'; // kilitli telefonda Sağlık verisi okunamaz ve 0 gelebilir: dolu değeri ezme
    else {
      h.days[date] = { kcal: Math.round(kcal), ...(Number.isFinite(stepsN) && stepsN >= 0 && stepsN <= 200000 ? { steps: Math.round(stepsN) } : {}), src: 'sync', ts: Date.now() };
      h.last = Date.now();
      writeHealth(u.id, h);
    }
    rlOk(`sync:${ip}`);
    return send(res, 200, { ok: true, result, date, kcal: (h.days[date] || {}).kcal || 0 });
  }

  if (m !== 'GET') {
    if (req.headers['x-requested-with'] !== 'spor-hocam') throw new HttpError(403, 'csrf', 'İstek reddedildi.');
    const origin = req.headers.origin;
    if (origin) {
      let oh = ''; try { oh = new URL(origin).host; } catch (e) { /* geçersiz */ }
      const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
      if (oh !== host) throw new HttpError(403, 'csrf', 'İstek reddedildi.');
    }
  }

  if (p === '/api/me' && m === 'GET') {
    let c = currentUser(req);
    if (c && c.user.disabled) c = null;
    return send(res, 200, {
      user: c ? publicUser(c.user) : null,
      config: { registration: regMode(), hasUsers: q.userCount.get().n > 0, ai: aiEnabled(), images: { maxCount: 4, mediaTypes: IMG_TYPES }, ref: { usda: ref.usdaEnabled(), off: true } },
    });
  }

  if (p === '/api/register' && m === 'POST') {
    const b = await readBody(req, 20000);
    const mode = regMode();
    if (mode === 'closed') throw new HttpError(403, 'closed', 'Kayıt şu an kapalı.');
    rlCheck(`ip:${ip}`);
    const first = q.userCount.get().n === 0;
    let invite = null;
    if (mode === 'invite' || (first && env.INVITE_CODE)) {
      invite = checkInvite(b.invite);
      if (!invite) { rlFail(`ip:${ip}`); throw new HttpError(403, 'bad_invite', 'Davet kodu hatalı, süresi dolmuş ya da kullanım hakkı bitmiş.'); }
    }
    const username = String(b.username || '').trim();
    checkUsername(username);
    await pwChecks(b.password, username);
    if (q.userCount.get().n >= Number(getSetting('max_users'))) throw new HttpError(403, 'full', 'Kullanıcı sınırına ulaşıldı.');
    if (q.userByKey.get(normU(username))) throw new HttpError(409, 'taken', 'Bu kullanıcı adı zaten alınmış.');
    const pw = await hashSecret(b.password), code = genCode(), rc = await hashSecret(normCode(code));
    const id = 'u' + rnd(9).toString('hex');
    try {
      tx(() => {
        q.insUser.run(id, username, normU(username), pw.salt, pw.hash, rc.salt, rc.hash, today(), first ? 1 : 0, new Date().toISOString());
        if (invite && invite.id) q.invUse.run(invite.id);
      });
    } catch (e) { throw new HttpError(409, 'taken', 'Bu kullanıcı adı zaten alınmış.'); }
    const s = createSession(id, true);
    q.setLogin.run(Date.now(), id);
    return send(res, 200, { user: publicUser(q.userById.get(id)), recoveryCode: code }, { 'Set-Cookie': sessionCookie(req, s.token, s.maxAge) });
  }

  if (p === '/api/login' && m === 'POST') {
    const b = await readBody(req, 5000);
    const key = normU(b.username), k1 = `ipu:${ip}|${key}`, k2 = `ip:${ip}`;
    rlCheck(k1, k2);
    const u = q.userByKey.get(key);
    const ok = await verifySecret(String(b.password || ''), u && u.pw_salt, u && u.pw_hash);
    if (!u || !ok) { rlFail(k1, k2); throw new HttpError(401, 'bad_login', 'Kullanıcı adı veya şifre hatalı.'); }
    rlOk(k1);
    if (u.disabled) throw new HttpError(403, 'disabled', 'Hesabın askıya alındı. Yönetici ile iletişime geç.');
    q.setLogin.run(Date.now(), u.id);
    const s = createSession(u.id, !!b.remember);
    return send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(req, s.token, s.maxAge) });
  }

  if (p === '/api/logout' && m === 'POST') {
    const t = parseCookies(req).sh_session;
    if (t) q.delSess.run(sha256(t));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (p === '/api/reset' && m === 'POST') {
    const b = await readBody(req, 5000);
    const key = normU(b.username), k1 = `ipu:${ip}|${key}`, k2 = `ip:${ip}`;
    rlCheck(k1, k2);
    const u = q.userByKey.get(key);
    const ok = await verifySecret(normCode(b.code), u && u.rc_salt, u && u.rc_hash);
    if (!u || !ok) { rlFail(k1, k2); throw new HttpError(403, 'bad_code', 'Kullanıcı adı veya kurtarma kodu hatalı.'); }
    await pwChecks(b.password, u.username);
    const pw = await hashSecret(b.password), code = genCode(), rc = await hashSecret(normCode(code));
    tx(() => { q.setPw.run(pw.salt, pw.hash, u.id); q.setRc.run(rc.salt, rc.hash, u.id); q.setMust.run(0, u.id); q.delUserSess.run(u.id); });
    rlOk(k1);
    return send(res, 200, { recoveryCode: code });
  }

  if (p === '/api/ai' && m === 'POST') {
    const { user } = requireUser(req);
    return handleAi(req, res, user);
  }

  /* ---- oturum gerektiren yollar ---- */
  if (p === '/api/account/force-password' && m === 'POST') {
    const cf = requireUser(req, true);
    if (!cf.user.must_change) throw new HttpError(400, 'bad_request', 'Zorunlu şifre değişimi yok.');
    const b = await readBody(req, 5000);
    await pwChecks(b.new, cf.user.username);
    if (await verifySecret(String(b.new), cf.user.pw_salt, cf.user.pw_hash)) throw new HttpError(400, 'weak_password', 'Yeni şifre geçici şifreyle aynı olamaz.');
    const pw = await hashSecret(b.new);
    tx(() => { q.setPw.run(pw.salt, pw.hash, cf.user.id); q.setMust.run(0, cf.user.id); q.delOtherSess.run(cf.user.id, cf.tokenHash); });
    return send(res, 200, { user: publicUser(q.userById.get(cf.user.id)) });
  }
  const cu = requireUser(req), user = cu.user;

  if (p.startsWith('/api/admin/')) return handleAdmin(req, res, p, m, cu, ip);
  if (p === '/api/account/access-log' && m === 'GET') {
    // Hesabı doğrudan etkileyen işlemler (şifre sıfırlama, veri silme, ayar değişikliği) her zaman görünür;
    // yalnızca "verilerine baktı" kayıtları yönetici ayarına bağlıdır.
    const showViews = getSetting('show_access_log') === 'true';
    const rows = q.logForUser.all(user.id).filter(r => showViews || r.action !== 'view_data').map(r => ({ ts: r.ts, action: r.action, admin: r.admin || 'yönetici', detail: r.detail ? JSON.parse(r.detail) : null }));
    return send(res, 200, { log: rows });
  }

  if (p === '/api/status' && m === 'GET') return handleStatus(req, res);
  if (p === '/api/offline-estimate' && m === 'POST') {
    const b = await readBody(req, 20000);
    const text = typeof b.text === 'string' ? b.text.slice(0, 2000) : '';
    if (!text.trim()) throw new HttpError(400, 'bad_request', 'Metin boş.');
    return send(res, 200, localFoods.estimate(text));
  }
  if (p === '/api/lookup' && m === 'POST') return handleLookup(req, res, user);
  const bm = p.match(/^\/api\/barcode\/(\d{8,14})$/);
  if (bm && m === 'GET') {
    lookupLimit(user.id, 40);
    let prod = null;
    try { prod = await ref.offBarcode(bm[1]); }
    catch (e) { throw new HttpError(503, 'ref_unavailable', 'Open Food Facts şu an yanıt vermiyor, biraz sonra tekrar dene.'); }
    if (!prod) throw new HttpError(404, 'not_found', 'Bu barkod Open Food Facts veritabanında bulunamadı.');
    return send(res, 200, { product: prod });
  }

  if (p === '/api/account/username' && m === 'POST') {
    const b = await readBody(req, 5000);
    await verifyUserPassword(user, b.password, ip);
    const username = String(b.username || '').trim();
    checkUsername(username);
    const ex = q.userByKey.get(normU(username));
    if (ex && ex.id !== user.id) throw new HttpError(409, 'taken', 'Bu kullanıcı adı zaten alınmış.');
    q.setName.run(username, normU(username), user.id);
    return send(res, 200, { user: publicUser(q.userById.get(user.id)) });
  }
  if (p === '/api/account/password' && m === 'POST') {
    const b = await readBody(req, 5000);
    await verifyUserPassword(user, b.current, ip);
    await pwChecks(b.new, user.username);
    const pw = await hashSecret(b.new);
    tx(() => { q.setPw.run(pw.salt, pw.hash, user.id); q.delOtherSess.run(user.id, cu.tokenHash); });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/account/recovery' && m === 'POST') {
    const b = await readBody(req, 5000);
    await verifyUserPassword(user, b.password, ip);
    const code = genCode(), rc = await hashSecret(normCode(code));
    q.setRc.run(rc.salt, rc.hash, user.id);
    return send(res, 200, { recoveryCode: code });
  }
  if (p === '/api/account/delete' && m === 'POST') {
    const b = await readBody(req, 5000);
    await verifyUserPassword(user, b.password, ip);
    if (user.is_admin && q.adminCount.get().n <= 1) throw new HttpError(409, 'last_admin', 'Son yönetici hesabını silemezsin. Önce başka birini yönetici yap.');
    tx(() => { q.delDocs.run(user.id); q.delUserSess.run(user.id); q.delUsage.run(user.id); q.delUser.run(user.id); });
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (p === '/api/burn' && m === 'GET') {
    const h = readHealth(user.id);
    return send(res, 200, { days: h.days, sync: { enabled: !!user.sync_hash, last: h.last } });
  }
  if (p === '/api/burn' && m === 'POST') { // elle giriş (yalnızca Apple Sağlık bağlı değilken); kcal boşsa o günün kaydı silinir
    const b = await readBody(req, 2000);
    const date = burnDate(b.date, 400), h = readHealth(user.id);
    if (b.kcal === null || b.kcal === '' || b.kcal === undefined) delete h.days[date];
    else {
      if (user.sync_hash) throw new HttpError(409, 'sync_on', 'Apple Sağlık bağlıyken yakılan kalori elle girilemez; Sağlık\'tan çek. Elle girmek için Ayarlar → Sağlık\'tan bağlantıyı kapat.');
      const kcal = parseNum(b.kcal);
      if (!Number.isFinite(kcal) || kcal < 0 || kcal > 15000) throw new HttpError(400, 'bad_kcal', 'Yakılan kalori 0-15000 arasında bir sayı olmalı.');
      h.days[date] = { kcal: Math.round(kcal), src: 'manual', ts: Date.now() };
    }
    writeHealth(user.id, h);
    return send(res, 200, { days: h.days });
  }
  if (p === '/api/sync-key' && m === 'POST') { // anahtar yalnızca burada, bir kez gösterilir; yenilenince eskisi geçersiz olur
    const key = genSyncKey();
    q.setSync.run(sha256(key), user.id);
    return send(res, 200, { key });
  }
  if (p === '/api/sync-key/revoke' && m === 'POST') {
    q.setSync.run(null, user.id);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/docs' && m === 'GET') {
    const rows = q.docs.all(user.id).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
    return send(res, 200, { docs: rows });
  }
  if (p === '/api/docs' && m === 'DELETE') {
    q.delDocs.run(user.id);
    return send(res, 200, { ok: true });
  }
  const dm = p.match(/^\/api\/docs\/([^/]+)$/);
  if (dm) {
    const id = decodeURIComponent(dm[1]);
    if (!DOC_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'Geçersiz kayıt adı.');
    if (m === 'PUT') {
      const b = await readBody(req, 1024 * 1024);
      if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) throw new HttpError(400, 'bad_request', 'Geçersiz veri.');
      const s = JSON.stringify(b.data);
      if (s.length > 900 * 1024) throw new HttpError(413, 'too_large', 'Kayıt çok büyük.');
      if (q.docCount.get(user.id).n >= 3000) throw new HttpError(413, 'too_many', 'Kayıt sayısı sınırı aşıldı.');
      q.putDoc.run(user.id, id, s, Date.now());
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { q.delDoc.run(user.id, id); return send(res, 200, { ok: true }); }
  }
  throw new HttpError(404, 'not_found', 'Bulunamadı.');
}

/* ------------------------------------------------------------------ statik dosyalar */
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const files = new Map();
function loadStatic() {
  files.clear();
  if (!fs.existsSync(PUB)) return;
  for (const f of fs.readdirSync(PUB)) {
    const full = path.join(PUB, f);
    if (!fs.statSync(full).isFile()) continue;
    const buf = fs.readFileSync(full), ext = path.extname(f);
    const textual = ['.html', '.js', '.css', '.webmanifest', '.svg'].includes(ext);
    files.set('/' + f, {
      buf, gz: textual ? zlib.gzipSync(buf, { level: 9 }) : null, type: MIME[ext] || 'application/octet-stream',
      etag: '"' + sha256(buf).slice(0, 20) + '"',
      cache: ext === '.png' ? 'public, max-age=86400' : 'no-cache',
    });
  }
}
loadStatic();
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
function secHeaders(req) {
  const h = {
    'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  };
  if (isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  let f = files.get(p);
  if (!f) { if (path.extname(p)) { res.writeHead(404, secHeaders(req)); return res.end('Bulunamadı'); } f = files.get('/index.html'); }
  if (!f) { res.writeHead(404, secHeaders(req)); return res.end('Arayüz dosyaları bulunamadı'); }
  const headers = { ...secHeaders(req), 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': f.cache };
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers); return res.end(); }
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding'; }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : (gz ? f.gz : f.buf));
}

/* ------------------------------------------------------------------ sunucu */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      Object.entries(secHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, code: e.code });
    console.error('beklenmeyen hata:', e);
    send(res, 500, { error: 'Sunucu hatası, tekrar dene.', code: 'server_error' });
  }
});
server.requestTimeout = 150000;
server.listen(PORT, () => {
  console.log(`Spor Hocam http://0.0.0.0:${PORT} üzerinde çalışıyor. Veri: ${DATA_DIR}`);
  console.log(`Kayıt modu: ${regMode()} | yapay zekâ: ${aiEnabled() ? 'açık' : 'KAPALI (anahtar yok)'} | zincir: ${CHAINS.default.map(c => c.provider + ':' + c.model).join(' → ')}`);
  console.log(`Referans veri: USDA ${ref.usdaEnabled() ? 'açık' : 'kapalı (USDA_API_KEY yok)'} | Open Food Facts açık`);
  if (regMode() === 'closed' && q.userCount.get().n === 0)
    console.warn('UYARI: Kayıt kapalı ve hiç kullanıcı yok. INVITE_CODE ayarla ki ilk hesabı oluşturabilesin.');
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(() => { try { db.close(); } catch (e) { /* kapalı */ } process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); });
