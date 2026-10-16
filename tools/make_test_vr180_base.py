"""Static base frame for a VR180 side-by-side test video (equirectangular 180 per eye).

Output: PNG of size (2*E) x E. Left half = left eye, right half = right eye.
Labels sit at different virtual distances so stereo depth is visible; the grid is at infinity.
Usage: python3 make_test_vr180_base.py out.png [eye_px]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

E = int(sys.argv[2]) if len(sys.argv) > 2 else 1920
PX_PER_DEG = E / 180.0
IPD = 0.064
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def xy(az, el):
    """az: degrees, negative = viewer's left. el: degrees, positive = up."""
    return (az / 180.0 + 0.5) * E, (0.5 - el / 180.0) * E


def disparity_px(dist_m):
    import math
    return math.degrees(IPD / dist_m) * PX_PER_DEG


def eye_image(eye):
    sign = +0.5 if eye == "L" else -0.5  # near objects: further right in the left eye
    im = Image.new("RGB", (E, E), (18, 22, 30))
    d = ImageDraw.Draw(im)
    for el in range(-90, 91, 15):
        y = xy(0, el)[1]
        d.line([(0, y), (E, y)], fill=(70, 80, 100) if el else (150, 170, 210), width=3 if el == 0 else 1)
    for az in range(-90, 91, 15):
        x = xy(az, 0)[0]
        d.line([(x, 0), (x, E)], fill=(70, 80, 100) if az else (150, 170, 210), width=3 if az == 0 else 1)
    for az in range(-75, 76, 15):
        x, y = xy(az, 0)
        d.text((x + 4, y + 4), f"{az:+d}°", fill=(120, 135, 160), font=ImageFont.truetype(FONT_R, int(E / 80)))

    def label(text, az, el, size, dist, fill, sub=None):
        x, y = xy(az, el)
        x += sign * disparity_px(dist)
        f = ImageFont.truetype(FONT, int(size))
        w = d.textlength(text, font=f)
        d.text((x - w / 2, y - size / 2), text, font=f, fill=fill)
        if sub:
            fs = ImageFont.truetype(FONT_R, int(size * 0.45))
            ws = d.textlength(sub, font=fs)
            d.text((x - ws / 2, y + size * 0.62), sub, font=fs, fill=fill)

    label("FRONT · ÖN", 0, 14, E / 22, 1.5, (255, 255, 255), "ticks every second · her saniye tık")
    label("LEFT · SOL", -60, 0, E / 26, 3.0, (120, 220, 255), "high bell · tiz çan")
    label("RIGHT · SAĞ", 60, 0, E / 26, 3.0, (255, 190, 110), "low bell · pes çan")
    label("UP · YUKARI", 0, 62, E / 30, 4.0, (200, 200, 200))
    label("DOWN · AŞAĞI", 0, -62, E / 30, 4.0, (200, 200, 200))
    label("LEFT EYE · SOL GÖZ" if eye == "L" else "RIGHT EYE · SAĞ GÖZ", 0, -35, E / 40, 2.0,
          (140, 255, 160) if eye == "L" else (255, 140, 200))
    label("Memory Windows · VR180 test", 0, -78, E / 50, 4.0, (150, 150, 150))
    return im


out = Image.new("RGB", (2 * E, E))
out.paste(eye_image("L"), (0, 0))
out.paste(eye_image("R"), (E, 0))
out.save(sys.argv[1])
print("base", out.size, "clock disparity px", round(disparity_px(1.5), 1))
