/* Barkod doğrulama (saf mantık; tarayıcıda window.BCU, Node'da module.exports).
   Yanlış okumayı engeller: kontrol hanesi (GS1 mod-10) geçmeyen kod kabul edilmez. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.BCU = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  // GS1 kontrol hanesi: sağdan sola 3,1,3,1… ağırlıkları
  function checkDigit(body) {
    let sum = 0;
    for (let i = body.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += Number(body[i]) * w;
    return (10 - (sum % 10)) % 10;
  }
  const validGtin = code => {
    code = digits(code);
    return [8, 12, 13, 14].includes(code.length) && checkDigit(code.slice(0, -1)) === Number(code.slice(-1));
  };
  // UPC-E (8 hane) → UPC-A (12 hane)
  function expandUpcE(c) {
    c = digits(c);
    if (c.length !== 8) return null;
    const n = c[0], d = c.slice(1, 7), chk = c[7], l = d[5];
    let body;
    if ('012'.includes(l)) body = n + d.slice(0, 2) + l + '0000' + d.slice(2, 5);
    else if (l === '3') body = n + d.slice(0, 3) + '00000' + d.slice(3, 5);
    else if (l === '4') body = n + d.slice(0, 4) + '00000' + d[4];
    else body = n + d.slice(0, 5) + '0000' + l;
    return body + chk;
  }
  /* Okuyucudan gelen ham değeri doğrular. fmt: 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' (bilinmiyorsa boş).
     Dönüş: aranacak temiz kod ya da null (geçersiz). */
  function accept(raw, fmt) {
    let c = digits(raw);
    if (!c) return null;
    if (fmt === 'upc_e' || (!fmt && c.length === 8 && c[0] === '0' && !validGtin(c))) {
      const x = expandUpcE(c);
      return x && validGtin(x) ? x : null;
    }
    return validGtin(c) ? c : null;
  }
  return { digits, checkDigit, validGtin, expandUpcE, accept };
});
