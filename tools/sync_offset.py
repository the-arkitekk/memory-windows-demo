#!/usr/bin/env python3
"""Cross-correlate camera scratch audio with channel 1 (W) of the ambisonic WAV.

usage: sync_offset.py CAMERA_FILE AMBI_WAV [seconds=20]
Positive offset = the clap occurs LATER in the ambisonic file than in the camera
file, so the audio -ss must be (video -ss) + offset.
"""
import subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt, correlate, correlation_lags

SR = 16000

def load(path, ch, secs):
    # ch: output channel index to pick (after decoding); mono mix if None
    af = f"pan=mono|c0=c{ch}" if ch is not None else "pan=mono|c0=0.5*c0+0.5*c1"
    cmd = ["ffmpeg", "-v", "error", "-t", str(secs), "-i", path, "-vn",
           "-af", af, "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)

def prep(x):
    x = sosfilt(butter(4, 300, "hp", fs=SR, output="sos"), x)
    env = np.abs(x)
    env = np.convolve(env, np.ones(16) / 16, "same")      # ~1 ms smoothing
    return env - env.mean()

def main():
    cam, amb = sys.argv[1], sys.argv[2]
    secs = float(sys.argv[3]) if len(sys.argv) > 3 else 20
    a = load(cam, None, secs)
    b = load(amb, 0, secs)
    xa, xb = prep(a), prep(b)
    for name, (p, q) in {"envelope": (xa, xb),
                         "waveform": (sosfilt(butter(4,[300,6000],"bp",fs=SR,output="sos"),a),
                                      sosfilt(butter(4,[300,6000],"bp",fs=SR,output="sos"),b))}.items():
        c = correlate(q, p, "full", method="fft")
        lags = correlation_lags(len(q), len(p), "full")
        k = np.argmax(c)
        peak = c[k] / (np.linalg.norm(p) * np.linalg.norm(q))
        # second-best peak >5 ms away, for confidence
        mask = np.abs(lags - lags[k]) > SR * 0.005
        ratio = c[k] / max(c[mask].max(), 1e-12)
        print(f"{name:9s} offset = {lags[k] / SR * 1000:+8.2f} ms  (norm.corr {peak:.3f}, peak/second {ratio:.2f})")

main()
