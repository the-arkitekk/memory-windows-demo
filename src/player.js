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
    const sources = vcfg.sources ?? [{ src: vcfg.src }];
    for (const s of sources) {
      const el = document.createElement("source");
      el.src = s.src;
      if (s.type) el.type = s.type;
      v.appendChild(el);
    }
    const separateAudio = !!acfg.src;
    const ambixInVideo = !separateAudio && acfg.format === "ambix";
    v.muted = separateAudio || acfg.format === "none";
    v.style.display = "none";
    document.body.appendChild(v);
    const active = { h, v, a: null, nodes: [], meshes: [] };
    this.active = active;

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
      let mediaEl = v;
      if (separateAudio) {
        const a = document.createElement("audio");
        a.crossOrigin = "anonymous";
        a.preload = "auto";
        a.src = acfg.src;
        a.style.display = "none";
        document.body.appendChild(a);
        active.a = a;
        mediaEl = a;
        await waitFor(a, "loadeddata", 30000);
      }
      const src = ctx.createMediaElementSource(mediaEl);
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
    for (const el of [act.v, act.a]) {
      if (!el) continue;
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
