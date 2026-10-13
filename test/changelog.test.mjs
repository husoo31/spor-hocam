// Sürüm notları (Ayarlar > Sürümler) testleri. Çalıştır: node test/changelog.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const win = {}; new Function('window', fs.readFileSync(path.join(root, 'public/changelog-data.js'), 'utf8'))(win);
const L = win.CHANGELOG;
const DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

ok(Array.isArray(L) && L.length >= 12, `sürümler okundu (${L && L.length} adet)`);
ok(L[0].v === 'v0' && L[1].v === 'v0.1', 'ilk sürüm v0, ardından v0.1');
ok(L.every((r, i) => i === 0 || r.v === 'v0.' + i), 'sürüm numaraları v0, v0.1, v0.2 … sırayla ve atlamasız');
ok(L.every(r => DT.test(r.d) && r.title && r.items.length), 'her sürümde tarih-saat, başlık ve en az bir madde var');
ok(L.every((r, i) => i === 0 || r.d >= L[i - 1].d), 'sürümler tarih sırasında');
ok(L.every(r => r.items.every(([k, t]) => ['yeni', 'iyi', 'fix', 'geri'].includes(k) && String(t).length > 10)), 'madde türleri geçerli (yeni/iyi/fix/geri)');
ok(L.every(r => (r.commits || []).every(c => /^[0-9a-f]{7}$/.test(c[0]) && DT.test(c[1]) && c[2])), 'commit satırları: kısa hash, tarih-saat, başlık');

// git geçmişi varsa: her hash gerçek bir commit mi, saati (Türkiye saati) doğru mu
let git = true; try { execSync('git rev-parse --git-dir', { cwd: root, stdio: 'ignore' }); } catch (e) { git = false; }
if (git) {
  const all = L.flatMap(r => r.commits || []);
  const bad = [];
  for (const [h, dt] of all) {
    try {
      const out = execSync(`git log -1 --format=%ad --date=format-local:'%Y-%m-%d %H:%M' ${h}`, { cwd: root, env: { ...process.env, TZ: 'Europe/Istanbul' } }).toString().trim();
      if (out !== dt) bad.push(`${h}: kayıtta ${dt}, git'te ${out}`);
    } catch (e) { bad.push(h + ' bulunamadı'); }
  }
  ok(!bad.length, `${all.length} commit hash'i ve saati git geçmişiyle birebir uyuşuyor` + (bad.length ? ': ' + bad.join('; ') : ''));
  // son sürümün kendi commit'i hash'ini bilemez; son sürümün saatinden sonraki commit'ler bir sonraki sürüme kalır
  const seen = [...new Set(all.map(c => c[0]))], last = L[L.length - 1].d;
  const rows = execSync(`git log --no-merges --format='%h|%ad' --date=format-local:'%Y-%m-%d %H:%M'`, { cwd: root, env: { ...process.env, TZ: 'Europe/Istanbul' } }).toString().trim().split('\n').map(x => x.split('|'));
  const missing = rows.filter(([h, d]) => d < last && !seen.some(s => h.startsWith(s))).map(x => x[0]);
  ok(missing.length === 0, 'merge dışındaki hiçbir commit sürüm notlarında atlanmamış' + (missing.length ? ': ' + missing.join(', ') : ''));
}
console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
