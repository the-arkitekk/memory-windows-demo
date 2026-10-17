// Memory Windows — WebXR demo
// Walk through a Gaussian-splat model; at a marked spot, step into a VR180 recording with
// ambisonic sound made at that same spot; step back out into the model.
import * as THREE from "three";
import { SparkRenderer, SplatMesh, SparkControls } from "@sparkjsdev/spark";
import { t, L, LANG, setLang } from "./src/i18n.js";
import { HotspotView } from "./src/hotspots.js";
import { WindowPlayer, AudioEngine, pickVideo } from "./src/player.js";
import { Fader, Hud } from "./src/text.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const NEAR_DISTANCE = 1.3; // metres from the ring at which "step in" is offered
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");

// ?debug: on-screen log for devices without a console (iPad)
if (params.has("debug")) {
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;left:8px;right:8px;top:8px;max-height:45vh;overflow:auto;z-index:99;margin:0;padding:8px;font:11px/1.35 ui-monospace,monospace;color:#9f9;background:rgba(0,0,0,.82);white-space:pre-wrap;pointer-events:none";
  document.body.appendChild(box);
  const logTo = params.get("logto"); // ?logto=http://localhost:3001/ also POSTs every line (for desktop tests)
  window.mwDebug = (m) => {
    const line = `${(performance.now() / 1000).toFixed(1)}s ${m}`;
    box.textContent += line + "\n";
    box.scrollTop = box.scrollHeight;
    if (logTo) fetch(logTo, { method: "POST", body: line, mode: "no-cors" }).catch(() => {});
  };
  window.addEventListener("error", (e) => window.mwDebug(`ERR ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => window.mwDebug(`REJECT ${e.reason?.message ?? e.reason}`));
  const vt = document.createElement("video");
  window.mwDebug(`UA ${navigator.userAgent.slice(0, 90)}`);
  window.mwDebug(`canPlay mp4=${vt.canPlayType("video/mp4")} h264-5.1=${vt.canPlayType('video/mp4; codecs="avc1.640033"')} 5.2=${vt.canPlayType('video/mp4; codecs="avc1.640034"')} hvc1=${vt.canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"')}`);
}
const dbg = (m) => window.mwDebug?.(m);

// ---------------------------------------------------------------- config
let currentConfigFile = "config.json";
let chosenModel = params.get("model"); // remembered for the Edit button only, so a reload shows the chooser again
const MODEL_CONFIGS = { splat: "config-splat.json", mesh: "config-mesh.json" };
// Without ?config= or ?model=, ask once which model to show (splat or textured mesh).
async function chooseConfig() {
  if (params.get("config")) return params.get("config");
  const m = params.get("model");
  if (MODEL_CONFIGS[m]) return MODEL_CONFIGS[m];
  if (params.has("edit")) return "config.json";
  const box = $("chooser");
  const loading = $("loading");
  loading.classList.add("choosing");
  box.hidden = false;
  const lang = $("loadLang");
  const render = () => {
    lang.textContent = t("language");
    box.innerHTML = `<h2>${t("chooseTitle")}</h2>` + ["splat", "mesh"].map(
      (k) => `<button data-k="${k}"><b>${t(k === "splat" ? "chooseSplat" : "chooseMesh")}</b><span>${t(k === "splat" ? "chooseSplatSub" : "chooseMeshSub")}</span></button>`,
    ).join("");
  };
  lang.hidden = false;
  lang.onclick = () => {
    setLang(LANG === "tr" ? "en" : "tr");
    document.documentElement.lang = LANG;
    render();
  };
  render();
  const k = await new Promise((resolve) => box.addEventListener("click", (e) => e.target.closest("button") && resolve(e.target.closest("button").dataset.k)));
  lang.hidden = true;
  box.hidden = true;
  loading.classList.remove("choosing");
  chosenModel = k;
  return MODEL_CONFIGS[k];
}

let config;
try {
  currentConfigFile = await chooseConfig();
  const res = await fetch(currentConfigFile, { cache: "no-cache" });
  config = await res.json();
} catch (err) {
  fatal(`config.json: ${err.message}`);
  throw err;
}
config.floorY ??= 0;
config.eyeHeight ??= 1.6;
config.hotspots ??= [];
config.splat ??= {};
config.start ??= { position: [0, 0, 0], yawDeg: 0 };

// ---------------------------------------------------------------- renderer, scene, rig
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
$("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080b);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 200);
camera.layers.enable(1); // on a flat screen, show the left eye of stereo videos
const rig = new THREE.Group(); // moved by walking; in VR the headset moves the camera inside it
rig.add(camera);
scene.add(rig);

const spark = new SparkRenderer({ renderer, maxStdDev: Math.sqrt(5) });
scene.add(spark);

// The scanned site: the splat lives in this group so it can be aligned (rotated, levelled, scaled).
const site = new THREE.Group();
scene.add(site);
function applySite() {
  const s = config.splat;
  site.position.fromArray(s.position ?? [0, 0, 0]);
  const r = s.rotationDeg ?? [0, 0, 0];
  site.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, "YXZ"); // yaw is applied last, around world up
  site.scale.setScalar(s.scale ?? 1);
  site.updateMatrixWorld(true);
}
applySite();

const grid = new THREE.GridHelper(20, 40, 0x6c7080, 0x2c303a);
grid.material.transparent = true;
grid.material.opacity = 0.6;
grid.visible = false;
scene.add(grid);

const fader = new Fader(camera);
const hud = new Hud(camera);
const audio = new AudioEngine();
// iOS only starts audio from a tap (click / touchend): unlock it with the very first one.
{
  const unlock = () => {
    // iOS: Web Audio follows the silent switch unless the page declares itself as media playback
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
    window.removeEventListener("click", unlock, true);
    window.removeEventListener("touchend", unlock, true);
    audio.ensure();
  };
  window.addEventListener("click", unlock, true);
  window.addEventListener("touchend", unlock, true);
}
const player = new WindowPlayer({ scene, audio });

// ---------------------------------------------------------------- splat
setLoading(0, t("loadingModel"));
// Phones and tablets (not the Quest) get the lighter copy of the model: iOS Safari ran out of GPU
// memory with the full one. ?full / ?mobile force either way.
const isTouchDevice = (navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches) && !/OculusBrowser|Quest/i.test(navigator.userAgent);
const modelUrlFor = (cfg) =>
  cfg.splat?.mobileUrl && (params.has("mobile") || (isTouchDevice && !params.has("full"))) ? cfg.splat.mobileUrl : cfg.splat?.url;
const modelUrl = modelUrlFor(config);
dbg(`model ${modelUrl}`);
const isMesh = /\.(glb|gltf)(\?|$)/i.test(modelUrl);
let splat;
if (isMesh) {
  // Textured-mesh alternative to a splat (baked scan textures, drawn unlit).
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  splat = new THREE.Group();
  splat.initialized = new Promise((resolve, reject) =>
    new GLTFLoader().load(
      modelUrl,
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material;
          o.material = new THREE.MeshBasicMaterial({ map: m.map, color: m.map ? 0xffffff : m.color, vertexColors: !!o.geometry.attributes.color, side: THREE.DoubleSide });
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        });
        splat.add(gltf.scene);
        resolve();
      },
      (e) => setLoading(Math.min(0.95, e.loaded / (e.lengthComputable ? e.total : 14e6)), t("loadingModel")),
      reject,
    ),
  );
} else {
  splat = new SplatMesh({
    url: modelUrl,
    lod: config.splat.lod ?? true,
    onProgress: (e) => e.lengthComputable && setLoading(e.loaded / e.total, t("loadingModel")),
  });
}
site.add(splat);
splat.initialized
  .then(() => {
    setLoading(1, t("preparingModel"));
    setTimeout(() => $("loading").classList.add("done"), 400);
    setTimeout(() => (swControlled() ? precacheForOffline() : views.forEach((v) => player.prefetchAudio(v.data))), 1500);
    if (params.has("autoenter")) setTimeout(() => enter(views[0]), 2500); // test hook
  })
  .catch((err) => fatal(`${t("loadError")} ${config.splat.url} — ${err.message ?? err}`));

