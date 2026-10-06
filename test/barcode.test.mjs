// Barkod doğrulama + ZXing okuma testleri (kamerasız; hazır barkod görüntüsüyle). Çalıştır: node test/barcode.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };

// barcode-util.js tarayıcı dosyası; Node'da module nesnesiyle çalıştırılır
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(root, 'public/barcode-util.js'), 'utf8'))(m);
const B = m.exports;

/* ---- kontrol hanesi ---- */
ok(B.validGtin('4006381333931'), 'EAN-13 (Stabilo) geçerli');
ok(B.validGtin('5449000000996'), 'EAN-13 (Coca-Cola) geçerli');
ok(B.validGtin('96385074'), 'EAN-8 geçerli');
ok(B.validGtin('012345678905'), 'UPC-A geçerli');
ok(!B.validGtin('4006381333932'), 'son hanesi yanlış EAN-13 reddedildi');
ok(!B.validGtin('8690504010001'), 'yanlış okunmuş barkod reddedildi');
ok(!B.validGtin('12345'), 'kısa sayı reddedildi');
ok(B.accept('4006 3813 33931') === '4006381333931', 'boşluklu/gürültülü giriş temizlendi');
ok(B.accept('abc') === null && B.accept('') === null && B.accept(null) === null, 'sayı olmayan girdi reddedildi');
ok(B.accept('01234565', 'upc_e') === '012345000065', 'UPC-E, UPC-A\'ya açıldı');
ok(B.accept('01234566', 'upc_e') === null, 'yanlış UPC-E reddedildi');
ok(B.expandUpcE('1234') === null, 'UPC-E uzunluk denetimi');

/* ---- ZXing ile gerçek barkod görüntüsünü okuma (uygulamadaki mantığın aynısı) ---- */
const ctx = { self: {}, window: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'public/zxing.min.js'), 'utf8'), ctx);
const Z = ctx.ZXing || ctx.self.ZXing;
ok(!!Z && !!Z.MultiFormatReader, 'ZXing paketi yüklendi');
const fx = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/ean13.json'), 'utf8'));
const gray = new Uint8ClampedArray(Buffer.from(fx.gray, 'base64'));
const hints = new Map();
hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
hints.set(Z.DecodeHintType.TRY_HARDER, true);
const decode = (g, w, h) => {
  const r = new Z.MultiFormatReader(); r.setHints(hints);
  try { return r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(g, w, h)))).getText(); } catch (e) { return null; }
};
ok(gray.length === fx.w * fx.h, 'fixture boyutu tutarlı');
ok(decode(gray, fx.w, fx.h) === fx.text, 'barkod görüntüsü okundu: ' + fx.text);
// uygulamadaki detect() akışı: önce olduğu gibi oku, olmazsa 90° çevirip tekrar dene
const rotate = (g, w, h) => { const r = new Uint8ClampedArray(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r[x * h + (h - 1 - y)] = g[y * w + x]; return r; };
const detect = (g, w, h) => decode(g, w, h) || decode(rotate(g, w, h), h, w);
const vertical = rotate(gray, fx.w, fx.h); // telefon dik tutulmuş gibi
ok(decode(vertical, fx.h, fx.w) === null, 'dik görüntü düz okumada okunmaz (çevirme adımı gerekli)');
ok(detect(vertical, fx.h, fx.w) === fx.text, 'dik tutulmuş barkod, 90° yedek adımıyla okundu');
ok(decode(new Uint8ClampedArray(fx.w * fx.h).fill(200), fx.w, fx.h) === null, 'boş görüntüde barkod uydurulmadı');
ok(B.accept(decode(gray, fx.w, fx.h), 'ean_13') === fx.text, 'okunan değer doğrulamadan geçti');

console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
