# Memory Windows — WebXR demo

Gaussian splat modelin içinde yürüyorsunuz. VR180 kameranın durduğu noktada bir işaret var. Tetiğe basınca görüntü, aynı noktadan çekilmiş VR180 videoya geçiyor. Ambisonik ses başınızla birlikte dönüyor. Video bitince ya da çıkınca aynı noktada modele dönüyorsunuz.

Uygulama yalnızca statik dosyalardan oluşuyor; kurulum ya da derleme yok. Quest 3 tarayıcısında, masaüstü Chrome/Edge'de ve telefonda açılıyor. VR'a girmek için HTTPS adresi gerekiyor.

## Klasör

```
index.html        sayfa
app.js            ana program (gezinme, geçiş, VR)
config.json       sahne: splat dosyası, başlangıç noktası, bellek pencereleri
src/              video küresi + ambisonik çözücü, işaretler, metinler, düzenleyici
vendor/           three.js r180, Spark 2.3.1 (splat), Omnitone 2.0 (ambisonik)
media/            test dosyaları: sentetik oda, VR180 test videosu, AmbiX test sesi
tools/            test dosyalarını üreten betikler
```

## 1. Önce test dosyalarıyla deneyin

Klasördeki test içerikleri çalışmayı kanıtlamak için hazırlandı:

- **Oda:** 132 bin splat'lık sentetik bir oda; içinde masa ve bir kazan var.
- **Video:** VR180 yan yana (SBS) test videosu. Önde saat var, solda ve sağda yazılar, iki gözde ayrı "SOL GÖZ / SAĞ GÖZ" etiketleri.
- **Ses:** AmbiX test sesi:
  - önden her saniye bir tık (videodaki beyaz kare ile aynı anda),
  - soldan tiz bir çan,
  - sağdan pes bir çan.

Quest'te kontrol edilecekler:

1. Kafanızı çevirdiğinizde çanlar dünyada yerinde kalmalı. Sola döndüğünüzde tiz çan önünüze gelmeli.
2. Bir gözünüzü kapatınca o gözün etiketini görmelisiniz (sol göz: "SOL GÖZ").
3. Tık ile beyaz kare aynı anda olmalı.

## 2. Bilgisayarda açmak

Klasörde bir terminal açın:

```bash
npx serve .            # Node varsa
# ya da
python3 -m http.server 8000
```

Tarayıcıda `http://localhost:3000` (veya `:8000`) adresini açın.

| Kontrol | İşlev |
|---|---|
| W A S D / oklar | yürü |
| sürükle | bak |
| işarete tıkla ya da yanındayken Enter | kayda gir |
| 1–9 | o pencerenin önüne atla |
| Esc | modele dön |

URL'ye `?lang=tr` / `?lang=en` ekleyerek dili, `?stats` ekleyerek kare hızı göstergesini, `?edit` ekleyerek düzenleyiciyi açarsınız.

## 3. Quest 3'te açmak (HTTPS gerekir): GitHub Pages

1. GitHub'da **public** bir repo açın, örneğin `memory-windows`.
2. Klasörün tamamını yükleyin. Web arayüzü 25 MB'tan büyük dosyaları kabul etmez; bu yüzden GitHub Desktop ile commit + push yapın. GitHub'da tek dosya sınırı 100 MB.
3. Repo → Settings → Pages → "Deploy from a branch" → `main` / `(root)`.
4. Bir iki dakika sonra adres hazır olur: `https://KULLANICI.github.io/memory-windows/`
5. Quest Browser'da adresi açın → **VR'a gir**.

Quest'te kontroller:

| Kontrol | İşlev |
|---|---|
| iki çubuk, ileri-geri | yürü |
| iki çubuk, sağ-sol | 15° dön |
| ışın + tetik | kayda gir |
| kayıttayken tetik ya da B/Y | modele dön |

Yalnızca kendi ağınızda denemek isterseniz: Quest'i USB ile bağlayın, `adb reverse tcp:3000 tcp:3000` çalıştırın, Quest'te `http://localhost:3000` açın. `localhost` güvenli sayıldığı için VR çalışır.

## 4. Kendi dosyalarınız

### Çekimde dikkat edilecekler (kayıt–model hizası için önemli)

Demonun kanıtladığı şey, videonun modelin içindeki gerçek yerine oturması. Bu yüzden:

- Splat ve VR180 aynı mekânda, mümkünse aynı gün çekilmeli.
- Tripodun durduğu yeri yere bantla X ile işaretleyin. Bant splat taramasında da görünsün.
- Objektifin yerden yüksekliğini ölçün, örneğin 1,50 m.
- Kamerayı belirgin bir şeye doğru çevirin (kapı, pencere, ocak). Hizalarken o nesneyi eşleştireceksiniz.
- Ambisonik mikrofonun "ön" işareti kameranın önüyle aynı yöne baksın. Mikrofon kameranın hemen altında ya da üstünde olsun.
- Kayda başlarken kameranın önünde bir kez el çırpın; ses ile görüntüyü bununla eşleyeceksiniz.
- Demo için 30–60 saniye yeterli.

### Splat (iPad)

Scaniverse, Polycam, Luma ya da KIRI'den **.ply** veya **.spz** dışa aktarın. Spark şu formatları okur: `.ply` (sıkıştırılmış PLY dahil), `.spz`, `.sog`, `.splat`, `.ksplat`.

- Dosya büyükse ya da odanın dışında dağınık splat'lar varsa SuperSplat editöründe (tarayıcıda çalışır, ücretsiz) kırpıp **compressed PLY** olarak kaydedin. Hem küçülür hem Quest'te hızlanır.
- Spark, Quest'te ekranda kalan splat sayısını otomatik olarak yaklaşık 500 bine indiriyor (`"lod": true`).

