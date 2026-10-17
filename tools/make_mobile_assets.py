#!/usr/bin/env python3
"""Lighter copies of the room for phones and tablets (iOS Safari runs out of GPU memory otherwise).

usage: make_mobile_assets.py media/room.spz media/room-mesh.glb [splats=300000] [texture=4096]

  * splat -> room-mobile.spz : keeps the most opaque splats, drops spherical harmonics (45 of the
                               65 bytes per splat), so GPU memory falls roughly 4x.
  * mesh  -> room-mesh-mobile.glb : the 8192x8192 texture is resized (an 8K texture is ~350 MB on the GPU).
"""
import gzip, io, json, struct, sys
import numpy as np
from PIL import Image

def lighten_spz(src, dst, keep):
    d = gzip.open(src).read()
    magic, ver, n, sh, fb, flags, _ = struct.unpack("<IIIBBBB", d[:16])
    assert d[:4] == b"NGSP" and ver == 3, "expected SPZ v3"
    sizes = [n * 9, n, n * 3, n * 3, n * 4]          # positions, alphas, colors, scales, rotations
    off, cols = 16, []
    for s_ in sizes:
        cols.append(np.frombuffer(d, np.uint8, s_, off)); off += s_
    alpha = cols[1]
    idx = np.sort(np.argsort(-alpha.astype(np.int32), kind="stable")[:keep])
    out = [d[:8], struct.pack("<I", len(idx)), bytes([0, fb, flags, 0])]
    for c, per in zip(cols, [9, 1, 3, 3, 4]):
        out.append(c.reshape(n, per)[idx].tobytes())
    open(dst, "wb").write(gzip.compress(b"".join(out), 9))
    print(f"{dst}: {len(idx)} of {n} splats, no SH, {len(open(dst,'rb').read())/1e6:.1f} MB")

def lighten_glb(src, dst, tex):
    d = open(src, "rb").read()
    jl, _ = struct.unpack("<II", d[12:20])
    j = json.loads(d[20:20 + jl]); b = d[20 + jl + 8:]
    views = [b[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]] for v in j["bufferViews"]]
    for im in j.get("images", []):
        v = im["bufferView"]
        img = Image.open(io.BytesIO(views[v])).convert("RGB")
        if max(img.size) > tex:
            img = img.resize((tex, tex * img.height // img.width) if img.width >= img.height else (tex * img.width // img.height, tex), Image.LANCZOS)
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=88); views[v] = buf.getvalue()
        print(f"texture -> {img.size}, {len(views[v])/1e6:.1f} MB")
    pos, blob = 0, bytearray()
    for v, data in zip(j["bufferViews"], views):
        v["byteOffset"], v["byteLength"] = pos, len(data)
        blob += data; pad = (-len(blob)) % 4; blob += b"\0" * pad; pos = len(blob)
    j["buffers"][0]["byteLength"] = len(blob)
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    open(dst, "wb").write(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js
                          + struct.pack("<I4s", len(blob), b"BIN\0") + bytes(blob))
    print(f"{dst}: {total/1e6:.1f} MB")

if __name__ == "__main__":
    spz, glb = sys.argv[1], sys.argv[2]
    keep = int(sys.argv[3]) if len(sys.argv) > 3 else 300000
    tex = int(sys.argv[4]) if len(sys.argv) > 4 else 4096
    lighten_spz(spz, spz.replace(".spz", "-mobile.spz"), keep)
    lighten_glb(glb, glb.replace(".glb", "-mobile.glb"), tex)
