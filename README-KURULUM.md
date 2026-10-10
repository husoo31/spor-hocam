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
test/*.test.mjs      testler:  node test/server.test.mjs, test/ref.test.mjs, test/admin.test.mjs, test/persist.test.mjs, test/health.test.mjs
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
AI_CHAIN=gemini:gemini-3.1-flash-lite,gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash,groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b,groq:qwen/qwen3.8-27b,openrouter:openrouter/free
```
- **Model adlarını doğrula** (Google adları değiştirir): `python test_models.py --key ANAHTAR --list`
- Gemini 3.8 Flash denemek için: `gemini:gemini-3.8-flash` (ücretsiz katman günlük limiti çok düşük olabilir, ücretli fiyat 1 Ocak 2027'de iki katına çıkıyor).
- Ücretsiz modellere düşmek için OpenRouter: `OPENROUTER_API_KEY` gir ve zincire `openrouter:MODEL_ADI:free` ekle.
- **NVIDIA (DeepSeek) yedeği:** `NVIDIA_API_KEY` (https://build.nvidia.com) tanımlayıp zincirin SONUNA `nvidia:deepseek-ai/deepseek-v4.1-flash` ekleyebilirsin. Bu bir metin modelidir: fotoğraflı isteklerde otomatik atlanır. Ücretsiz uç noktada cevap 1-2 dakika sürebilir (gerçek ölçüm: ~117 sn), bu yüzden yalnızca diğer modeller başarısız olursa devreye girmesi için en sona konur. Doğruluğu gerçek bir yemek isteğinde doğrulandı (haşlanmış yumurta 155 kcal/100 g).
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

**Barkod ve kamera:**
- **Barkod tarama her cihazda çalışır.** Tarayıcının yerleşik okuyucusu (Chrome/Android) varsa o, yoksa uygulamayla gelen ZXing okuyucusu (bilgisayar, iPhone Safari dahil) kullanılır. Kontrol hanesi geçmeyen (yanlış okunmuş) barkod reddedilir ve aynı kod üst üste iki okumada görülmeden kabul edilmez. Canlı tarama zorlaşırsa "Fotoğraftan oku" ile barkodun fotoğrafı seçilebilir; numara elle de yazılabilir.
- **Kamerayla fotoğraf:** Bugün sekmesinde "🍽 Yemek fotoğrafı" ve "🏷 Etiket fotoğrafı" düğmeleri uygulama içi kamerayı açar (deklanşör + galeriden seçme).
- **Yemek fotoğrafı** yapay zekâya porsiyonu tabak/çatal/bardak gibi referans nesnelerle ölçtürür; gram tahmini bir aralıkla ("140–230 g") ve "fotoğraftan tahmin" uyarısıyla gösterilir, güven en fazla "orta" olur. Miktarı tartıyla düzelttiğinde değerler güncellenir. Görüntülü yemek işleri "complex" model zincirini (`AI_CHAIN_COMPLEX`) kullanır; USDA/Open Food Facts doğrulaması yemek fotoğrafında da çalışır. **Etiket fotoğrafında** değerler etikettten okunur, referans araması yapılmaz.

Sınırlar: USDA'da Türk yemekleri yoktur, onlar yapay zekâ tahmini + senin "Ürünlerim" kayıtlarınla gelir. Open Food Facts topluluk verisidir; eksik ya da hatalı kayıt olabilir, bu yüzden önizlemede "etiketle karşılaştır" uyarısı çıkar. Referanstan gelen kalemlerde kaynakta olmayan vitamin/mineral sayısı gösterilir; o değerler toplamlara dahil edilmez (tahmin yürütülmez). Aramalar sunucuda 30 gün önbelleğe alınır; Open Food Facts'in dakikadaki istek sınırına uyulur.

### Antrenman günlüğü ve güç takibi
- **Bugün ekranı:** Kart her gün "Bugün antrenman yaptın mı?" diye sorar (🏋 Yaptım / 😴 Dinlenme günü); cevaplanana kadar kart görünür kalır. *Yaptım* deyince hareket seçilir (daha önce girdiklerin + ~40 yaygın hareket önerilir, yenisini de yazabilirsin), her hareket için set satırları girilir: **kg × tekrar**. Önceki antrenmandaki değerler "Geçen sefer" olarak gösterilir, *↺ Kopyala* ile tek dokunuşta doldurulur (kendiliğinden doldurulmaz, yanlış veri girmesin diye). Ağırlıksız hareketlerde kg boş bırakılır.
- **Program (Ayarlar → Program):** Haftanın her günü için *Dinlenme* ya da *Antrenman* seçilir; antrenman günlerine ad (örn. Push), hareketler ve **set sayısı** yazılır. O gün Bugün ekranı hareketleri ve set satırlarını kendisi ekler, sen yalnızca **kilo ve tekrar** girersin; dinlenme günlerinde antrenman sormaz. Planlı bir günü yapmazsan *⏭ Yapmadım* ile işaretlenir (program uyumunu hesaplamak için). Hiç antrenman günü seçilmezse eski davranış: her gün "antrenman yaptın mı?" sorulur. Program, eski sürümlerin ezmemesi için ayrı bir `plan` kaydında tutulur; başlangıç tarihinden önceki günler programa göre yorumlanmaz.
- **Analiz → Güç:** *Program uyumu* (son 4 hafta: planlı/yapılan/atlanan/boş), *Genel değerlendirme* (kaç hareket güçlendi, en çok ilerleyen/gerileyen, kalori açığında güç korunuyor mu), *Haftalık hacim* grafiği, *Tüm hareketler* tablosu ve seçili hareketin ayrıntısı + "sonraki antrenman" önerisi. İsteğe bağlı *Antrenmanımı yorumla* düğmesi (yapay zekâ anahtarı gerekir) programı, uyumu ve gelişimi birlikte yorumlar. Hareket başına tahmini 1RM (Epley: kg × (1 + tekrar/30), 12 tekrarın üstü 12 sayılır; ağırlıksız harekette en iyi set tekrarı), rekor, grafik, son 5 antrenman, son 4 hafta ile önceki 4 haftanın karşılaştırması ve 3 antrenmandır rekor geçilmediğinde durağanlık uyarısı. Yeni rekor kırınca Bugün kartında 🎉 rozeti çıkar. Koç yorumu da antrenman verisini görür.
- **Veri:** Günün kaydında yeni bir `lift` alanı olarak tutulur; yemek, su, kilo ve takviye alanlarına dokunmaz. Eski sürümden kalan `workouts` ve `programs` alanları kullanılmaz, silinmez. Kullanıcının JSON yedeğine ve veritabanı yedeğine dahildir.

### Apple Sağlık ile yakılan kalori (iPhone)
Safari/PWA iPhone'un Sağlık verisini doğrudan okuyamaz; bu yüzden iPhone'un **Kısayollar** uygulaması her gün aktif enerjiyi sunucuya gönderir.
- **Kullanım:** Bugün ekranındaki **🔄 Sağlık'tan çek** düğmesi (yalnızca iPhone/iPad'de görünür) `shortcuts://run-shortcut?name=Spor%20Hocam%20Saglik` ile iPhone'daki aynı adlı kısayolu çalıştırır. Kısayol Sağlık'tan okuyup aşağıdaki isteği sunucuya gönderir; uygulamaya dönünce değer kendiliğinden güncellenir. Telefon açıkken çalıştığı için kilitli telefon sorunu olmaz.
- **Kurulum (bir kez):** *Ayarlar → Sağlık → Anahtar üret*, sonra aynı sayfadaki adımlarla Kısayollar'da `Spor Hocam Saglik` adlı kısayolu oluştur (Sağlık Örneklerini Bul → İstatistikleri Hesapla → Tarihi Biçimlendir → URL İçeriklerini Al). İstersen aynı kısayolu günlük otomasyona da bağlayabilirsin.
- **Gönderilen istek:** `POST https://SENIN-ALAN/api/health-sync`, başlık `Authorization: Bearer ANAHTAR`, gövde `{"kcal": 300, "date": "2026-10-06", "steps": 8200}`. `date` ve `steps` isteğe bağlıdır; tarih son 7 gün içinde olabilir.
- **Hesap:** Bugün ekranında net kalori = yenen − yakılan; kalan kalori = hedef − net. Analiz sekmesi, hedefe uyum ve koç yorumu da yakılan kaloriyi hesaba katar.
- **Çift sayım uyarısı:** Profildeki aktivite düzeyi hedefe zaten günlük hareket payı ekler. *Ayarlar → Sağlık → Hedefi hareketsiz bazdan hesapla* açılınca *Hedeflerimi hesapla* aktivite çarpanını 1,2 alır; yakılan kalori ayrıca eklenir. Elle değiştirdiğin hedef yeniden hesaplamada ezilir, bu yüzden otomatik uygulanmaz.
- **Elle giriş:** Apple Sağlık bağlı değilken Bugün ekranında 🔥 düğmesiyle girilir. Sağlık bağlanınca (anahtar üretilince) elle giriş kapanır; sunucu da elle girişi 409 ile reddeder, ekranda yalnızca gelen değer görünür. Daha önce elle girilmiş bir günün üstüne Sağlık verisi yazılır. Elle girmek için *Ayarlar → Sağlık → Bağlantıyı kapat*.
- **Sınırlar:** iPhone kilitliyken Sağlık verisi okunamaz ve kısayol 0 gönderebilir; sunucu 0'ı yok sayar ve dolu değeri korur. Anahtar sunucuda yalnızca özet (hash) olarak saklanır; kaybedersen yenisini üret. Yanlış anahtar denemeleri sınırlanır. Yakılan kalori verisi kullanıcının `health` kaydında durur, yedeğe ve veritabanı yedeğine dahildir (JSON kullanıcı yedeğine dahil değildir).

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
- **Güncelleme verileri silmez:** kod hiçbir tabloyu baştan oluşturmaz; şema değişiklikleri yalnızca "yoksa ekle" biçimindedir. Silinen tek şey süresi dolmuş oturumlar ve eski önbellekler. Kullanıcı verisi yalnızca kullanıcı ya da yönetici kendisi silerse silinir.
- **Volume koruması:** `/data` kalıcı bir volume değilse (yani güncelleme verileri götürecekse) sunucu, veritabanı yokken **başlamayı reddeder** ve günlüğe `DURDURULDU: ... kalıcı bir volume değil` yazar. Veritabanı varsa açılır ama günlükte `UYARI` verir. Bilerek geçici kullanacaksan `ALLOW_EPHEMERAL_DATA=true`. (Yalnızca Docker/Linux'ta çalışır.)
- **Güncelleme anı yedeği:** sunucu her açılışta, şema değişikliğinden **önce**, `/data/backups/start-*.db` olarak tutarlı bir kopya alır (son 5 tane, `BACKUP_KEEP_START`). Böylece hatalı bir güncelleme geri alınabilir. Günlük doğrulanmış yedek ve sunucu diskine kopyalama aşağıdaki "Veri kaybı" satırında anlatılanlardır. Bu yedekler aynı volume'dadır; volume'un kendisinin silinmesine karşı korumaz.
- **Yönetici panelinden indirme:** *Ayarlar → Yönetim → Sistem → Veritabanı yedeği* tüm veritabanının anlık kopyasını `.db` dosyası olarak indirir. Dosya tüm kullanıcıların verilerini ve şifre özetlerini içerir; bu yüzden yalnızca yönetici indirebilir, yönetici şifresi yeniden istenir ve işlem *Yönetim → Kayıt* sekmesine yazılır. Volume silinse bile elinde kalması için bunu ara sıra indirip güvenli bir yere koy.
- **Yedekten dönmek:** uygulamayı durdur, `/data/backups/` içindeki dosyayı `/data/spor.db` olarak kopyala (eski `spor.db-wal` ve `spor.db-shm` dosyalarını sil), uygulamayı başlat.
- **Kullanıcı yedeği:** her kullanıcı *Ayarlar → Veri → Yedeği indir* ile kendi verisini JSON olarak alabilir.

## 7b) Kesintisizlik: bir şey bozulduğunda ne olur
| Arıza | Ne olur |
|---|---|
| Bir yapay zekâ modeli kapanır / kotası dolar / yanıt vermez | Zincirdeki sıradaki modele geçilir. Bozuk model 1 dk–6 saat arası **geçici dışlanır** (devre kesici), her istekte zaman kaybettirmez. Fotoğrafsız bekleme en fazla 35 sn. Durum panelinde "Yapay zekâ sırası" görünür. |
| Gemini tamamen düşer | OpenRouter / Groq / Cerebras / Mistral / NVIDIA yedekleri (anahtarları tanımlıysa). Anahtar eklemek için ilgili `*_API_KEY` ve `AI_CHAIN`. |
| **Tüm yapay zekâ servisleri** düşer | Uygulama yazdığını **yerel besin tablosundan** (USDA SR Legacy kopyası, 7793 besin, internetsiz) yaklaşık hesaplar. Tabloda olmayan yemeği (menemen, lahmacun…) **uydurmaz**, "bulunamadı" der. |
| USDA / Open Food Facts çöker | Yerel tablo ve 30 günlük önbellek devreye girer. |
| Uygulama takılır / sağlıksız olur | `ops/spor-watchdog.sh` (cron, dakikada bir) yalnızca bu konteyneri yeniden başlatır. Konteyner yoksa ya da dışarıdan erişilemiyorsa kaydeder (Coolify/Traefik'e dokunmaz). |
| Veri kaybı | Veritabanı günde bir **doğrulanmış** (bütünlük denetimli) yedeklenir, son 14 yedek konteynerde; `ops/spor-backup-sync.sh` (cron, 04:15) bunları sunucu diskine (`~/spor-backups`, son 30) kopyalar. Yönetici panelinde "Şimdi yedekle". |

**Geri yükleme:** uygulamayı durdur, yedeği `/data/spor.db` olarak koy (`spor.db-wal` ve `spor.db-shm` dosyalarını sil), uygulamayı başlat.
**Sınırlar:** yedekler aynı sunucuda durur; sunucu/disk tümden giderse kaybolur. Gerçek felaket koruması için `~/spor-backups` klasörünü düzenli olarak başka bir yere (bilgisayarın, bulut depolama) kopyala. Tek sunucu olduğu için sunucunun kendisi çökerse hizmet durur.

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
| Güncelleme sonrası veriler gitmiş | `/data` için kalıcı depolama (volume) eklenmemiş; önce `/data/backups/` içine bak |
| Günlükte "DURDURULDU: ... kalıcı bir volume değil" | Coolify → Persistent Storage'a `/data` volume'u ekle, yeniden deploy et |
| Ana ekrana ekle çıkmıyor | HTTPS gerekir; sertifika alınmamış olabilir |

## Telefon uyumluluğu
Arayüz telefon öncelikli tasarlandı ve gerçek bir Chromium'da telefon boyutlarında (320, 360, 390 ve 430 px genişlik) 21 ekranın hepsi ölçüldü: yatay kaydırma yok, taşan öğe yok, alt menünün altında kalan içerik yok. Yazı alanları 16 px (iPhone'da dokununca ekran yakınlaşmaz), dokunma alanları en az 44 px, çentik/alt çubuk boşlukları ve klavye açılınca alt menünün gizlenmesi ayarlı. Bilgisayarda da çalışır (içerik ortalanmış dar bir sütunda görünür).
Gerçek bir iPhone/Android cihazda denemedim; ilk kullanımda bir yerde sorun görürsen ekran görüntüsüyle bildir.

## Bilinen sınırlar
- USDA ve Open Food Facts'in gerçek sunucularını geliştirme ortamımda deneyemedim (ağ erişimi yok); eşleme ve dönüşümler USDA/Open Food Facts yanıt biçimine göre yazılıp sahte sunucularla test edildi. İlk kullanımda birkaç yiyecekle kontrol et.
- Gemini model adları (`gemini-3-flash-preview` vb.) Google tarafından değiştirilebilir; ilk kurulumda `test_models.py --list` ile doğrula.
- Çevrimdışıyken kayıt girebilirsin (internet gelince eşitlenir) ama yapay zekâ hesaplaması internet ister.
- Docker derlemesini ve gerçek Gemini çağrısını geliştirme ortamımda deneyemedim; sunucu ve arayüz sahte Gemini sunucusuyla uçtan uca test edildi.
