import * as THREE from "three";
import Omnitone from "../vendor/omnitone/omnitone.min.esm.js";

// One AudioContext and one first-order ambisonic (FOA) binaural decoder for the whole page.
// Input format: AmbiX = ACN channel order (W, Y, Z, X) with SN3D normalisation.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.foa = null;
    this.ready = null;
  }

  // Must first be called from a user gesture (click, Enter VR, trigger).
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.foa = Omnitone.createFOARenderer(this.ctx);
      this.ready = this.foa.initialize().then(() => this.foa.output.connect(this.master));
    }
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    return this.ready;
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();

function waitFor(el, okEvent, ms) {
  return new Promise((resolve, reject) => {
    const done = (fn, arg) => {
      clearTimeout(timer);
      el.removeEventListener(okEvent, onOk);
      el.removeEventListener("error", onErr, true);
      fn(arg);
    };
    const onOk = () => done(resolve);
    // A failing <source> only matters if it was the last candidate.
    const onErr = (e) => {
      if (e.target !== el && e.target !== el.lastElementChild) return;
      done(reject, new Error(`media error (${el.currentSrc || el.src || "no playable source"})`));
    };
    const timer = setTimeout(() => done(reject, new Error("media load timeout")), ms);
    el.addEventListener(okEvent, onOk, { once: true });
    el.addEventListener("error", onErr, true); // capture: <source> errors do not bubble
    if (el.readyState >= 2 && okEvent === "loadeddata") done(resolve);
    else if (el.readyState >= 1 && okEvent === "loadedmetadata") done(resolve);
  });
}

// Builds the inside of a sphere (180° or 360°) showing one eye of an equirectangular video.
function eyeMesh(texture, eye, stereo, projection, radius = 20) {
  const full = Number(projection) === 360;
  const phiLength = full ? Math.PI * 2 : Math.PI;
  const phiStart = full ? Math.PI / 2 : Math.PI; // puts the image centre straight ahead (-Z)
  const geo = new THREE.SphereGeometry(radius, full ? 128 : 96, 64, phiStart, phiLength);
  geo.scale(-1, 1, 1); // view from inside, image left = viewer's left
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let v = uv.getY(i);
    if (stereo === "sbs") u = eye === "R" ? 0.5 + u * 0.5 : u * 0.5;
    else if (stereo === "tb") v = eye === "R" ? v * 0.5 : 0.5 + v * 0.5;
    uv.setXY(i, u, v);
  }
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 50;
  mesh.frustumCulled = false;
  if (stereo === "sbs" || stereo === "tb") mesh.layers.set(eye === "R" ? 2 : 1);
  return mesh;
}

// Plays one recorded "memory window": a VR180 (or 360) video around the head, with an
// optional separate ambisonic track decoded binaurally and rotated with the head.
// A decoded sound that offers the bits of the <audio> API the player uses (currentTime, play, pause).
class BufferTrack {
  constructor(ctx, buffer) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.out = ctx.createGain();
    this.offset = 0;
    this.t0 = 0;
    this.src = null;
  }
  get playing() {
    return !!this.src;
  }
  get currentTime() {
    return this.src ? this.offset + (this.ctx.currentTime - this.t0) : this.offset;
  }
  set currentTime(t) {
    const was = this.playing;
    this.#stop();
    this.offset = Math.max(0, t);
    if (was) this.#start();
  }
  play() {
    if (!this.src) this.#start();
    return Promise.resolve();
  }
  pause() {
    if (!this.src) return;
    this.offset = this.currentTime;
    this.#stop();
  }
  #start() {
    if (this.offset >= this.buffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.out);
    src.start(0, this.offset);
    this.t0 = this.ctx.currentTime;
    this.src = src;
  }
  #stop() {
    if (!this.src) return;
    try { this.src.stop(); } catch {}
    this.src.disconnect();
    this.src = null;
  }
  close() {
    this.#stop();
    this.out.disconnect();
  }
}

// Which file to play: "hq" (6K) on desktop, 4K on the Quest, and on phones and tablets the 2.9K
// 25 fps "lite" file: iOS Safari uploads each video frame to WebGL slowly, and 4K froze the page
// for a minute or more. ?q=6k|4k|mobile (4K at 25 fps)|lite overrides.
function pickVideo(vcfg) {
  const ua = navigator.userAgent;
  const quest = /OculusBrowser|Quest/i.test(ua);
  const touch = !quest && navigator.maxTouchPoints > 0;
  const q = new URLSearchParams(location.search).get("q");
  const pick = {
    "6k": vcfg.hq, "4k": vcfg.sources?.[0]?.src, mobile: vcfg.mobile, lite: vcfg.lite,
  }[q] ?? (quest ? null : touch ? vcfg.lite : vcfg.hq);
  return pick ? [{ src: pick }] : vcfg.sources ?? [{ src: vcfg.src }];
}

export class WindowPlayer {
  constructor({ scene, audio }) {
    this.audio = audio;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.active = null;
    this.onEnded = null;
    this.lastSync = 0;
  }

