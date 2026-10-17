// Memory Windows service worker: makes the demo work without a network once it has been opened.
//  - code (html/js/json): network first (so updates arrive), the cached copy when the network fails
//  - /media/: cache first, including byte-range requests (video seeking/streaming served from the cache)
//  - the page can ask for a "precache" of the model, sound and video it will need (see app.js)
// When files in media/ are replaced, change MEDIA below so that devices fetch them again.
const CODE = "mw-code-v1";
const MEDIA = "mw-media-v1";
const CORE = [
  "./", "index.html", "app.js", "config.json", "config-splat.json", "config-mesh.json",
  "src/editor.js", "src/hotspots.js", "src/i18n.js", "src/player.js", "src/text.js",
  "vendor/omnitone/omnitone.min.esm.js", "vendor/spark/spark.module.min.js",
  "vendor/three/three.core.min.js", "vendor/three/three.module.min.js",
  "vendor/three/addons/loaders/GLTFLoader.js", "vendor/three/addons/utils/BufferGeometryUtils.js",
  "vendor/three/addons/postprocessing/Pass.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CODE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CODE && k !== MEDIA && k.startsWith("mw-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes("/media/") ? media(req) : code(req));
});

async function code(req) {
  const cache = await caches.open(CODE);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000); // slow network: use what we have
    const res = await fetch(req, { signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" && (await cache.match("./")));
    if (hit) return hit;
    throw err;
  }
}

async function media(req) {
  const cache = await caches.open(MEDIA);
  const key = new Request(req.url);
  const hit = await cache.match(key);
  const range = req.headers.get("range");
  if (hit) return range ? rangeOf(hit, range) : hit;
  const res = await fetch(req);
  if (!range && res.status === 200) cache.put(key, res.clone()).catch(() => {});
  return res;
}

// Answer a byte-range request from a complete cached file.
async function rangeOf(hit, header) {
  const blob = await hit.blob();
  const size = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(header);
  let start = m && m[1] !== "" ? Number(m[1]) : null;
  let end = m && m[2] !== "" ? Number(m[2]) : null;
  if (start === null && end !== null) { start = Math.max(0, size - end); end = size - 1; } // suffix range
  if (start === null) start = 0;
  if (end === null || end >= size) end = size - 1;
  if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || blob.type || "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("message", (e) => {
  if (e.data?.type === "precache") e.waitUntil(precache(e.data.urls, e.source));
});

async function precache(urls, client) {
  const cache = await caches.open(MEDIA);
  const say = (m) => client?.postMessage({ type: "precache", ...m });
  let done = 0, failed = 0;
  say({ done, total: urls.length, fraction: 0 });
  for (const u of urls) {
    const key = new Request(new URL(u, location.href).href);
    try {
      if (!(await cache.match(key))) {
        const res = await fetch(key);
        if (!res.ok) throw new Error(`${res.status}`);
        const total = Number(res.headers.get("Content-Length")) || 0;
        const [a, b] = res.body.tee();
        const put = cache.put(key, new Response(b, { status: 200, headers: res.headers }));
        const reader = a.getReader();
        let got = 0;
        for (;;) {
          const { done: d, value } = await reader.read();
          if (d) break;
          got += value.length;
          if (total) say({ done, total: urls.length, fraction: Math.min(1, got / total) });
        }
        await put;
      }
    } catch (err) {
      failed++;
      say({ error: `${u}: ${err.message}` });
    }
    done++;
    say({ done, total: urls.length, fraction: 0 });
  }
  say({ finished: true, done, total: urls.length, failed });
}
