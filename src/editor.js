// Desktop editor (open the page with ?edit). Aligns the splat, places the memory windows
// where the VR180 tripod stood, checks the alignment by overlaying the video, and exports config.json.
export function initEditor(api) {
  const { THREE, config, site, grid, camera } = api;
  const DEG = Math.PI / 180;
  const panel = document.getElementById("editor");
  panel.hidden = false;
  document.body.classList.add("editing");
  grid.visible = true;
  grid.position.y = config.floorY;

  let selected = 0;
  const h = () => config.hotspots[selected];
  const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k === "class") e.className = v;
      else e.setAttribute(k, v);
    }
    for (const k of kids) e.append(k);
    return e;
  };
  const btn = (label, fn, cls = "") => el("button", { class: cls, on: { click: fn } }, label);
  const row = (label, ...kids) => el("div", { class: "row" }, el("span", { class: "lbl" }, label), ...kids);
  const readout = () => el("span", { class: "val" });

  // ---- 1. model alignment
  const s = config.splat;
  s.rotationDeg ??= [0, 0, 0];
  s.position ??= [0, 0, 0];
  s.scale ??= 1;
  const rotOut = readout();
  const posOut = readout();
  const sclOut = readout();
  const siteChanged = () => {
    s.rotationDeg = s.rotationDeg.map((a) => round(((a % 360) + 540) % 360 - 180, 2));
    api.applySite();
    api.placeHotspots();
    refresh();
  };
  const rot = (i, d) => () => ((s.rotationDeg[i] += d), siteChanged());
  const mov = (i, d) => () => ((s.position[i] = round(s.position[i] + d)), siteChanged());
  const scl = (f) => () => ((s.scale = round(s.scale * f, 4)), siteChanged());
  const gridToggle = el("input", { type: "checkbox", checked: "" });
  gridToggle.addEventListener("change", () => (grid.visible = gridToggle.checked));

  // ---- 3. hotspot fields
  const sel = el("select", { on: { change: () => ((selected = Number(sel.value)), refresh()) } });
  const fields = {};
  const field = (key, get, set) => {
    const input = el("input", { type: "text" });
    input.addEventListener("change", () => {
      set(input.value);
      api.buildHotspots();
      refresh();
    });
    fields[key] = { input, get };
    return input;
  };
  const loc = (obj, key, lang) => {
    if (typeof obj[key] !== "object" || obj[key] == null) obj[key] = { en: obj[key] ?? "", tr: obj[key] ?? "" };
    return obj[key][lang] ?? "";
  };
  const hpOut = readout();

  const placeHere = (hs) => {
    const p = new THREE.Vector3();
    camera.getWorldPosition(p);
    p.y = config.floorY;
    site.worldToLocal(p);
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    d.y = 0;
    d.normalize().applyQuaternion(site.quaternion.clone().invert());
    hs.position = [round(p.x), round(p.y), round(p.z)];
    hs.yawDeg = round(Math.atan2(-d.x, -d.z) / DEG, 1);
  };
  const hsYaw = (d) => () => {
    if (!h()) return;
    h().yawDeg = round((h().yawDeg ?? 0) + d, 1);
    api.placeHotspots();
    refresh();
  };
  const hsLens = (d) => () => {
    if (!h()) return;
    h().lensHeight = round((h().lensHeight ?? 1.5) + d, 2);
    if (api.getMode() === "model") api.buildHotspots();
    refresh();
  };
  const addHere = () => {
    const n = config.hotspots.length + 1;
    const hs = {
      id: `window-${n}`,
      title: { en: `Memory window ${n}`, tr: `Bellek penceresi ${n}` },
      layer: { en: "", tr: "" },
      recordedAt: new Date().toISOString().slice(0, 10),
      author: "",
      lensHeight: 1.5,
      video: { sources: [{ src: "media/your-vr180.mp4", type: "video/mp4" }], projection: 180, stereo: "sbs" },
      audio: { src: "media/your-ambix.wav", format: "ambix", channelMap: [0, 1, 2, 3], gain: 1 },
    };
    placeHere(hs);
    config.hotspots.push(hs);
    selected = config.hotspots.length - 1;
    api.buildHotspots();
    refresh();
  };
  const moveHere = () => {
    if (!h()) return;
    placeHere(h());
    api.placeHotspots();
    refresh();
  };
  const remove = () => {
    if (!h() || !confirm(`Delete "${h().id}"?`)) return;
    config.hotspots.splice(selected, 1);
    selected = Math.max(0, selected - 1);
    api.buildHotspots();
    refresh();
  };
  const overlayBtn = btn("Overlay video 50%", async () => {
    if (api.getMode() === "record") return api.exit();
    const view = api.getViews()[selected];
    if (view) await api.enter(view, { asOverlay: true });
  });
  const playBtn = btn("Play record", async () => {
    const view = api.getViews()[selected];
    if (view && api.getMode() === "model") await api.enter(view);
  });

  const setStart = () => {
    const p = new THREE.Vector3();
    camera.getWorldPosition(p);
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    config.start = { position: [round(p.x), config.floorY, round(p.z)], yawDeg: round(Math.atan2(-d.x, -d.z) / DEG, 1) };
    api.toast(`Start: ${config.start.position.join(", ")} · ${config.start.yawDeg}°`);
  };

  const json = () => JSON.stringify(config, null, 2);
  const download = () => {
    const a = el("a", { href: URL.createObjectURL(new Blob([json()], { type: "application/json" })), download: "config.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
      api.toast("config.json copied");
    } catch {
      download();
    }
  };

  panel.append(
    el("h2", {}, "Editor"),
    el("p", { class: "note" }, "Walk with W A S D, look by dragging. Changes stay in this tab until you download config.json and put it next to index.html."),
    el("h3", {}, "1 · Align the model"),
    el("p", { class: "note" }, "Make the floor of the scan sit on the grid and the walls stand upright."),
    row("Tilt X", btn("−90°", rot(0, -90)), btn("−5°", rot(0, -5)), btn("+5°", rot(0, 5)), btn("+90°", rot(0, 90))),
    row("Roll Z", btn("−90°", rot(2, -90)), btn("−5°", rot(2, -5)), btn("+5°", rot(2, 5)), btn("+90°", rot(2, 90))),
    row("Turn Y", btn("−15°", rot(1, -15)), btn("−1°", rot(1, -1)), btn("+1°", rot(1, 1)), btn("+15°", rot(1, 15))),
    row("Height", btn("−10 cm", mov(1, -0.1)), btn("−1 cm", mov(1, -0.01)), btn("+1 cm", mov(1, 0.01)), btn("+10 cm", mov(1, 0.1))),
    row("Scale", btn("−10%", scl(1 / 1.1)), btn("−1%", scl(1 / 1.01)), btn("+1%", scl(1.01)), btn("+10%", scl(1.1))),
    row("Now", rotOut, posOut, sclOut),
    row("Grid", gridToggle),
    el("h3", {}, "2 · Start point"),
    row("", btn("Set start here", setStart), btn("Go to start", () => api.goToStart())),
    el("h3", {}, "3 · Memory windows"),
    el("p", { class: "note" }, "Stand where the tripod stood, face where the lens faced, then press Move here. Check with the overlay and nudge the turn."),
    row("Window", sel, btn("+ Add here", addHere)),
    row("", btn("Move here", moveHere, "primary"), btn("Delete", remove)),
    row("Turn", btn("−5°", hsYaw(-5)), btn("−1°", hsYaw(-1)), btn("+1°", hsYaw(1)), btn("+5°", hsYaw(5))),
    row("Lens height", btn("−5 cm", hsLens(-0.05)), btn("+5 cm", hsLens(0.05)), hpOut),
    row("Check", overlayBtn, playBtn),
    row("id", field("id", () => h()?.id ?? "", (v) => (h().id = v))),
    row("Title EN", field("ten", () => (h() ? loc(h(), "title", "en") : ""), (v) => (loc(h(), "title", "en"), (h().title.en = v)))),
    row("Title TR", field("ttr", () => (h() ? loc(h(), "title", "tr") : ""), (v) => (loc(h(), "title", "tr"), (h().title.tr = v)))),
    row("Layer EN", field("len", () => (h() ? loc(h(), "layer", "en") : ""), (v) => (loc(h(), "layer", "en"), (h().layer.en = v)))),
    row("Layer TR", field("ltr", () => (h() ? loc(h(), "layer", "tr") : ""), (v) => (loc(h(), "layer", "tr"), (h().layer.tr = v)))),
    row("Date", field("date", () => h()?.recordedAt ?? "", (v) => (h().recordedAt = v))),
    row("Author", field("author", () => h()?.author ?? "", (v) => (h().author = v))),
    row("Video", field("video", () => h()?.video?.sources?.[0]?.src ?? "", (v) => {
      h().video ??= { projection: 180, stereo: "sbs" };
      h().video.sources = [{ src: v, type: v.endsWith(".webm") ? "video/webm" : "video/mp4" }];
    })),
    row("Audio", field("audio", () => h()?.audio?.src ?? "", (v) => {
      h().audio = v ? { ...(h().audio ?? { format: "ambix", channelMap: [0, 1, 2, 3], gain: 1 }), src: v } : { format: "none" };
    })),
    el("h3", {}, "4 · Save"),
    row("", btn("Download config.json", download, "primary"), btn("Copy", copy)),
  );

  function refresh() {
    sel.replaceChildren(...config.hotspots.map((hs, i) => el("option", { value: String(i) }, `${i + 1} · ${hs.id}`)));
    sel.value = String(selected);
    rotOut.textContent = `rot ${s.rotationDeg.join(" / ")}°`;
    posOut.textContent = `y ${s.position[1]} m`;
    sclOut.textContent = `× ${s.scale}`;
    hpOut.textContent = h() ? `${h().lensHeight ?? 1.5} m · turn ${h().yawDeg ?? 0}°` : "";
    for (const f of Object.values(fields)) f.input.value = f.get();
    overlayBtn.textContent = api.getMode() === "record" ? "Close video" : "Overlay video 50%";
  }
  setInterval(() => {
    const label = api.getMode() === "record" ? "Close video" : "Overlay video 50%";
    if (overlayBtn.textContent !== label) overlayBtn.textContent = label;
  }, 300);
  refresh();
}