Dosyayı `media/` içine koyun ve `config.json` → `splat.url` alanını değiştirin.

### VR180 video (Canon R5 C + RF 5.2 mm Dual Fisheye)

1. EOS VR Utility'de **180° equirectangular, side-by-side** olarak dışa aktarın.
2. Ardından Quest tarayıcısının rahat çözeceği boyuta getirin. Aşağıdaki komut 5. saniyeden başlayıp 45 saniye alır, sesi atar:

   ```bash
   ffmpeg -ss 5 -t 45 -i eosvr_export.mp4 -vf scale=4096:2048 -c:v libx264 -preset slow -b:v 12M -maxrate 16M -bufsize 24M -profile:v high -level 5.1 -pix_fmt yuv420p -an -movflags +faststart media/kazan-vr180.mp4
   ```

   45 s × 12 Mbit/s ≈ 68 MB; GitHub'ın 100 MB sınırının altında kalır.
3. Daha keskin görüntü için 5760×2880 H.265 (HEVC) de denenebilir: `-c:v libx265 -tag:v hvc1`. Quest'te akıcı oynayıp oynamadığını cihazda görmek gerekiyor.

### Ambisonik ses

Biçim: 4 kanal **AmbiX** (ACN kanal sırası, SN3D normalizasyonu), 48 kHz WAV.

- Zoom H3-VR gibi bazı kayıt cihazları doğrudan AmbiX verir.
- A-format kaydeden mikrofonlar (ör. Rode NT-SF1) üreticinin eklentisiyle B-format AmbiX'e çevrilmeli.
- Kaynak FuMa ise `config.json`'da `"channelMap": [0, 3, 1, 2]` kullanın.

Video ile aynı aralığı kesin. El çırpma, videoda ve seste farklı zamanlara düşüyorsa sesin `-ss` değerini o farka göre kaydırın:

```bash
ffmpeg -ss 5.00 -t 45 -i ambix_kayit.wav -c:a pcm_s16le -ar 48000 media/kazan-ambix.wav
```

45 saniyelik 4 kanallı WAV yaklaşık 17 MB.

### config.json

```json
"hotspots": [{
  "id": "kazan",
  "title": { "en": "Grape molasses cauldron", "tr": "Pekmez kazanı" },
  "layer": { "en": "Everyday work", "tr": "Gündelik emek" },
  "recordedAt": "2026-10-20",
  "author": "Erdem Yıldırım",
  "position": [1.0, 0, 0.4],
  "yawDeg": 0,
  "lensHeight": 1.5,
  "video": { "sources": [{ "src": "media/kazan-vr180.mp4", "type": "video/mp4" }], "projection": 180, "stereo": "sbs" },
  "audio": { "src": "media/kazan-ambix.wav", "format": "ambix", "channelMap": [0, 1, 2, 3], "gain": 1.0 }
}]
```

- `position` ve `yawDeg`: pencerenin modeldeki konumu ve yönü. Elle yazmak yerine düzenleyiciyle yerleştirin (bkz. 5).
- `projection`: 180 ya da 360.
- `stereo`: `sbs` (yan yana), `tb` (üst-alt) ya da `mono`.

## 5. Düzenleyici: hizalama ve pencere yerleştirme

`index.html?edit` adresini masaüstünde açın:

1. **Modeli hizala.** iPad dışa aktarımları bazen yan yatık ya da ters gelir. Tilt X / Roll Z düğmeleriyle duvarları dik, Height ile zemini ızgaranın üstüne getirin.
2. **Başlangıç noktası.** Ziyaretçinin başlayacağı yere yürüyüp "Set start here".
3. **Pencereyi yerleştir.**
   - Banttaki X'in üstüne yürüyün.
   - Objektifin baktığı yöne dönün.
   - **Move here** deyin.
4. **Kontrol et.** **Overlay video 50%** videoyu modelin üstüne yarı saydam bindirir. Videodaki nesne modeldekiyle örtüşene kadar Turn ±1° ile döndürün.
5. **Kaydet.** **Download config.json** ile dosyayı indirip `index.html`'in yanına koyun.

## 6. Başvuru için

- Quest'te VR'a girip pencereye yürüyen, kayda giren ve geri dönen 60–90 saniyelik bir ekran kaydı alın. Quest'in kendi kayıt özelliği tek gözü kaydeder; bu yeterli.
- Video bağlantısını "Proven previous experience" ve "Resources" bölümlerinde verin. GitHub Pages adresini de ekleyin.
- `?stats` ile Quest'te kare hızını görüp not edin (çağrı ≥72 fps istiyor).

## Sınırlar ve bilinenler

- Bu sürüm bir bulut ortamında, başsız (headless) bir tarayıcıda test edildi. Doğrulananlar:
  - splat yükleme,
  - kayda giriş ve çıkış,
  - VR180 küresinin yönü (sol yazı solda, sağ yazı sağda),
  - video–ses eşzamanı,
  - ambisonik sesin baş dönüşüyle doğru yöne döndüğü (çevrimdışı ses ölçümüyle).
- Quest 3 üzerinde henüz denenmedi: kontrolcüler, `local-floor`, stereo göz ayrımı ve performans cihazda kontrol edilmeli.
- Video, WebGL kürede gösteriliyor. Quest'te daha keskin görüntü için ileride WebXR Layers ile "equirect layer"a geçilebilir.
- Uygulama kodu MIT lisanslıdır (bkz. `LICENSE`).

## Üçüncü taraf yazılımlar

| Yazılım | Sürüm | Lisans |
|---|---|---|
| three.js | r180 | MIT |
| Spark | 2.3.1 | MIT |
| Omnitone | 2.0.0 | Apache-2.0 |

Lisans metinleri `vendor/` altında.
