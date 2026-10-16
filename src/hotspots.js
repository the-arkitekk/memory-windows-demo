import * as THREE from "three";
import { TextPanel } from "./text.js";

const ACCENT = 0xf0b84a;

// A "memory window": a ring on the floor where the VR180 camera stood, an arrow for the
// direction it faced, a lens at camera height and a label. All of it is placed in world space.
export class HotspotView {
  constructor(data) {
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = `hotspot:${data.id}`;
    const lens = data.lensHeight ?? 1.5;
    const mat = (opacity, extra = {}) =>
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity, depthWrite: false, toneMapped: false, ...extra });

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 64).rotateX(-Math.PI / 2), mat(0.95, { side: THREE.DoubleSide }));
    this.ring.position.y = 0.015;
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 64).rotateX(-Math.PI / 2), mat(0.14, { side: THREE.DoubleSide }));
    this.disc.position.y = 0.012;

    const tri = new THREE.Shape([new THREE.Vector2(-0.1, 0.42), new THREE.Vector2(0.1, 0.42), new THREE.Vector2(0, 0.6)]);
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), mat(0.95, { side: THREE.DoubleSide }));
    this.arrow.position.y = 0.016;

    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, lens, 8, 1, true), mat(0.45));
    this.beam.position.y = lens / 2;

    this.lens = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 16), mat(0.22));
    this.lens.position.y = this.halo.position.y = lens;

    this.label = new TextPanel({ width: 0.78 });
    this.label.mesh.position.y = lens + 0.36;

    // Invisible, generous target for clicking / pointing.
    this.pick = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, lens + 0.7, 12), new THREE.MeshBasicMaterial({ visible: false }));
    this.pick.position.y = (lens + 0.7) / 2;
    this.pick.userData.hotspot = this;

    for (const m of [this.ring, this.disc, this.arrow, this.beam, this.lens, this.halo]) m.renderOrder = 30;
    this.group.add(this.disc, this.ring, this.arrow, this.beam, this.halo, this.lens, this.label.mesh, this.pick);
    this.state = "";
  }

  setPose(position, yaw) {
    this.group.position.copy(position);
    this.group.rotation.set(0, yaw, 0);
  }

  update(time, cameraWorld, state, text) {
    const pulse = 1 + 0.06 * Math.sin(time * 0.004);
    const active = state === "hover" || state === "near";
    this.ring.scale.setScalar(active ? 1.12 * pulse : pulse);
    this.halo.scale.setScalar(active ? 1.35 * pulse : pulse);
    this.halo.material.opacity = active ? 0.4 : 0.22;
    const p = new THREE.Vector3();
    this.label.mesh.getWorldPosition(p);
    this.label.mesh.lookAt(cameraWorld.x, p.y, cameraWorld.z);
    this.label.draw(text);
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
  }
}
