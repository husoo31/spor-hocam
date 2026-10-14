// Web Push (bağımlılıksız): VAPID imzası (RFC 8292) + aes128gcm yük şifreleme (RFC 8291). Yalnızca node:crypto ve fetch kullanır.
import crypto from 'node:crypto';

export const b64u = buf => Buffer.from(buf).toString('base64url');
export const fromB64u = s => Buffer.from(String(s || ''), 'base64url');

/* ------------------------------------------------------------------ VAPID anahtarları */
export function generateVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { jwk, publicKey: rawPublic(jwk) };
}
// uygulama sunucu anahtarı: sıkıştırılmamış P-256 noktası (0x04 || x || y), base64url
export const rawPublic = jwk => b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]));

// Authorization başlığı: "vapid t=<JWT>, k=<açık anahtar>"; JWT ES256 (ieee-p1363 imza), exp ≤ 24 sa
export function vapidHeader(endpoint, vapid, subject, nowMs = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: vapid.jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${rawPublic(vapid.jwk)}`;
}

/* ------------------------------------------------------------------ yük şifreleme (RFC 8291, tek kayıt) */
// p256dh: aboneliğin açık anahtarı (65 bayt), auth: 16 baytlık gizli değer. eph/salt yalnızca test vektörü için dışarıdan verilebilir.
export function encryptPayload(plain, p256dh, auth, eph, salt) {
  const ua = fromB64u(p256dh), authSecret = fromB64u(auth);
  if (ua.length !== 65 || ua[0] !== 4) throw new Error('p256dh geçersiz');
  if (authSecret.length !== 16) throw new Error('auth geçersiz');
  const ecdh = crypto.createECDH('prime256v1');
  if (eph) ecdh.setPrivateKey(fromB64u(eph)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(), shared = ecdh.computeSecret(ua);
  salt = salt ? fromB64u(salt) : crypto.randomBytes(16);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPublic]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = Buffer.concat([Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain)), Buffer.from([2])]); // 0x02 = son kayıt ayırıcısı
  if (data.length > 4096 - 17) throw new Error('yük çok büyük');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

/* ------------------------------------------------------------------ gönderim */
// Yalnızca bilinen tarayıcı push servislerine gönderilir (SSRF'e karşı): kullanıcı abonelik adresini kendisi verir.
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com', 'android.googleapis.com'];
export function endpointAllowed(endpoint, allowAny = false) {
  let u; try { u = new URL(endpoint); } catch (e) { return false; }
  if (endpoint.length > 1000 || u.username || u.password) return false;
  if (allowAny) return u.protocol === 'https:' || u.protocol === 'http:'; // yalnızca testler (PUSH_ALLOW_ANY=true)
  if (u.protocol !== 'https:' || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.some(d => h === d || h.endsWith('.' + d));
}

// sonuç: { ok, status, gone } — gone: abonelik artık geçersiz (404/410), silinmeli
export async function sendWebPush(sub, payload, vapid, { subject, ttl = 3600, urgency = 'normal', timeoutMs = 10000 } = {}) {
  const body = encryptPayload(typeof payload === 'string' ? payload : JSON.stringify(payload), sub.p256dh, sub.auth);
  let r;
  try {
    r = await fetch(sub.endpoint, { method: 'POST', body, signal: AbortSignal.timeout(timeoutMs), headers: {
      Authorization: vapidHeader(sub.endpoint, vapid, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(ttl), Urgency: urgency } });
  } catch (e) { return { ok: false, status: 0, gone: false, error: e.name === 'TimeoutError' ? 'zaman aşımı' : 'bağlantı hatası' }; }
  const ok = r.status >= 200 && r.status < 300;
  let detail = ''; // hata olursa push servisinin açıklaması (örn. VAPID anahtarı uyuşmuyor): teşhis için kısa bir parça
  try { const t = await r.text(); if (!ok) detail = t.replace(/\s+/g, ' ').trim().slice(0, 200); } catch (e) { /* yok say */ }
  return { ok, status: r.status, gone: r.status === 404 || r.status === 410, detail };
}
