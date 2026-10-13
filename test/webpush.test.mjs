// Web Push çekirdeği: RFC 8291 resmî test vektörü, uçtan uca şifre çözme ve VAPID (RFC 8292) imza doğrulaması. Çalıştır: node test/webpush.test.mjs
import crypto from 'node:crypto';
import { b64u, fromB64u, generateVapid, rawPublic, vapidHeader, encryptPayload, endpointAllowed } from '../webpush.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };

// RFC 8291 Ek A: bilinen girdilerle bilinen şifreli çıktı
const V = {
  plain: 'When I grow up, I want to be a watermelon',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const rfc = b64u(encryptPayload(V.plain, V.uaPub, V.auth, V.asPriv, V.salt));
ok(rfc === V.body, 'RFC 8291 test vektörü: şifreli çıktı birebir aynı');

// bağımsız çözücü (RFC 8291 §4): abonelik tarafı
function decrypt(body, uaPrivB64, uaPubB64, authB64) {
  const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), enc = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(fromB64u(uaPrivB64));
  const shared = ecdh.computeSecret(asPub), ua = fromB64u(uaPubB64);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, fromB64u(authB64), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(enc.subarray(enc.length - 16));
  const plain = Buffer.concat([d.update(enc.subarray(0, enc.length - 16)), d.final()]);
  return { text: plain.subarray(0, plain.lastIndexOf(2)).toString('utf8'), rs };
}
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const sub = { p: b64u(ua.getPublicKey()), s: b64u(ua.getPrivateKey()), a: b64u(crypto.randomBytes(16)) };
const msg = JSON.stringify({ title: '💊 Takviyeler', body: 'Bugünkü takviyelerini işaretlemeyi unutma. Çğüşiö' });
const dec = decrypt(encryptPayload(msg, sub.p, sub.a), sub.s, sub.p, sub.a);
ok(dec.text === msg && dec.rs === 4096, 'rastgele abonelikle şifrele → çöz (Türkçe karakterler ve emoji korunur)');
ok(b64u(encryptPayload(msg, sub.p, sub.a)) !== b64u(encryptPayload(msg, sub.p, sub.a)), 'her gönderimde farklı tuz ve geçici anahtar');
let bad = 0; for (const f of [() => encryptPayload('x', 'AAAA', sub.a), () => encryptPayload('x', sub.p, 'AAAA'), () => encryptPayload('x'.repeat(5000), sub.p, sub.a)]) { try { f(); } catch (e) { bad++; } }
ok(bad === 3, 'geçersiz anahtar, geçersiz auth ve aşırı büyük yük reddedilir');

// VAPID
const v = generateVapid();
ok(fromB64u(v.publicKey).length === 65 && fromB64u(v.publicKey)[0] === 4, 'VAPID açık anahtarı 65 baytlık sıkıştırılmamış P-256 noktası');
const hdr = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', v, 'mailto:a@b.co', 1_800_000_000_000);
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(hdr);
ok(!!m && m[4] === v.publicKey, 'Authorization biçimi "vapid t=…, k=…" ve k açık anahtar');
const claims = JSON.parse(fromB64u(m[2]).toString()), head = JSON.parse(fromB64u(m[1]).toString());
ok(head.alg === 'ES256' && claims.aud === 'https://fcm.googleapis.com' && claims.sub === 'mailto:a@b.co' && claims.exp === 1_800_000_000 + 12 * 3600, 'JWT: ES256, aud = push servisinin kökeni, sub, exp = +12 saat');
const pubKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.jwk.x, y: v.jwk.y }, format: 'jwk' });
ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: pubKey, dsaEncoding: 'ieee-p1363' }, fromB64u(m[3])), 'JWT imzası açık anahtarla doğrulanır');
ok(rawPublic(v.jwk) === v.publicKey, 'rawPublic tutarlı');

// SSRF koruması
for (const [u, want] of [['https://fcm.googleapis.com/fcm/send/x', true], ['https://updates.push.services.mozilla.com/wpush/v2/x', true], ['https://web.push.apple.com/x', true], ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
  ['http://fcm.googleapis.com/x', false], ['https://evil.example.com/x', false], ['https://fcm.googleapis.com.evil.com/x', false], ['https://127.0.0.1/x', false], ['http://169.254.169.254/latest', false],
  ['https://user:pw@fcm.googleapis.com/x', false], ['https://fcm.googleapis.com:8443/x', false], ['not a url', false], ['https://localhost/x', false]])
  ok(endpointAllowed(u) === want, `endpointAllowed(${u}) = ${want}`);
ok(endpointAllowed('http://127.0.0.1:9/x', true) && !endpointAllowed('ftp://x/y', true), 'PUSH_ALLOW_ANY yalnızca http(s) kabul eder (testler için)');
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
