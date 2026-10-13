/* Sürüm notları (Ayarlar > Sürümler). Eskiden yeniye; ekranda en yeni üstte görünür.
   Her sürüm: v (ad), d (ilk commit, Türkiye saati), title, items ([tür, metin]; tür: yeni | iyi | fix | geri), commits ([kısa hash, 'YYYY-MM-DD HH:MM', başlık]).
   Yeni sürüm eklerken: son girişin altına v0.N ekle ve test/changelog.test.mjs'i çalıştır. */
window.CHANGELOG = [
  { v: 'v0', d: '2026-10-03 19:56', title: 'İlk sürüm', items: [
      ['yeni', 'Yediklerini yazarak ekle; yapay zekâ kalori, protein, karbonhidrat ve yağı hesaplar.'],
      ['yeni', 'Hesap ve giriş, yönetici paneli (davet koduyla kayıt), USDA ve Open Food Facts ile değer doğrulama.'],
      ['yeni', 'Telefona kurulabilen uygulama (PWA); arayüz çevrimdışı da açılır.']],
    commits: [['ea9248a', '2026-10-03 19:56', 'İlk commit (Initial commit)']] },
  { v: 'v0.1', d: '2026-10-03 20:29', title: 'Barkod ve yemek fotoğrafı', items: [
      ['yeni', 'Kamerayla barkod okuma (her cihazda); yanlış okumayı kontrol hanesiyle engeller, fotoğraftan da barkod okur.'],
      ['yeni', 'Yemek fotoğrafından porsiyon tahmini (gram aralığı ve güven puanıyla); uygulama içi kamera.']],
    commits: [['fb732ec', '2026-10-03 20:29', 'Kamerayla barkod okuma (her cihazda) ve yemek fotoğrafından tahmin']] },
  { v: 'v0.2', d: '2026-10-04 00:03', title: 'Yedek yapay zekâ ve sistem durumu', items: [
      ['yeni', 'NVIDIA (DeepSeek) yedek yapay zekâ sağlayıcısı.'],
      ['yeni', 'Üst çubukta durum noktası: veritabanı, yapay zekâ ve besin kaynaklarının çalışıp çalışmadığı ve yanıt süresi (ms).']],
    commits: [['78c18e4', '2026-10-04 00:03', 'NVIDIA (DeepSeek) yedek yapay zekâ sağlayıcısı'], ['1e050ff', '2026-10-04 00:10', 'Sistem durumu paneli: üst çubukta nokta, tıklayınca servisler ve ms']] },
  { v: 'v0.3', d: '2026-10-04 17:22', title: 'Yapay zekâ çökse de hesaplama', items: [
      ['yeni', 'Yapay zekâsız yedek hesaplayıcı: yerel USDA tablosu (7.793 besin) Türkçe yazıyı ayrıştırır; bulamadığını uydurmaz.'],
      ['yeni', 'Devre kesici: bozuk model geçici dışlanır, yavaş model sıradakini geciktirmez; Groq, Cerebras ve Mistral eklendi.']],
    commits: [['cb169d0', '2026-10-04 17:22', 'Yapay zekâsız yedek hesaplayıcı: yerel USDA besin tablosu'], ['fd71c00', '2026-10-04 17:26', 'Devre kesici, kısa zaman aşımı ve yeni yapay zekâ sağlayıcıları (Groq, Cerebras, Mistral)']] },
  { v: 'v0.4', d: '2026-10-04 17:28', title: 'Dayanıklılık, yedekleme, model sırası', items: [
      ['yeni', 'Otomatik ve doğrulanmış veritabanı yedeği (her açılışta ve günlük); sunucu izleyici ve yedek senkron betikleri.'],
      ['yeni', 'Detaylı analizde karbonhidrat dağılımı: şeker, lif, nişasta ve net karbonhidrat.'],
      ['iyi', 'Model sırası 16 yemekle ölçülerek yeniden düzenlendi (en doğru ve hızlı modeller başta; en iyisi ≈ %0,5 kalori hatası); kapanan modeller çıkarıldı.'],
      ['fix', 'Tarayıcı eklentisi gibi uygulama dışı hatalar artık kırmızı hata bandında gösterilmiyor.']],
    commits: [['fd65094', '2026-10-04 17:28', 'Otomatik doğrulanmış veritabanı yedeği, döndürme, yönetici düğmesi, durum paneli'], ['4d38de3', '2026-10-04 17:33', 'Dayanıklılık: sunucu tarafı izleyici ve yedek senkronu, güncel model zinciri'], ['58836d4', '2026-10-04 17:36', 'Karbonhidrat dağılımı satırı; eklenti kaynaklı hatalar kırmızı bantta gösterilmez'], ['e89a6fc', '2026-10-04 17:40', 'Groq: qwen3.8 görüntü destekli olarak sınıflandı'], ['c797ea7', '2026-10-04 18:04', 'Model sırası ölçüme göre: en doğru ve hızlı modeller başta']] },
  { v: 'v0.5', d: '2026-10-06 18:18', title: 'Apple Sağlık ve veri koruması', items: [
      ['yeni', 'Apple Sağlık: iPhone Kısayolları yakılan kaloriyi gönderir; Bugün ekranında net kalori (yenen − yakılan) ve "Sağlık\'tan çek" düğmesi.'],
      ['yeni', 'Güncellemede veri kaybına karşı koruma: kalıcı /data yoksa sunucu açılmaz; yönetici panelinden yedek indirme.'],
      ['yeni', '"Sağlık\'a bağla" kısayolu ve 3 adımlık başlangıç rehberi.'],
      ['iyi', 'Sağlık bağlıyken yakılan kalori elle girilemez; veriler çakışmaz.']],
    commits: [['df08637', '2026-10-06 18:18', 'Veri koruması, yönetici yedeği ve Apple Sağlık entegrasyonu'], ['5063bea', '2026-10-06 18:59', 'Bugün ekranına "Sağlık\'a bağla" bağlantısı ve başlangıç rehberi'], ['37961dc', '2026-10-06 19:04', 'Apple Sağlık bağlıyken yakılan kalori elle girilemez']] },
  { v: 'v0.6', d: '2026-10-06 20:12', title: 'Sağlık düğmeleri', items: [
      ['yeni', 'Sağlık bağlanınca "Yakılan kalori ekle" veriyi otomatik çeker; "Sağlık\'a bağla" düğmesi bağlanınca "Sağlık\'tan çek"e dönüşür.'],
      ['iyi', 'Bilgi mesajları artık hata gibi kırmızı görünmüyor.'],
      ['geri', 'Deneme olarak eklenen günlük bir sayaç aynı gün geri alındı.']],
    commits: [['205e97e', '2026-10-06 20:12', 'Bugün ekranına günlük sayaç eklendi'], ['20354af', '2026-10-06 20:18', 'Geri al: günlük sayaç kaldırıldı'], ['6cac772', '2026-10-06 20:32', 'Sağlık bağlanınca "Yakılan kalori ekle" kalır ve otomatik çeker']] },
  { v: 'v0.7', d: '2026-10-11 00:19', title: 'Antrenman günlüğü, program ve güç analizi', items: [
      ['yeni', 'Bugün ekranında antrenman kartı: hareket, set, kilo × tekrar, ~40 hazır hareket, geçen seferin değerleri, yeni rekor rozeti.'],
      ['yeni', 'Ayarlar > Program: haftanın her günü için dinlenme/antrenman; harekete set × tekrar @ kg hedefi. Program gününde hareketler kendiliğinden gelir, yalnızca kilo ve tekrar girilir.'],
      ['yeni', 'Analiz > Güç: tahmini 1RM, rekor, grafik, haftalık ve 4 haftalık karşılaştırma, çalışma kilosu, durağanlık uyarısı, program uyumu, yapay zekâ yorumu.'],
      ['yeni', 'Tek satır giriş (Set × Tekrar @ Kilo) ve tükeniş seti 🔥.'],
      ['iyi', 'Antrenman kartı yemek bölümünün altına taşındı.']],
    commits: [['f78ab39', '2026-10-11 00:19', 'Antrenman günlüğü ve güç takibi'], ['5aaae0d', '2026-10-11 00:32', 'Antrenman programı ve detaylı güç analizi'], ['9ea8bc9', '2026-10-11 00:37', 'Programda set x tekrar @ kg hedefi ve haftalık güç analizi'], ['c909741', '2026-10-11 00:43', 'Kilolara göre güç analizi ve kilo giriş başlıkları'], ['2a22595', '2026-10-11 00:49', 'Tek satır giriş (Set x Tekrar @ Kilo) ve tükeniş seti'], ['b3c8d9c', '2026-10-11 00:51', 'Antrenman kartı yemek bölümünün altına taşındı']] },
  { v: 'v0.8', d: '2026-10-11 01:16', title: 'Uyku analizi', items: [
      ['yeni', 'Apple Sağlık uyku verisi: Bugün ekranında Uyku kartı, evre ve gece hesabı, Geçmiş rozeti, koç yorumuna dahil. Mevcut kalori kısayolu aynen çalışır.']],
    commits: [['cc6837d', '2026-10-11 01:16', 'Apple Sağlık uyku analizi: Bugün ekranında Uyku kartı']] },
  { v: 'v0.9', d: '2026-10-11 20:47', title: 'Yemek ekleme düzeltmesi', items: [
      ['fix', '"Bugün ekle"ye basınca "Hareket adını yaz" çıkıp yemek eklenmiyordu (antrenman programıyla eylem adı çakışması). Düzeltildi; benzer çakışmaları yakalayan test eklendi.'],
      ['fix', 'Eski bozuk dosya telefonda takılı kalmasın diye uygulama dosyaları artık önce ağdan alınıyor.']],
    commits: [['2f41df3', '2026-10-11 20:47', 'Düzeltme: yemek ekleme bozulmuştu (eylem adı çakışması)'], ['04cf6e1', '2026-10-11 21:35', 'Servis çalışanı: arayüz dosyaları önce ağdan alınır']] },
  { v: 'v0.10', d: '2026-10-12 18:16', title: 'Program ekranı düzeltmesi', items: [
      ['fix', 'Programa hareket ekleyince sayfanın en alta atlaması giderildi; sayfa olduğu yerde kalıyor.']],
    commits: [['cda87ad', '2026-10-12 18:16', 'Düzeltme: programa hareket eklenince sayfa en alta atlıyordu']] },
  { v: 'v0.11', d: '2026-10-13 15:20', title: 'İçecek tablosu', items: [
      ['yeni', '"250 ml beyaz monster" gibi yazılar miktara göre hesaplanır: Monster, Red Bull, Burn, kola, Fanta, Sprite, gazoz, limonata, ice tea / FuseTea, ayran, süt, soda, meyve suyu, çay, kahve. Enerji içeceklerinde kafein notu.'],
      ['iyi', 'Tabloda olmayan veya emin olunmayan içecekler yapay zekâya bırakılır; kayıtlı ürünlerin önceliği korunur.']],
    commits: [['a766457', '2026-10-13 15:20', 'İçecek tablosu: markalı içecekler miktara göre hesaplanır'], ['d2a91c6', '2026-10-13 15:23', 'İçecek tablosuna ünlü içecekler eklendi']] },
  { v: 'v0.12', d: '2026-10-13 15:35', title: 'Sürüm notları', items: [
      ['yeni', 'Ayarlar > Sürümler: yapılan her güncellemenin tarihi, saati, yeni özellikleri ve düzeltilen hataları; ilgili commit\'ler.']],
    commits: [] },
];
