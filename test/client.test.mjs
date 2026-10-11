// İstemci kodu için statik kontroller: aynı adlı eylem/form/üst düzey tanım çakışmaları ve tanımsız eylemler.
// Çakışma sessizce sonradan tanımlananı seçtirir (örn. iki ayrı `padd` eylemi: yemek ekleme bozuldu). Çalıştır: node test/client.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const lines = src.split('\n');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓ ' : '✗ ') + m); };
const dupes = m => Object.entries(m).filter(([, v]) => v.length > 1).map(([k, v]) => `${k} (satır ${v.join(', ')})`);

// 1) A (tıklama eylemleri): Object.assign(A, {...}) blokları dahil, aynı ad iki kez tanımlanmamalı
const actions = {}; let inA = false;
lines.forEach((ln, i) => {
  if (/^const A=\{/.test(ln) || /^Object\.assign\(A,\{/.test(ln)) { inA = true; return; }
  if (inA && /^\}\);?\s*$|^\};?\s*$/.test(ln)) { inA = false; return; }
  if (inA) { const m = ln.match(/^  (?:async\s+)?([A-Za-z_]\w*)\s*(?:\(|:)/); if (m) (actions[m[1]] = actions[m[1]] || []).push(i + 1); }
});
ok(Object.keys(actions).length > 50, `eylemler okundu (${Object.keys(actions).length} adet)`);
ok(!dupes(actions).length, 'aynı adlı iki eylem yok' + (dupes(actions).length ? ': ' + dupes(actions).join('; ') : ''));

// 2) HTML'de kullanılan her data-a bir eyleme bağlı olmalı
const used = new Set([...src.matchAll(/data-a="([A-Za-z_]\w*)"/g)].map(m => m[1]));
const missing = [...used].filter(k => !actions[k]);
ok(!missing.length, 'her data-a bir eyleme bağlı' + (missing.length ? ': ' + missing.join(', ') : ''));

// 3) FORMS: aynı ad iki kez olmamalı ve kullanılan her data-f tanımlı olmalı
const forms = {}; let inF = false;
lines.forEach((ln, i) => {
  if (/^const FORMS=\{/.test(ln)) { inF = true; return; }
  if (inF && /^\};?\s*$/.test(ln)) { inF = false; return; }
  if (inF) { const m = ln.match(/^  (?:async\s+)?([A-Za-z_]\w*)\s*\(/); if (m) (forms[m[1]] = forms[m[1]] || []).push(i + 1); }
});
ok(!dupes(forms).length, 'aynı adlı iki form yok' + (dupes(forms).length ? ': ' + dupes(forms).join('; ') : ''));
const usedForms = new Set([...src.matchAll(/<form[^>]*\sdata-f="([A-Za-z_]\w*)"/g)].map(m => m[1])); // data-f başka yerlerde alan adı olarak da geçer; yalnızca <form> etiketleri
const missingForms = [...usedForms].filter(k => !forms[k]);
ok(!missingForms.length, 'her data-f bir forma bağlı' + (missingForms.length ? ': ' + missingForms.join(', ') : ''));

// 4) Üst düzey function/const/let tanımları tekrar etmemeli (sonradan tanımlanan öncekini sessizce ezer)
const top = {};
lines.forEach((ln, i) => {
  const m = ln.match(/^(?:async\s+)?function\s+([A-Za-z_]\w*)|^(?:const|let|var)\s+([A-Za-z_]\w*)\s*=/);
  if (m) { const k = m[1] || m[2]; (top[k] = top[k] || []).push(i + 1); }
});
ok(!dupes(top).length, 'üst düzey tanımlar tekrar etmiyor' + (dupes(top).length ? ': ' + dupes(top).join('; ') : ''));

// 5) HTML'deki her data-i giriş türü bir dinleyicide işleniyor mu
const usedI = new Set([...src.matchAll(/data-i="([A-Za-z_]\w*)"/g)].map(m => m[1]));
const handled = new Set([...src.matchAll(/(?:k|dataset\.i)==='([A-Za-z_]\w*)'/g)].map(m => m[1])); // dinleyiciler k==='x' ya da klavye için dataset.i==='x' ile işler
const unhandled = [...usedI].filter(k => !handled.has(k));
ok(!unhandled.length, 'her data-i bir dinleyicide işleniyor' + (unhandled.length ? ': ' + unhandled.join(', ') : ''));

// 6) Yemek ekleme eylemleri (önizlemeden ekle / çıkar) yalnızca bir kez ve önizleme verisini kullanıyor
const padd = src.match(/\n {2}padd\(\)\{[\s\S]*?\n {2}\},/);
ok(!!padd && /V\.preview\.forEach/.test(padd[0]), 'yemek önizleme "ekle" eylemi (padd) yerinde ve V.preview kullanıyor');
ok(/\n {2}pdel\(ds\)\{V\.preview\.splice/.test(src), 'yemek önizleme "çıkar" eylemi (pdel) yerinde');

console.log(`\n${pass} geçti, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