// ---------------------------------------------------------------- offline cache (service worker)
// The service worker keeps the app and its media on the device, so that a demo does not depend on the
// network: opened once (model, sound and video are fetched in that order), it then works offline.
const swSupported = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
const swControlled = () => !!navigator.serviceWorker?.controller;
if (swSupported && !params.has("edit") && !params.has("nosw")) {
  navigator.serviceWorker.register("sw.js").catch((err) => dbg(`sw failed: ${err.message}`));
  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data;
    if (m?.type !== "precache") return;
    const chip = $("offline");
    if (m.error) dbg(`precache ${m.error}`);
    if (m.finished) {
      chip.hidden = false;
      chip.classList.toggle("ready", !m.failed);
      chip.textContent = m.failed ? t("offlinePartial") : t("offlineReady");
      dbg(`precache finished ${m.done}/${m.total} failed=${m.failed}`);
    } else {
      chip.hidden = false;
      chip.classList.remove("ready");
      chip.textContent = `${t("offlineSaving")} ${Math.round(((m.done + (m.fraction ?? 0)) / m.total) * 100)}%`;
    }
  });
}
async function precacheForOffline() {
  const nav = navigator.connection;
  if (!swSupported || params.has("nosw") || nav?.saveData || /^(slow-2g|2g|3g)$/.test(nav?.effectiveType ?? "")) return;
  try {
    // current model first, then its sound and video, then the other model
    const cfgs = [config];
    for (const file of Object.values(MODEL_CONFIGS)) {
      if (file === currentConfigFile) continue;
      try { cfgs.push(await (await fetch(file)).json()); } catch {}
    }
    const urls = [];
    for (const c of cfgs) {
      urls.push(modelUrlFor(c));
      for (const h of c.hotspots ?? []) {
        if (h.audio?.src) urls.push(h.audio.src);
        if (h.video) urls.push(pickVideo(h.video)[0].src);
      }
    }
    const list = [...new Set(urls.filter(Boolean))];
    const reg = await navigator.serviceWorker.ready;
    reg.active.postMessage({ type: "precache", urls: list });
    dbg(`precache ${list.length} files`);
  } catch (err) {
    dbg(`precache failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------- hotspots ("memory windows")
let views = [];
function hotspotWorld(h) {
  const position = new THREE.Vector3().fromArray(h.position ?? [0, 0, 0]);
  site.localToWorld(position);
  const yl = (h.yawDeg ?? 0) * DEG;
  const f = new THREE.Vector3(-Math.sin(yl), 0, -Math.cos(yl)).applyQuaternion(site.quaternion);
  return { position, yaw: Math.atan2(-f.x, -f.z) };
}
function buildHotspots() {
  for (const v of views) {
    scene.remove(v.group);
    v.dispose();
  }
  views = config.hotspots.map((h) => {
    const v = new HotspotView(h);
    scene.add(v.group);
    return v;
  });
  placeHotspots();
}
function placeHotspots() {
  site.updateMatrixWorld(true);
  for (const v of views) {
    v.world = hotspotWorld(v.data);
    v.setPose(v.world.position, v.world.yaw);
  }
}
buildHotspots();

// ---------------------------------------------------------------- start pose
function goToStart() {
  const s = config.start;
  const p = new THREE.Vector3().fromArray(s.position ?? [0, 0, 0]);
  rig.position.set(p.x, config.floorY + (renderer.xr.isPresenting ? 0 : config.eyeHeight), p.z);
  rig.rotation.set(0, (s.yawDeg ?? 0) * DEG, 0);
}
goToStart();

// ---------------------------------------------------------------- state
let mode = "model"; // "model" | "transition" | "record"
let current = null; // HotspotView being played
let overlay = false; // editor: video drawn over the model to check alignment

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  updateTexts();
  if (m === "model") hud.show({ kicker: t("modeModel"), title: L(config.title), sub: t("modeModelSub") }, 4);
  if (m === "record" && current) {
    const h = current.data;
    hud.show({ kicker: t("modeRecord"), title: L(h.title), sub: recordLine(h), hint: t("headphones") }, 5);
  }
}

function recordLine(h) {
  return [L(h.layer), h.recordedAt, h.author].filter(Boolean).join(" · ");
}

async function enter(view, { asOverlay = false } = {}) {
  if (mode !== "model" || !view) return;
  audio.ensure(); // inside the user gesture
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  dbg(`enter ${view.data.id} audioSession=${navigator.audioSession?.type ?? "n/a"}`);
  mode = "transition";
  const w = view.world;
  if (!asOverlay) await fader.to(1, 300);
  busy(true);
  try {
    if (renderer.xr.isPresenting) {
      // Put the head where the camera stood; turn only if the viewer faces far away from it.
      camera.getWorldPosition(_v);
      rig.position.x += w.position.x - _v.x;
      rig.position.z += w.position.z - _v.z;
      const d = wrapAngle(w.yaw - headYaw());
      if (Math.abs(d) > 60 * DEG) rotateRigAroundHead(d);
    } else {
      rig.position.set(w.position.x, config.floorY + config.eyeHeight, w.position.z);
      rig.rotation.set(0, w.yaw, 0);
    }
    current = view;
    await player.open(view.data);
    overlay = asOverlay;
    player.setOpacity(asOverlay ? 0.5 : 1);
    if (!asOverlay) setModelVisible(false);
    await player.play();
    setMode("record");
  } catch (err) {
    console.error(err);
    dbg(`enter failed: ${err.message}`);
    toast(`${t("videoError")} (${err.message})`);
    player.close();
    current = null;
    overlay = false;
    setModelVisible(true);
    mode = "model";
  }
  busy(false);
  await fader.to(0, 450);
}

async function exit() {
  if (mode !== "record") return;
  mode = "transition";
  if (!overlay) await fader.to(1, 280);
  player.close();
  current = null;
  overlay = false;
  setModelVisible(true);
  setMode("model");
  await fader.to(0, 450);
}
player.onEnded = () => exit();

function setModelVisible(on) {
  splat.visible = on;
  spark.visible = on; // no splat sorting or drawing while a record plays
  for (const v of views) v.group.visible = on;
}

// ---------------------------------------------------------------- desktop controls
const controls = new SparkControls({ canvas: renderer.domElement });
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
controls.fpsMovement.keycodeMoveMapping = {
  KeyW: V3(0, 0, -1), KeyS: V3(0, 0, 1), KeyA: V3(-1, 0, 0), KeyD: V3(1, 0, 0),
  ArrowUp: V3(0, 0, -1), ArrowDown: V3(0, 0, 1), ArrowLeft: V3(-1, 0, 0), ArrowRight: V3(1, 0, 0),
};
controls.fpsMovement.keycodeRotateMapping = {};
controls.pointerControls.pointerRollScale = 0;

function updateDesktop(dt = 0.016) {
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  controls.fpsMovement.enable = !typing;
  _v.copy(rig.position);
  controls.update(rig);
  if (mode !== "model") rig.position.copy(_v); // in a record you can only look around
  else {
    if (stick.active) walkWithStick(dt);
    rig.position.y = config.floorY + config.eyeHeight;
  }
  if (gyro.on && gyro.has) applyGyro();
  else {
    _e.setFromQuaternion(rig.quaternion, "YXZ");
    _e.z = 0;
    _e.x = THREE.MathUtils.clamp(_e.x, -1.35, 1.35);
    rig.quaternion.setFromEuler(_e);
  }
}

// ---------------------------------------------------------------- gyro look (phones, tablets)
if (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || params.has("gyro")) document.body.classList.add("touch");
const gyro = {
  supported: (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || params.has("gyro")) && "DeviceOrientationEvent" in window && !params.has("edit"), // ?gyro forces it for testing
  on: false, has: false, resync: true, offset: 0,
  dev: new THREE.Quaternion(), written: new THREE.Quaternion(),
};
const _ge = new THREE.Euler();
const _gq1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _gq2 = new THREE.Quaternion();
const _zee = new THREE.Vector3(0, 0, 1);
window.addEventListener("deviceorientation", (e) => {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  gyro.has = true;
  const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * DEG;
  _ge.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, "YXZ");
  gyro.dev.setFromEuler(_ge).multiply(_gq1).multiply(_gq2.setFromAxisAngle(_zee, -screenAngle));
});
// Device orientation sets heading and pitch only (the horizon stays level, whatever the screen
// rotation). Whatever else turns the rig (a drag, a snap turn, a jump to a record) is picked up
// as a new heading, so the device is always "forward" relative to that.
const _gf = new THREE.Vector3();
function applyGyro() {
  _gf.set(0, 0, -1).applyQuaternion(gyro.dev);
  const devYaw = Math.atan2(-_gf.x, -_gf.z);
  const pitch = Math.asin(THREE.MathUtils.clamp(_gf.y, -1, 1));
  if (gyro.resync || gyro.written.angleTo(rig.quaternion) > 1e-4) {
    _ge.setFromQuaternion(rig.quaternion, "YXZ");
    gyro.offset = _ge.y - devYaw;
    gyro.resync = false;
  }
  rig.quaternion.setFromEuler(_ge.set(pitch, devYaw + gyro.offset, 0, "YXZ"));
  gyro.written.copy(rig.quaternion);
}
const gyroBtn = $("gyroBtn");
function gyroUi() {
  gyroBtn.hidden = !gyro.supported;
  document.body.classList.toggle("has-gyro", gyro.supported);
  gyroBtn.setAttribute("aria-pressed", String(gyro.on));
  gyroBtn.title = gyroBtn.ariaLabel = t(gyro.on ? "gyroOn" : "gyroOff");
}
async function setGyro(on) {
  if (!gyro.supported) return;
  if (on && typeof DeviceOrientationEvent.requestPermission === "function") {
    // iOS: must be asked from a tap
    try {
      if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
    } catch {
      toast(t("gyroDenied"));
      on = false;
    }
  }
  gyro.on = on;
  gyro.resync = true;
  gyroUi();
  if (on) {
    setTimeout(() => {
      if (!gyro.has) { // no sensor data (e.g. a touch laptop): fall back to touch look
        gyro.on = gyro.supported = false;
        gyroUi();
      }
    }, 2000);
  }
}
gyroBtn.addEventListener("click", () => setGyro(!gyro.on));
{
  // Starts with touch look; the icon button switches to gyro on demand (iOS asks for motion access then).
  gyroUi();
}

// ---------------------------------------------------------------- on-screen walking stick (touch)
const stick = { active: false, x: 0, y: 0, id: null };
const stickEl = $("stick");
function stickMove(e) {
  const r = stickEl.getBoundingClientRect();
  const R = r.width / 2;
  let dx = e.clientX - (r.left + R);
  let dy = e.clientY - (r.top + R);
  const len = Math.hypot(dx, dy);
  if (len > R) [dx, dy] = [(dx / len) * R, (dy / len) * R];
  stick.x = dx / R;
  stick.y = dy / R;
  stickEl.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
}
stickEl.addEventListener("pointerdown", (e) => {
  stick.id = e.pointerId;
  stick.active = true;
  stickEl.setPointerCapture(e.pointerId);
  audio.ensure();
  stickMove(e);
});
stickEl.addEventListener("pointermove", (e) => e.pointerId === stick.id && stickMove(e));
const stickEnd = (e) => {
  if (e.pointerId !== stick.id) return;
  stick.active = false;
  stick.x = stick.y = 0;
  stick.id = null;
  stickEl.firstElementChild.style.transform = "";
};
stickEl.addEventListener("pointerup", stickEnd);
stickEl.addEventListener("pointercancel", stickEnd);
function walkWithStick(dt) {
  // forward/back walks; left/right turns continuously, faster the further the knob is pushed
  const turn = Math.abs(stick.x) < 0.15 ? 0 : stick.x;
  if (turn) rotateRigAroundHead(-turn * 100 * DEG * dt);
  if (Math.abs(stick.y) < 0.15) return;
  camera.getWorldDirection(_v);
  _v.y = 0;
  _v.normalize();
  rig.position.addScaledVector(_v, -stick.y * 1.3 * dt);
}

const raycaster = new THREE.Raycaster();
const pointer = { ndc: new THREE.Vector2(), down: null, hover: null };
renderer.domElement.addEventListener("pointermove", (e) => {
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (audio.ctx && audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointer.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  audio.ensure();
});
renderer.domElement.addEventListener("pointerup", (e) => {
  const d = pointer.down;
  pointer.down = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 400) return;
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  updatePointerHover(); // a touch tap has no earlier hover
  dbg(`tap mode=${mode} hover=${pointer.hover?.data.id ?? "none"}`);
  if (mode === "model" && pointer.hover) enter(pointer.hover);
});
// Standing inside a hotspot's target volume never counts as pointing at it from outside.
function insideHotspot(v) {
  camera.getWorldPosition(_v);
  return Math.hypot(v.group.position.x - _v.x, v.group.position.z - _v.z) < 0.45;
}
function pickedHotspot() {
  const hit = raycaster.intersectObjects(views.map((v) => v.pick), false)[0];
  const v = hit?.object.userData.hotspot ?? null;
  return v && !insideHotspot(v) ? v : null;
}
function updatePointerHover() {
  pointer.hover = null;
  if (mode === "model" && !renderer.xr.isPresenting) {
    raycaster.setFromCamera(pointer.ndc, camera);
    pointer.hover = pickedHotspot();
  }
  renderer.domElement.style.cursor = pointer.hover ? "pointer" : "";
}

window.addEventListener("keydown", (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (e.key === "Escape") exit();
  if (e.key === "Enter" && mode === "model") enter(nearestView(NEAR_DISTANCE) ?? pointer.hover);
  const n = Number(e.key);
  if (mode === "model" && n >= 1 && n <= views.length) jumpTo(views[n - 1]);
});

function jumpTo(view) {
  const w = view.world;
  const back = new THREE.Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw)).multiplyScalar(1.8);
  rig.position.set(w.position.x + back.x, config.floorY + config.eyeHeight, w.position.z + back.z);
  rig.rotation.set(-0.12, w.yaw, 0, "YXZ");
}

// ---------------------------------------------------------------- VR
const xrBtn = $("xrBtn");
if (navigator.xr) {
  navigator.xr
    .isSessionSupported("immersive-vr")
    .then((ok) => ok && (xrBtn.hidden = false))
    .catch(() => {});
}
xrBtn.addEventListener("click", async () => {
  audio.ensure();
  if (renderer.xr.isPresenting) return renderer.xr.getSession().end();
  try {
    const session = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["hand-tracking"],
    });
    await renderer.xr.setSession(session);
  } catch (err) {
    toast(`VR: ${err.message}`);
  }
});
renderer.xr.addEventListener("sessionstart", () => {
  _e.setFromQuaternion(rig.quaternion, "YXZ");
  rig.rotation.set(0, _e.y, 0);
  rig.position.y = config.floorY;
  document.body.classList.add("in-xr");
  updateTexts();
  setMode(mode === "record" ? "record" : "model");
});
renderer.xr.addEventListener("sessionend", () => {
  rig.position.y = config.floorY + config.eyeHeight;
  camera.position.set(0, 0, 0);
  camera.quaternion.identity();
  document.body.classList.remove("in-xr");
  updateTexts();
});

const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }),
  );
  line.renderOrder = 60;
  line.scale.z = 3;
  c.add(line);
  c.userData = { line, hover: null, handedness: null };
  c.addEventListener("connected", (e) => (c.userData.handedness = e.data.handedness));
  c.addEventListener("disconnected", () => (c.userData.handedness = null));
  c.addEventListener("select", () => {
    if (mode === "model") enter(c.userData.hover);
    else if (mode === "record") exit();
  });
  rig.add(c);
  return c;
});

function updateControllerHover() {
  for (const c of controllers) {
    c.userData.hover = null;
    c.userData.line.visible = mode === "model";
    if (mode !== "model") continue;
    raycaster.setFromXRController(c);
    const hit = raycaster.intersectObjects(views.map((v) => v.pick), false)[0];
    c.userData.hover = hit && !insideHotspot(hit.object.userData.hotspot) ? hit.object.userData.hotspot : null;
    c.userData.line.scale.z = hit ? hit.distance : 3;
    c.userData.line.material.color.set(hit ? 0xf0b84a : 0xffffff);
  }
}

const xrInput = { snapLatch: false, exitLatch: false };
function updateXrLocomotion(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  let exitPressed = false;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const x = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] ?? 0;
    const y = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] ?? 0;
    if (gp.buttons[5]?.pressed) exitPressed = true; // B / Y
    if (mode !== "model") continue;
    // Both sticks: forward/back walks, left/right snap-turns by 15 degrees.
    if (Math.abs(y) > 0.15) {
      camera.getWorldDirection(_v);
      _v.y = 0;
      _v.normalize();
      rig.position.addScaledVector(_v, -y * 1.3 * dt);
    }
    const latch = src.handedness === "left" ? "snapLatchL" : "snapLatch";
    if (!xrInput[latch] && Math.abs(x) > 0.65) {
      rotateRigAroundHead(-Math.sign(x) * 15 * DEG);
      xrInput[latch] = true;
    } else if (Math.abs(x) < 0.3) xrInput[latch] = false;
  }
  if (exitPressed && !xrInput.exitLatch && mode === "record") exit();
  xrInput.exitLatch = exitPressed;
}

function rotateRigAroundHead(angle) {
  camera.getWorldPosition(_w);
  _q.setFromAxisAngle(UP, angle);
  rig.position.sub(_w).applyQuaternion(_q).add(_w);
  rig.quaternion.premultiply(_q);
}

function headYaw() {
  camera.getWorldDirection(_v);
  return Math.atan2(-_v.x, -_v.z);
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function nearestView(maxDist) {
  camera.getWorldPosition(_v);
  let best = null;
  let bestD = maxDist;
  for (const v of views) {
    const d = Math.hypot(v.world.position.x - _v.x, v.world.position.z - _v.z);
    if (d < bestD) [best, bestD] = [v, d];
  }
  return best;
}

// ---------------------------------------------------------------- per-frame
const stats = params.has("stats") ? { frames: 0, t0: performance.now(), el: $("stats") } : null;
if (stats) stats.el.hidden = false;
let last = performance.now();
let dbgFrames = 0, dbgLast = performance.now(), dbgVf = 0, dbgVfEl = null;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  if (window.mwDebug) {
    dbgFrames++;
    const v = player.active?.v;
    if (v && v !== dbgVfEl && v.requestVideoFrameCallback) { // count real video frames presented
      dbgVfEl = v;
      dbgVf = 0;
      const tick = () => { dbgVf++; v.requestVideoFrameCallback(tick); };
      v.requestVideoFrameCallback(tick);
    }
    if (now - dbgLast > 2000) {
      window.mwDebug(`fps=${(dbgFrames / ((now - dbgLast) / 1000)).toFixed(1)} mode=${mode}${v ? ` ct=${v.currentTime.toFixed(2)} paused=${v.paused} rs=${v.readyState} vframes=${dbgVf} dec=${v.getVideoPlaybackQuality?.().totalVideoFrames}/drop${v.getVideoPlaybackQuality?.().droppedVideoFrames} buf=${v.buffered.length ? v.buffered.end(v.buffered.length - 1).toFixed(1) : 0} net=${v.networkState} snd=${player.active?.a ? player.active.a.currentTime.toFixed(2) + (player.active.a.playing ? ">" : "|") : "-"} resync=${player.active?.resyncs ?? 0}` : ""}`);
      dbgFrames = 0;
      dbgLast = now;
    }
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const xr = renderer.xr.isPresenting;
  if (xr) {
    updateXrLocomotion(dt);
    updateControllerHover();
  } else {
    updateDesktop(dt);
    updatePointerHover();
  }

  if (mode === "model") {
    camera.getWorldPosition(_v);
    const near = nearestView(NEAR_DISTANCE);
    for (const v of views) {
      const hovered = v === pointer.hover || controllers.some((c) => c.userData.hover === v);
      const state = hovered ? "hover" : v === near ? "near" : "idle";
      v.update(now, _v, state, labelFor(v, state, xr));
    }
  }
  if (current && (mode === "record" || mode === "transition")) player.update(camera, current.world.yaw, now);

  fader.update(now);
  hud.update(now);
  renderer.render(scene, camera);

  if (stats) {
    stats.frames++;
    if (now - stats.t0 > 1000) {
      const fps = Math.round((stats.frames * 1000) / (now - stats.t0));
      stats.el.textContent = `${fps} fps`;
      if (xr) hud.show({ kicker: "stats", title: `${fps} fps`, sub: mode }, 1.2);
      stats.frames = 0;
      stats.t0 = now;
    }
  }
});

function labelFor(v, state, xr) {
  const h = v.data;
  const hint =
    state === "near" ? t(xr ? "hintNear" : "hintNearDesktop") : state === "hover" ? t(xr ? "hintFar" : "hintFarDesktop") : "";
  return { kicker: `${t("modeRecord")} · VR180 · ambisonic`, title: L(h.title), sub: recordLine(h), hint };
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- page UI
function updateTexts() {
  $("siteTitle").textContent = L(config.title);
  const rec = mode === "record";
  $("modeKicker").textContent = rec ? t("modeRecord") : t("modeModel");
  $("modeSub").textContent = rec && current ? `${L(current.data.title)} · ${recordLine(current.data)}` : t("modeModelSub");
  $("help").textContent = rec ? t("helpRecord") : t("helpModel");
  $("backBtn").textContent = t("back");
  $("langBtn").textContent = t("language");
  gyroUi();
  $("menuBtn").textContent = t("menu");
  $("editBtn").textContent = t(params.has("edit") ? "exitEdit" : "edit");
  xrBtn.textContent = renderer.xr.isPresenting ? t("exitVR") : t("enterVR");
  $("phones").textContent = t("headphones");
  document.documentElement.lang = LANG;
}
$("backBtn").addEventListener("click", () => exit());
$("menuBtn").addEventListener("click", () => {
  const u = new URL(location.pathname, location.origin); // back to the start screen (model choice)
  if (params.get("lang")) u.searchParams.set("lang", params.get("lang"));
  location.href = u;
});
$("editBtn").addEventListener("click", () => {
  const u = new URL(location.href);
  if (params.has("edit")) u.searchParams.delete("edit");
  else u.searchParams.set("edit", "1");
  if (chosenModel && !u.searchParams.has("config")) u.searchParams.set("model", chosenModel);
  location.href = u; // the editor loads at start-up, so reload with/without ?edit
});
$("langBtn").addEventListener("click", () => {
  setLang(LANG === "tr" ? "en" : "tr");
  for (const v of views) v.label.key = "";
  updateTexts();
});
setMode("model");

function setLoading(fraction, message) {
  $("loadingBar").style.width = `${Math.round(fraction * 100)}%`;
  $("loadingMsg").textContent = message;
}

function busy(on) {
  document.body.classList.toggle("busy", on);
  $("busyMsg").textContent = t("opening");
  if (on && renderer.xr.isPresenting) hud.show({ kicker: "", title: t("opening") }, 30);
  if (!on && renderer.xr.isPresenting && mode !== "record") hud.hide();
}

let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 6000);
  if (renderer.xr.isPresenting) hud.show({ kicker: "!", title: msg.slice(0, 48) }, 6);
}

function fatal(msg) {
  const el = document.getElementById("loadingMsg");
  if (el) el.textContent = msg;
  document.getElementById("loading")?.classList.add("error");
}

// ---------------------------------------------------------------- editor (open with ?edit)
if (params.has("edit")) {
  const { initEditor } = await import("./src/editor.js");
  initEditor({
    THREE, config, site, splat, grid, rig, camera, player,
    applySite, buildHotspots, placeHotspots, hotspotWorld,
    getViews: () => views, getMode: () => mode, getCurrent: () => current,
    enter, exit, goToStart, toast,
  });
}

// For automated checks.
window.__mw = { THREE, scene, camera, rig, splat, config, get views() { return views; }, get mode() { return mode; }, enter, exit, audio, player, renderer };
