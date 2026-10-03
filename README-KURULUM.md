# Spor Hocam: Coolify kurulum rehberi

Tek bir Docker uygulaması: sunucu (hesaplar, veriler, yapay zekâ) + arayüz (telefona yüklenebilir PWA).
Veriler SQLite dosyasında, yapay zekâ çağrıları sunucu üzerinden gider; API anahtarı tarayıcıya hiç inmez.

## Paket içeriği
```
server.js            sunucu (bağımlılık yok, sadece Node.js 22.13+)
public/              arayüz, manifest, servis çalışanı, ikonlar
Dockerfile           Coolify bu dosyayla derler (ARM64 ve AMD64 uyumlu)
.env.example         ortam değişkenleri örneği
refdb.js            USDA + Open Food Facts araması, birim dönüşümü, eşleştirme
test/*.test.mjs      testler:  node test/server.test.mjs, test/ref.test.mjs, test/admin.test.mjs
```

## 1) GitHub'a yükle
1. github.com'da **özel (private)** yeni bir depo aç (örn. `spor-hocam`).
2. Bu klasörün içindekileri depoya yükle (`.env` dosyası yükleme, zaten `.gitignore`'da):
   ```
   git init && git add . && git commit -m "ilk sürüm"
   git branch -M main
   git remote add origin git@github.com:KULLANICI/spor-hocam.git
   git push -u origin main
   ```
3. Coolify'a depoya erişim ver: *Sources → GitHub App* ile ya da depoya *Deploy Key* ekleyerek.

## 2) Coolify'da uygulamayı oluştur
1. **Project → New Resource → Private Repository (GitHub App / Deploy Key)** → depoyu ve `main` dalını seç.
2. **Build Pack: Dockerfile** seç.
3. **Ports Exposes: `3000`**.
4. **Domains:** `https://spor.SENIN-ALAN-ADIN.com` (DNS'i sunucu IP'sine yönlendirdin; Coolify sertifikayı otomatik alır).
5. **Persistent Storage → Add (Volume):** Name `spor-data`, **Destination Path `/data`**.
   > Bunu deploy etmeden ÖNCE ekle. Eklemezsen her güncellemede veritabanı silinir.
6. **Environment Variables:** `.env.example` içindekileri gir. En az:
   - `INVITE_CODE`: uzun, tahmin edilmesi zor bir kod (kayıt olurken istenir)
   - `GEMINI_API_KEY`: https://aistudio.google.com/apikey adresinden ücretsiz
   - `AI_CHAIN`: model sırası (aşağıya bak)
   - `USDA_API_KEY`: ücretsiz, genel besinlerin gerçek değerleri için (bölüm 5'e bak)
   - `OFF_CONTACT`: Open Food Facts'e gönderilen kimlik için iletişim bilgin
7. **Health Check** (isteğe bağlı): yol `/api/health`, port `3000`. (Dockerfile'da zaten tanımlı.)
8. **Deploy**. Günlüklerde şu satırı görmelisin:
   `Kayıt modu: invite | yapay zekâ: açık | zincir: ...`

## 3) İlk kullanım
1. Siteyi aç → **Hesap oluştur** (davet kodunu gir) → **kurtarma kodunu bir yere yaz**. Şifreni unutursan hesabı sadece bu kodla açarsın, e-posta ile sıfırlama yok.
2. Diğer 2-3 kişiye siteyi ve davet kodunu ver; herkes kendi hesabını açar. Herkesin verisi ayrıdır.
3. **Eski claude.ai sürümünden veri taşımak:** eski sitede *Ayarlar → Veri → Yedeği indir*; yeni sitede *Ayarlar → Veri → Yedekten yükle*.
4. **Telefona yükle:** Android Chrome'da menü → *Ana ekrana ekle / Uygulamayı yükle*. iPhone Safari'de Paylaş → *Ana Ekrana Ekle*. (HTTPS gerekir; Coolify bunu sağlar.)

## 4) Yapay zekâ modeli ve maliyet
`AI_CHAIN` soldan sağa denenir; ilk model hata verirse ya da ücretsiz kotası dolarsa sıradakine geçilir:
```
AI_CHAIN=gemini:gemini-3-flash-preview,gemini:gemini-2.5-flash,gemini:gemini-2.5-flash-lite
```
- **Model adlarını doğrula** (Google adları değiştirir): `python test_models.py --key ANAHTAR --list`
- Gemini 3.8 Flash denemek için: `gemini:gemini-3.8-flash` (ücretsiz katman günlük limiti çok düşük olabilir, ücretli fiyat 1 Ocak 2027'de iki katına çıkıyor).
- Ücretsiz modellere düşmek için OpenRouter: `OPENROUTER_API_KEY` gir ve zincire `openrouter:MODEL_ADI:free` ekle.
- **Maliyeti düşüren şeyler:** ortak önbellek (aynı soru ikinci kez API'ye gitmez), kişi başı günlük limit (`AI_DAILY_LIMIT_PER_USER`, varsayılan 80), herkes için toplam limit (300). Kota dolunca yiyecek elle girilebilir; uygulama yapay zekâsız da çalışır.
- Hassas mod (2. denetim adımı) çağrı sayısını iki katına çıkarır; Ayarlar → Tercihler'den kapatılabilir.

## 5) Referans besin veritabanları (USDA + Open Food Facts)
Yemek hesaplaması üç katmanlı çalışır; yapay zekâ değerleri uydurmak yerine önce gerçek veriyle doğrulanır:
1. **Yapay zekâ** cümleyi kalemlere ayırır, gramajı tahmin eder ve her kalem için bir İngilizce arama terimi (örn. `chicken breast cooked roasted`) ile kaba bir değer önerir.
2. **Sunucu referans veritabanında arar:**
   - Genel besinler (tavuk, pirinç, yumurta…) → **USDA FoodData Central** (Foundation + SR Legacy; 100 g başına laboratuvar değerleri, vitamin/mineral dahil).
   - Markalı ürün ya da barkod → **Open Food Facts** (paket etiketi verisi).
   - Bulunan aday, yapay zekâ tahminiyle **karşılaştırılır**. Kalori farkı ≤ %25 ve makro farkı makulse kabul edilir ("📚 USDA: …" satırı görünür). Uyuşmazsa **kabul edilmez**, yalnızca öneri olarak sunulur; hangisinin doğru olduğunu sen seçersin. Böylece yanlış eşleşme (örn. "pirinç" → "pirinç unu") sessizce değerleri bozmaz.
3. **Denetim adımı yalnızca referansla doğrulanamayan kalemlere** uygulanır (Türk yemekleri, bulunamayanlar). Hepsi doğrulandıysa ikinci yapay zekâ çağrısı hiç yapılmaz; hem maliyet hem hata düşer.

**Barkod:** Bugün sekmesinde "▥ Barkod" ile numara yazılır ya da (Chrome/Android'de) kamerayla taranır; yapay zekâ gerekmez. iPhone Safari kamerayla barkod okumayı desteklemez, orada numarayı elle yaz.

Sınırlar: USDA'da Türk yemekleri yoktur, onlar yapay zekâ tahmini + senin "Ürünlerim" kayıtlarınla gelir. Open Food Facts topluluk verisidir; eksik ya da hatalı kayıt olabilir, bu yüzden önizlemede "etiketle karşılaştır" uyarısı çıkar. Referanstan gelen kalemlerde kaynakta olmayan vitamin/mineral sayısı gösterilir; o değerler toplamlara dahil edilmez (tahmin yürütülmez). Aramalar sunucuda 30 gün önbelleğe alınır; Open Food Facts'in dakikadaki istek sınırına uyulur.

## 6) Yönetici paneli
**Kim yönetici?** Siteye ilk kayıt olan hesap otomatik yönetici olur (davet kodu olarak `INVITE_CODE` ile). Bu yüzden siteyi yayınladıktan hemen sonra ilk hesabı sen aç. Yönetici olunca *Ayarlar → Yönetim* sekmesi görünür.

**Panelde neler var**
- **Kullanıcılar:** herkesin son girişi, son kaydı, bugünkü/haftalık yapay zekâ kullanımı ve veri boyutu. Bir kullanıcıya dokununca:
  - **Günlük:** o kişinin istediğin günkü yemekleri, kalori/makroları, vitamin ve mineralleri, suyu, takviyeleri ve kilosu (varsayılan olarak dün açılır; ‹ › ile ya da tarih seçerek gezersin, "Son günler" listesi de var).
  - **Yönet:** kişiye özel günlük yapay zekâ limiti (boş = varsayılan, 0 = kapalı), hesabı askıya alma, yönetici yapma, **geçici şifre üretme**, verilerini silme, hesabı silme.
- **Davet:** etiketli, kullanım sayısı ve süre sınırlı davet kodları üret; iptal et, geri aç, sil. (`INVITE_CODE` ana kodu her zaman geçerlidir.)
- **Sistem:** kayıt modu (davetli / kapalı / herkese açık), kişi başı ve toplam günlük yapay zekâ limiti, en fazla kullanıcı sayısı; anahtarların tanımlı olup olmadığı, model zinciri, önbellek ve veritabanı boyutu. Bu ayarlar ortam değişkenlerini geçersiz kılar, yeniden başlatma gerekmez.
- **Kayıt:** yöneticilerin yaptığı tüm işlemler (kim, kime, ne zaman).

**Güvenlik kuralları**
- Mevcut şifreyi **göremezsin**; yalnızca geçici şifre üretirsin. Kullanıcı ilk girişte kendi şifresini belirlemek zorundadır, o zamana kadar uygulamaya erişemez.
- Şifre sıfırlama, veri silme, hesap silme, yönetici yetkisini değiştirme ve kaydı herkese açma işlemleri **yönetici şifreni yeniden ister**.
- Son yönetici silinemez, yetkisi alınamaz; kimse kendini panelden askıya alamaz ya da silemez.

**Kullanıcılara bilgilendirme:** Kayıt formunda onay kutusu yoktur, kayıt direkt olur; ama formun altında kısa bir not yer alır: "Bu sunucunun yöneticisi, uygulamanın bakımı için kayıtlı verilerini (yemek, kilo, takviye) görebilir." Bu not kaldırılmadı, çünkü insanların verilerinin başkasına açık olduğunu bilmeleri gerekir. Kullanıcının Ayarlar → Veri sekmesinde de aynı bilgi yazar.

**Erişim kaydı görünürlüğü:** *Yönetim → Sistem* içindeki "Kullanıcılar, verilerine baktığımı görsün" ayarı **varsayılan olarak kapalıdır**: yöneticinin bir kişinin günlüğüne bakması o kişiye gösterilmez (yalnızca sen *Yönetim → Kayıt* sekmesinde görürsün). Şifre sıfırlama, veri silme, hesap ayarı değişikliği gibi **hesabı doğrudan etkileyen işlemler ise her zaman** kullanıcıya görünür; çünkü şifresi birden değişen biri bunun nedenini bilmelidir.

**Yönetim paneli kimlere görünür?** Yalnızca yönetici hesaplarına. Diğer üyelerde *Yönetim* sekmesi hiç görünmez ve yönetici API'leri sunucuda da 403 verir (testle doğrulandı).

## 7) Güncelleme ve yedek
- **Güncelleme:** kodu GitHub'a gönder → Coolify'da *Redeploy* (ya da otomatik deploy aç). Veriler volume'da kalır.
- **Yedek:** her kullanıcı *Ayarlar → Veri → Yedeği indir* ile kendi verisini JSON olarak alabilir. Sunucu tarafı için `/data/spor.db` dosyasını (volume `spor-data`) düzenli kopyala.

## 8) Sorun giderme
| Belirti | Çözüm |
|---|---|
| "Kayıt şu an kapalı" | `INVITE_CODE` tanımlı değil ya da yönetici panelinde kayıt modu "Kapalı"; ekle/aç |
| "Yapay zekâ bu sunucuda ayarlanmamış" | `GEMINI_API_KEY` boş ya da yanlış; Coolify günlüklerinde `[ai]` satırlarına bak |
| "Yapay zekâ servisi şu an yanıt vermiyor" | Kota dolmuş ya da model adı yanlış; `--list` ile adı doğrula, zincire yedek model ekle |
| Bir arkadaş şifresini ve kurtarma kodunu kaybetti | Panelden *Yönet → Geçici şifre üret*; ilk girişte yeni şifre belirler |
| Giriş yapınca hemen atıyor | HTTPS/alan adı sorunu; siteyi `https://` ile açtığından emin ol |
| Hesaplamada "📚 USDA" satırı hiç çıkmıyor | `USDA_API_KEY` boş; Coolify günlüğünde `Referans veri: USDA açık` yazmalı |
| Barkod "bulunamadı" diyor | Ürün Open Food Facts'te yok; besin etiketinin fotoğrafını ekleyerek hesaplat |
| Güncelleme sonrası veriler gitmiş | `/data` için kalıcı depolama (volume) eklenmemiş |
| Ana ekrana ekle çıkmıyor | HTTPS gerekir; sertifika alınmamış olabilir |

## Telefon uyumluluğu
Arayüz telefon öncelikli tasarlandı ve gerçek bir Chromium'da telefon boyutlarında (320, 360, 390 ve 430 px genişlik) 21 ekranın hepsi ölçüldü: yatay kaydırma yok, taşan öğe yok, alt menünün altında kalan içerik yok. Yazı alanları 16 px (iPhone'da dokununca ekran yakınlaşmaz), dokunma alanları en az 44 px, çentik/alt çubuk boşlukları ve klavye açılınca alt menünün gizlenmesi ayarlı. Bilgisayarda da çalışır (içerik ortalanmış dar bir sütunda görünür).
Gerçek bir iPhone/Android cihazda denemedim; ilk kullanımda bir yerde sorun görürsen ekran görüntüsüyle bildir.

## Bilinen sınırlar
- USDA ve Open Food Facts'in gerçek sunucularını geliştirme ortamımda deneyemedim (ağ erişimi yok); eşleme ve dönüşümler USDA/Open Food Facts yanıt biçimine göre yazılıp sahte sunucularla test edildi. İlk kullanımda birkaç yiyecekle kontrol et.
- Gemini model adları (`gemini-3-flash-preview` vb.) Google tarafından değiştirilebilir; ilk kurulumda `test_models.py --list` ile doğrula.
- Çevrimdışıyken kayıt girebilirsin (internet gelince eşitlenir) ama yapay zekâ hesaplaması internet ister.
- Docker derlemesini ve gerçek Gemini çağrısını geliştirme ortamımda deneyemedim; sunucu ve arayüz sahte Gemini sunucusuyla uçtan uca test edildi.
