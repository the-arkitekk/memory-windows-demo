import * as THREE from "three";

// A text label drawn on a canvas and shown on a plane in 3D (used in VR and for hotspot labels).
export class TextPanel {
  constructor({ width = 0.8, px = [1024, 300] } = {}) {
    this.canvas = document.createElement("canvas");
    [this.canvas.width, this.canvas.height] = px;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const height = (width * px[1]) / px[0];
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.renderOrder = 40;
    this.key = "";
  }

  draw({ kicker = "", title = "", sub = "", hint = "", accent = "#f0b84a" }) {
    const key = [kicker, title, sub, hint, accent].join("|");
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const r = 34;
    ctx.fillStyle = "rgba(14,16,22,0.86)";
    roundRect(ctx, 6, 6, W - 12, H - 12, r);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, 6, 6, 14, H - 12, 7);
    ctx.fill();
    const x = 54;
    let y = 30;
    ctx.textBaseline = "top";
    if (kicker) {
      ctx.font = "600 34px system-ui, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = accent;
      ctx.fillText(kicker.toUpperCase(), x, y, W - x - 30);
      y += 48;
    }
    if (title) {
      ctx.font = "700 62px system-ui, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#f5f2ea";
      ctx.fillText(title, x, y, W - x - 30);
      y += 76;
    }
    if (sub) {
      ctx.font = "400 36px system-ui, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#b9bcc6";
      ctx.fillText(sub, x, y, W - x - 30);
      y += 50;
    }
    if (hint) {
      ctx.font = "600 36px system-ui, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = accent;
      ctx.fillText(hint, x, y, W - x - 30);
    }
    this.texture.needsUpdate = true;
  }

  set opacity(v) {
    this.material.opacity = v;
    this.mesh.visible = v > 0.01;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fade to black: a small sphere around the head, drawn last.
export class Fader {
  constructor(camera) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.anim = null;
  }

  to(opacity, ms = 350) {
    const from = this.mesh.material.opacity;
    return new Promise((resolve) => {
      this.anim?.resolve();
      this.anim = { from, to: opacity, t0: performance.now(), ms, resolve };
      this.mesh.visible = true;
    });
  }

  update(now) {
    const a = this.anim;
    if (!a) return;
    const k = Math.min(1, (now - a.t0) / a.ms);
    const e = k * k * (3 - 2 * k);
    this.mesh.material.opacity = a.from + (a.to - a.from) * e;
    if (k >= 1) {
      this.anim = null;
      this.mesh.visible = a.to > 0.001;
      a.resolve();
    }
  }
}

// Head-locked message in VR that shows for a few seconds and fades.
export class Hud {
  constructor(camera) {
    this.panel = new TextPanel({ width: 0.62, px: [1024, 300] });
    this.panel.mesh.position.set(0, -0.26, -0.95);
    this.panel.mesh.rotation.x = -0.18;
    this.panel.mesh.renderOrder = 900;
    this.panel.opacity = 0;
    camera.add(this.panel.mesh);
    this.until = 0;
  }

  show(content, seconds = 4) {
    this.panel.draw(content);
    this.until = performance.now() + seconds * 1000;
  }

  hide() {
    this.until = 0;
  }

  update(now) {
    const left = this.until - now;
    this.panel.opacity = left <= 0 ? 0 : Math.min(1, left / 600);
  }
}
