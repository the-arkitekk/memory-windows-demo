"""Generate a small synthetic Gaussian-splat room (3DGS binary PLY, SH degree 0).

Coordinates: metres, three.js convention (+Y up, -Z forward). The room is 8 x 6 x 3 m,
with a wooden floor, plaster walls, a window, a door, a table, a copper cauldron and a
taped X on the floor where the VR180 tripod "stood" (1.0, 0, 0.4).
Usage: python3 make_test_room_ply.py out.ply
"""
import sys
import numpy as np

rng = np.random.default_rng(7)
SH_C0 = 0.28209479177387814
SP = 0.035  # splat spacing (m)

pos, col, scl = [], [], []


def add(p, c, s):
    pos.append(np.asarray(p, np.float32))
    col.append(np.asarray(c, np.float32))
    scl.append(np.asarray(s, np.float32))


def plane(axis, fixed, a_rng, b_rng, color_fn, sp=SP):
    """Axis-aligned plane. axis 0/1/2 = normal along x/y/z."""
    a = np.arange(a_rng[0], a_rng[1], sp) + sp / 2
    b = np.arange(b_rng[0], b_rng[1], sp) + sp / 2
    A, B = np.meshgrid(a, b, indexing="ij")
    A = A.ravel() + rng.normal(0, sp * 0.15, A.size)
    B = B.ravel() + rng.normal(0, sp * 0.15, B.size)
    n = A.size
    P = np.zeros((n, 3), np.float32)
    others = [i for i in range(3) if i != axis]
    P[:, axis] = fixed
    P[:, others[0]] = A
    P[:, others[1]] = B
    C = color_fn(P)
    S = np.full((n, 3), sp * 0.62, np.float32)
    S[:, axis] = sp * 0.08
    add(P, C, S)


def jitter(C, amt=0.025):
    return np.clip(C + rng.normal(0, amt, C.shape), 0, 1)


def floor_color(P):
    plank = np.floor(P[:, 2] / 0.18)
    base = np.stack([0.55 + 0.06 * np.sin(plank * 2.3), 0.38 + 0.04 * np.sin(plank * 1.7), 0.22 + 0.02 * np.cos(plank)], 1)
    grain = 0.04 * np.sin(P[:, 0] * 9 + plank * 3)[:, None]
    C = base + grain
    # taped X at the tripod spot
    d1 = np.abs((P[:, 0] - 1.0) - (P[:, 2] - 0.4))
    d2 = np.abs((P[:, 0] - 1.0) + (P[:, 2] - 0.4))
    r = np.hypot(P[:, 0] - 1.0, P[:, 2] - 0.4)
    tape = ((d1 < 0.05) | (d2 < 0.05)) & (r < 0.35)
    C[tape] = [0.95, 0.85, 0.15]
    return jitter(C)


def wall_color_fn(base, window=None, door=None, frame=None):
    def fn(P):
        y = P[:, 1]
        C = np.tile(np.asarray(base, np.float32), (len(P), 1))
        C *= (0.92 + 0.08 * (y / 3.0))[:, None]
        C[y < 0.12] = [0.35, 0.27, 0.2]  # skirting board
        if window is not None:
            (u0, u1), (v0, v1), ui = window
            m = (P[:, ui] > u0) & (P[:, ui] < u1) & (y > v0) & (y < v1)
            sky = np.stack([0.75 + 0.1 * (y - v0), 0.86 + 0.05 * (y - v0), 0.98 * np.ones_like(y)], 1)
            C[m] = sky[m]
            mullion = m & ((np.abs(P[:, ui] - (u0 + u1) / 2) < 0.03) | (np.abs(y - (v0 + v1) / 2) < 0.03))
            C[mullion] = [0.95, 0.95, 0.92]
        if door is not None:
            (u0, u1), (v0, v1), ui = door
            m = (P[:, ui] > u0) & (P[:, ui] < u1) & (y > v0) & (y < v1)
            C[m] = [0.36, 0.2, 0.12]
        if frame is not None:
            (u0, u1), (v0, v1), ui = frame
            m = (P[:, ui] > u0) & (P[:, ui] < u1) & (y > v0) & (y < v1)
            inner = m & (P[:, ui] > u0 + 0.06) & (P[:, ui] < u1 - 0.06) & (y > v0 + 0.06) & (y < v1 - 0.06)
            C[m] = [0.55, 0.42, 0.18]
            t = (P[inner, ui] - u0) / (u1 - u0)
            C[inner] = np.stack([0.2 + 0.5 * t, 0.45 - 0.1 * t, 0.35 + 0.2 * (1 - t)], 1)
        return jitter(C, 0.02)
    return fn


