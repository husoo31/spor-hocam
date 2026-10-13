// Ürün kataloğunu kurar/yeniler: Open Food Facts toplu verisi + restoran menüleri → DATA_DIR/catalog.db (uygulamada "Ürün ara").
// Kullanım (sunucuda, internet gerekir; Coolify → uygulama → Terminal):
//   node tools/build-catalog.mjs                       # Türkiye'de satılan ürünler (varsayılan), /data/menus içindeki CSV'ler dahil
//   node tools/build-catalog.mjs --all                 # dünyadaki tüm ürünler (milyonlarca; indirme ~1 GB, katalog birkaç GB, birkaç dakika)
//   node tools/build-catalog.mjs --countries turkey,germany,united-kingdom
//   node tools/build-catalog.mjs --src urunler.csv.gz  # internetten değil yerel dosyadan (test için)
//   node tools/build-catalog.mjs --menus /data/menus --no-off   # yalnızca restoran menüleri
// Çalışan sunucu yeni dosyayı kendiliği algılar (yeniden başlatma gerekmez). Veri: Open Food Facts (ODbL, https://world.openfoodfacts.org).
import path from 'node:path';
import fs from 'node:fs';
import { buildCatalog, OFF_CSV_URL } from '../catalog.js';

const a = process.argv.slice(2), flag = n => a.includes('--' + n), opt = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : d; };
if (flag('help') || flag('h')) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 10).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const out = opt('out', path.join(dataDir, 'catalog.db')), menusDir = opt('menus', path.join(dataDir, 'menus'));
const input = flag('no-off') ? null : opt('src', OFF_CSV_URL);
const countries = opt('countries', 'turkey').split(',').map(s => s.trim()).filter(Boolean);
console.log(`Katalog kuruluyor → ${out}\n  Kaynak: ${input || '(yok)'}\n  Kapsam: ${flag('all') ? 'dünya' : countries.join(', ')}\n  Menüler: ${fs.existsSync(menusDir) ? menusDir : '(klasör yok)'}`);
const t0 = Date.now();
try {
  const st = await buildCatalog({ input, out, countries, all: flag('all'), menusDir, log: m => console.log('  ' + m) });
  console.log(`Bitti (${Math.round((Date.now() - t0) / 1000)} sn): ${st.off.toLocaleString('tr-TR')} ürün (Open Food Facts), ${st.menu.toLocaleString('tr-TR')} restoran ürünü. Dosya: ${(fs.statSync(out).size / 1048576).toFixed(0)} MB`);
} catch (e) { console.error('HATA:', e.message); process.exit(1); }
