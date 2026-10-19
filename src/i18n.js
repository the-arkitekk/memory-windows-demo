// UI strings. Language: ?lang=tr|en, then the last choice, then the browser language.
const STRINGS = {
  en: {
    chooseTitle: "Choose how to see the room",
    chooseSplat: "Gaussian splat",
    chooseSplatSub: "Photoreal, finer detail. Heavier on the headset.",
    chooseMesh: "Textured mesh",
    chooseMeshSub: "Smoother and lighter. Less detail on shiny surfaces.",
    loadingModel: "Loading the 3D model",
    preparingModel: "Preparing the model for this device",
    modeModel: "MODEL",
    modeModelSub: "Gaussian-splat reconstruction",
    modeRecord: "RECORD",
    modeRecordSub: "VR180 video and ambisonic sound, filmed on site",
    helpModel: "Walk: W A S D or arrows · Look: drag · Step into a record: click the marker, or press Enter beside it · Jump to a record: 1–9",
    helpRecord: "Look around: drag · Back to the model: Esc",
    enterVR: "Enter VR",
    exitVR: "Exit VR",
    back: "✕ Exit video",
    exitHintVR: "Trigger or B/Y: exit video",
    headphones: "Use headphones: the sound is spatial and turns with your head.",
    hintFar: "Point and pull the trigger",
    hintNear: "Step back, point at the lens and pull the trigger",
    hintFarDesktop: "Click to step in",
    hintNearDesktop: "Press Enter to step in",
    opening: "Opening the record…",
    videoError: "This browser could not play the video.",
    loadError: "The model could not be loaded:",
    recorded: "Recorded",
    by: "by",
    language: "TR",
    edit: "Edit",
    exitEdit: "Exit edit",
    menu: "← Main menu",
    offlineSaving: "Saving for offline use…",
    offlineReady: "✓ Ready to work offline",
    offlinePartial: "Offline copy incomplete",
    gyroOn: "Looking by device motion. Tap to look by touch.",
    gyroOff: "Looking by touch. Tap to look by moving your device.",
    gyroDenied: "Motion sensors are blocked. Allow motion access for this site in the browser settings.",
  },
  tr: {
    chooseTitle: "Odayı nasıl görmek istersiniz?",
    chooseSplat: "Gaussian splat",
    chooseSplatSub: "Fotogerçekçi, ince detaylı. Başlıkta daha ağır.",
    chooseMesh: "Dokulu mesh",
    chooseMeshSub: "Daha akıcı ve hafif. Parlak yüzeylerde daha az detay.",
    loadingModel: "3B model yükleniyor",
    preparingModel: "Model bu cihaz için hazırlanıyor",
    modeModel: "MODEL",
    modeModelSub: "Gaussian splat ile yeniden kurulum",
    modeRecord: "KAYIT",
    modeRecordSub: "Yerinde çekilmiş VR180 video ve ambisonik ses",
    helpModel: "Yürü: W A S D veya oklar · Bak: sürükle · Kayda gir: işarete tıkla ya da yanındayken Enter · Kayda atla: 1–9",
    helpRecord: "Etrafına bak: sürükle · Modele dön: Esc",
    enterVR: "VR'a gir",
    exitVR: "VR'dan çık",
    back: "✕ Videodan çık",
    exitHintVR: "Tetik ya da B/Y: videodan çık",
    headphones: "Kulaklık kullanın: ses mekânsaldır ve başınızla birlikte döner.",
    hintFar: "İşaretle ve tetiği çek",
    hintNear: "Geri çekil, merceğe nişan al ve tetiği çek",
    hintFarDesktop: "Kayda girmek için tıkla",
    hintNearDesktop: "Kayda girmek için Enter",
    opening: "Kayıt açılıyor…",
    videoError: "Bu tarayıcı videoyu oynatamadı.",
    loadError: "Model yüklenemedi:",
    recorded: "Kayıt",
    by: "·",
    language: "EN",
    edit: "Düzenle",
    exitEdit: "Düzenlemeden çık",
    menu: "← Ana menü",
    offlineSaving: "Çevrimdışı kullanım için kaydediliyor…",
    offlineReady: "✓ Çevrimdışı çalışmaya hazır",
    offlinePartial: "Çevrimdışı kopya eksik",
    gyroOn: "Cihazı hareket ettirerek bakıyorsunuz. Dokunarak bakmak için basın.",
    gyroOff: "Dokunarak bakıyorsunuz. Cihazı çevirerek bakmak için basın.",
    gyroDenied: "Hareket sensörleri engelli. Tarayıcı ayarlarından bu site için hareket erişimine izin verin.",
  },
};

function detect() {
  const p = new URLSearchParams(location.search).get("lang");
  if (p === "tr" || p === "en") return p;
  try {
    const saved = localStorage.getItem("mw-lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
}

export let LANG = detect();
export const t = (key) => STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
// Pick a localized field: either a plain string or { en, tr }.
export const L = (v) => (v == null ? "" : typeof v === "string" ? v : v[LANG] ?? v.en ?? Object.values(v)[0]);

export function setLang(lang) {
  LANG = lang;
  try {
    localStorage.setItem("mw-lang", lang);
  } catch {}
}