# floor and ceiling
plane(1, 0.0, (-4, 4), (-3, 3), floor_color)
plane(1, 3.0, (-4, 4), (-3, 3), lambda P: jitter(np.tile([0.88, 0.86, 0.82], (len(P), 1)), 0.015), sp=0.06)
# walls (front = -Z)
plane(2, -3.0, (-4, 4), (0, 3), wall_color_fn([0.86, 0.78, 0.66], window=((-0.2, 2.2), (1.0, 2.4), 0)))
plane(2, 3.0, (-4, 4), (0, 3), wall_color_fn([0.80, 0.80, 0.74], door=((-3.4, -2.4), (0.0, 2.1), 0)))
plane(0, -4.0, (0, 3), (-3, 3), wall_color_fn([0.74, 0.80, 0.78], frame=((-1.0, 0.6), (1.2, 2.2), 2)))
plane(0, 4.0, (0, 3), (-3, 3), wall_color_fn([0.82, 0.74, 0.72]))


def box(x0, x1, y0, y1, z0, z1, c):
    fn = lambda P: jitter(np.tile(c, (len(P), 1)), 0.03)
    plane(1, y1, (x0, x1), (z0, z1), fn, sp=0.025)
    for z in (z0, z1):
        plane(2, z, (x0, x1), (y0, y1), lambda P: jitter(np.tile(np.array(c) * 0.8, (len(P), 1)), 0.03), sp=0.025)
    for x in (x0, x1):
        plane(0, x, (y0, y1), (z0, z1), lambda P: jitter(np.tile(np.array(c) * 0.7, (len(P), 1)), 0.03), sp=0.025)


# table with legs
box(-2.4, -1.0, 0.72, 0.76, -2.2, -1.4, [0.45, 0.28, 0.16])
for lx, lz in [(-2.35, -2.15), (-1.05, -2.15), (-2.35, -1.45), (-1.05, -1.45)]:
    box(lx - 0.03, lx + 0.03, 0.0, 0.72, lz - 0.03, lz + 0.03, [0.35, 0.22, 0.13])

# copper cauldron (kazan) in front of the tripod
cx, cz, R, H = 1.0, -1.6, 0.42, 0.55
th = np.linspace(0, 2 * np.pi, 260, endpoint=False)
for y in np.arange(0.12, H, 0.02):
    r = R * (0.75 + 0.25 * np.sin(np.pi * (y - 0.12) / (H - 0.12)) ** 0.5)
    P = np.stack([cx + r * np.cos(th), np.full_like(th, y), cz + r * np.sin(th)], 1)
    shade = 0.75 + 0.25 * np.cos(th - 2.4)
    C = np.stack([0.78 * shade, 0.42 * shade, 0.2 * shade], 1)
    S = np.full((len(th), 3), 0.014, np.float32)
    add(P, jitter(C, 0.02), S)
# rim and fire underneath
P = np.stack([cx + R * np.cos(th), np.full_like(th, H), cz + R * np.sin(th)], 1)
add(P, np.tile([0.55, 0.3, 0.12], (len(th), 1)), np.full((len(th), 3), 0.016, np.float32))
fire = rng.normal(0, 1, (900, 3)) * [0.16, 0.05, 0.16] + [cx, 0.07, cz]
add(fire, np.clip(np.stack([np.ones(900), 0.35 + 0.4 * rng.random(900), 0.05 * np.ones(900)], 1), 0, 1), np.full((900, 3), 0.02, np.float32))

pos = np.concatenate(pos)
col = np.concatenate(col)
scl = np.concatenate(scl)
n = len(pos)

f_dc = (col - 0.5) / SH_C0
alpha = np.full(n, 0.92, np.float32)
opacity = np.log(alpha / (1 - alpha))
scale_log = np.log(np.maximum(scl, 1e-4))
rot = np.tile(np.array([1, 0, 0, 0], np.float32), (n, 1))
normals = np.zeros((n, 3), np.float32)

fields = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
          "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]
data = np.concatenate([pos, normals, f_dc, opacity[:, None], scale_log, rot], 1).astype("<f4")
header = "ply\nformat binary_little_endian 1.0\nelement vertex %d\n" % n
header += "".join("property float %s\n" % f for f in fields) + "end_header\n"
with open(sys.argv[1], "wb") as f:
    f.write(header.encode("ascii"))
    f.write(data.tobytes())
print("splats:", n, "bytes:", len(header) + data.nbytes)