  async open(h) {
    this.close();
    const vcfg = h.video ?? {};
    const acfg = h.audio ?? {};
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "auto";
    v.loop = !!vcfg.loop;
    const sources = pickVideo(vcfg);
    for (const s of sources) {
      const el = document.createElement("source");
      el.src = s.src;
      if (s.type) el.type = s.type;
      v.appendChild(el);
    }
    const separateAudio = !!acfg.src;
    const ambixInVideo = !separateAudio && acfg.format === "ambix";
    v.muted = separateAudio || acfg.format === "none";
    // Not display:none: iOS Safari stops presenting frames of a video that is not rendered, so the
    // texture stayed black. Keep it in the layout, 2 px wide, practically invisible, behind the page.
    v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:1px;opacity:0.01;pointer-events:none;z-index:-1";
    document.body.appendChild(v);
    const active = { h, v, a: null, nodes: [], meshes: [] };
    this.active = active;

    // iOS Safari ignores preload and loads nothing until play(): start the muted video and pause
    // it again (muted + playsinline may autoplay), so that "loadeddata" fires.
    for (const ev of ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "stalled", "suspend", "error", "ended"])
      v.addEventListener(ev, () => window.mwDebug?.(`video ${ev} rs=${v.readyState} err=${v.error?.code ?? "-"} ${v.videoWidth}x${v.videoHeight}`), true);
    window.mwDebug?.(`open video ${sources[0]?.src} separateAudio=${separateAudio} muted=${v.muted}`);
    v.load();
    if (v.muted) v.play().then(() => v.pause()).catch(() => {});
    await waitFor(v, "loadeddata", 30000);

    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    active.tex = tex;
    const stereo = vcfg.stereo ?? "sbs";
    const eyes = stereo === "mono" ? ["L"] : ["L", "R"];
    for (const eye of eyes) {
      const m = eyeMesh(tex, eye, stereo, vcfg.projection ?? 180);
      active.meshes.push(m);
      this.group.add(m);
    }

    if (separateAudio || ambixInVideo) {
      await this.audio.ensure();
      const ctx = this.audio.ctx;
      let src;
      if (separateAudio) {
        // Decode the file and play it from the Web Audio graph. iOS only lets an <audio> element
        // start from a tap, and our start comes later (when the video begins), so it stayed silent.
        const res = await fetch(acfg.src);
        if (!res.ok) throw new Error(`audio ${res.status}`);
        const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        window.mwDebug?.(`audio decoded ${buffer.numberOfChannels}ch ${buffer.sampleRate}Hz ${buffer.duration.toFixed(1)}s ctx=${ctx.state}`);
        active.a = new BufferTrack(ctx, buffer);
        src = active.a.out;
      } else {
        src = ctx.createMediaElementSource(v);
      }
      const gain = ctx.createGain();
      gain.gain.value = acfg.gain ?? 1;
      src.connect(gain);
      if (acfg.format === "ambix") {
        this.audio.foa.setChannelMap(acfg.channelMap ?? [0, 1, 2, 3]);
        this.audio.foa.setRenderingMode("ambisonic");
        gain.connect(this.audio.foa.input);
      } else {
        gain.connect(this.audio.master);
      }
      active.nodes.push(src, gain);
    }

    v.addEventListener("ended", () => this.onEnded?.(h));
    v.addEventListener("waiting", () => active.a?.pause());
    v.addEventListener("playing", () => {
      if (!active.a) return;
      active.a.currentTime = v.currentTime;
      active.a.play().catch(() => {});
    });
    this.group.visible = true;
    return active;
  }

  async play() {
    const act = this.active;
    if (!act) return;
    act.v.currentTime = 0;
    if (act.a) act.a.currentTime = 0;
    if (this.audio.ctx && this.audio.ctx.state !== "running") await this.audio.ctx.resume().catch(() => {});
    await act.v.play();
  }

  setOpacity(o) {
    for (const m of this.active?.meshes ?? []) m.material.opacity = o;
  }

  // Keep the sphere centred on the head, oriented to the hotspot (world yaw), and rotate the
  // sound field by the head orientation relative to that same frame.
  update(camera, yaw, now) {
    const act = this.active;
    if (!act) return;
    camera.getWorldPosition(_v);
    this.group.position.copy(_v);
    this.group.rotation.set(0, yaw, 0);
    if (this.audio.foa && (act.a || act.h.audio?.format === "ambix")) {
      camera.getWorldQuaternion(_qa);
      _qb.copy(_qa).invert().multiply(this.group.quaternion); // field orientation in head space
      _m3.setFromMatrix4(_m4.makeRotationFromQuaternion(_qb));
      this.audio.foa.setRotationMatrix3(_m3.elements);
    }
    if (act.a && !act.v.paused && now - this.lastSync > 250) {
      this.lastSync = now;
      const drift = act.a.currentTime - act.v.currentTime;
      if (Math.abs(drift) > 0.06) act.a.currentTime = act.v.currentTime;
    }
  }

  close() {
    const act = this.active;
    if (!act) return;
    this.active = null;
    act.a?.close?.();
    for (const el of [act.v, act.a]) {
      if (!el || el instanceof BufferTrack) continue;
      el.pause();
      el.removeAttribute("src");
      el.querySelectorAll?.("source").forEach((s) => s.remove());
      el.load();
      el.remove();
    }
    for (const n of act.nodes) n.disconnect();
    for (const m of act.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    act.tex?.dispose();
    this.group.visible = false;
  }
}
