"""First-order ambisonic (AmbiX: ACN order W,Y,Z,X; SN3D) test signal, 4-channel 48 kHz WAV.

- FRONT (az 0):    1 kHz tick on every whole second (matches the white flash in the test video)
- LEFT  (az +90):  high bell (1320 Hz) at 0.5 s, 2.5 s, 4.5 s ...
- RIGHT (az -90):  low bell  (440 Hz)  at 1.5 s, 3.5 s, 5.5 s ...
Azimuth is counter-clockwise from the front (ambisonic convention: +90 = left).
Usage: python3 make_test_foa.py out.wav [seconds]
"""
import sys
import wave
import numpy as np

SR = 48000
dur = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
n = int(SR * dur)
out = np.zeros((n, 4), np.float64)


def encode(sig, t0, az_deg, el_deg=0.0, gain=0.5):
    az, el = np.radians(az_deg), np.radians(el_deg)
    g = np.array([1.0, np.sin(az) * np.cos(el), np.sin(el), np.cos(az) * np.cos(el)])
    i0 = int(t0 * SR)
    i1 = min(n, i0 + len(sig))
    if i1 > i0:
        out[i0:i1] += gain * sig[: i1 - i0, None] * g[None, :]


def tone(freq, length, decay, partials=(1.0,)):
    t = np.arange(int(length * SR)) / SR
    s = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(partials))
    env = np.exp(-t / decay) * np.minimum(1, t / 0.003)
    return s * env


tick = tone(1000, 0.06, 0.012)
high = tone(1320, 0.9, 0.22, (1.0, 0.35, 0.12))
low = tone(440, 0.9, 0.28, (1.0, 0.4, 0.2))
for s in range(int(dur)):
    encode(tick, s, 0)
    half = s + 0.5
    (encode(high, half, +90) if s % 2 == 0 else encode(low, half, -90))

peak = np.abs(out).max()
out *= 0.85 / peak
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(4)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", sys.argv[1], "seconds", dur, "channels 4 (ACN/SN3D)")
