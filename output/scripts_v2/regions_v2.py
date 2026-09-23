"""Hand-placed regions (3840x2160 coords) for the generative pass: strength map + per-tile prompts."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 3840, 2160
BASE_Q = "masterpiece, best quality, ultra detailed, anime illustration, painterly, soft lighting, "

# polygons
LEFT_GIRL = [(210, 1330), (420, 1120), (640, 1040), (900, 1040), (1150, 1180), (1380, 1280), (1560, 1270),
             (1690, 1330), (1720, 1470), (1640, 1580), (1480, 1640), (1420, 1760), (1300, 1880), (1120, 1960),
             (960, 2160), (760, 2160), (820, 1960), (700, 1820), (520, 1800), (300, 1760), (200, 1560)]
SWORD = [(1300, 1470), (2020, 1500), (2020, 1560), (1300, 1575)]
RIGHT_GIRL = [(2990, 1070), (3200, 1050), (3330, 1110), (3420, 1330), (3480, 1560), (3440, 1760),
              (3330, 1800), (3300, 2160), (3030, 2160), (3080, 1800), (2960, 1760), (2780, 1900), (2760, 1740),
              (2850, 1480), (2930, 1200)]
FACES = {"right": (3145, 1205, 62, 70), "left": (1522, 1428, 70, 75)}  # cx, cy, rx, ry (ellipse)
HANDS = [(3095, 1435, 3200, 1545), (3330, 1480, 3420, 1575), (1270, 1430, 1440, 1570)]  # boxes

PROMPT_REGIONS = {  # order matters: CLIP reads 77 tokens, most important first; no "girl" words (no stray faces)
    "sword": (SWORD, "long sword, straight silver blade"),
    "left": (LEFT_GIRL, "short aquamarine hair, white flowers, white frilled dress, dark green cape, ribbons"),
    "right": (RIGHT_GIRL, "long silver hair, white jacket, dark blue dress, red necktie, black gloves"),
    "rock": ([(0, 0), (2900, 0), (2900, 1700), (1900, 1700), (1500, 1200), (0, 1150)],
             "pale grey rock cliff, detailed rock texture, soft impasto brush strokes, muted colors"),
    "dark": ([(2500, 0), (3840, 0), (3840, 1500), (2500, 1300)],
             "dark blue rock wall in shadow, subtle swirl patterns, muted colors"),
    "mist": ([(0, 650), (2300, 650), (2300, 2160), (0, 2160)], "white mist, soft clouds, snow"),
    "ground": ([(1700, 1700), (3840, 1650), (3840, 2160), (1700, 2160)], "snowy ground, rocks, mist"),
    "debris": ([(0, 1450), (700, 1450), (700, 2160), (0, 2160)], "broken wooden beams, rubble, snow"),
}


def poly_mask(poly, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m).astype(np.float32) / 255


def ellipse_mask(cx, cy, rx, ry, blur=0):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m).astype(np.float32) / 255


def strength_map(bg=0.5, chars=0.38, sword=0.4, hands=0.3, faces=0.0):
    s = np.full((H, W), bg, np.float32)
    ch = np.maximum(poly_mask(LEFT_GIRL, 20), poly_mask(RIGHT_GIRL, 20))
    s = s * (1 - ch) + chars * ch
    sw = poly_mask(SWORD, 8)
    s = s * (1 - sw) + sword * sw
    for b in HANDS:
        hm = poly_mask([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])], 16)
        s = s * (1 - hm) + hands * hm
    for cx, cy, rx, ry in FACES.values():
        fm = ellipse_mask(cx, cy, rx + 16, ry + 16, 12)
        s = s * (1 - fm) + faces * fm
    return s


_region_masks = None


def tile_prompt(x0, y0, x1, y1):
    global _region_masks
    if _region_masks is None:
        _region_masks = {k: poly_mask(p) for k, (p, _) in PROMPT_REGIONS.items()}
    tags = []
    for k, (_, text) in PROMPT_REGIONS.items():
        cov = _region_masks[k][y0:y1, x0:x1].mean()
        if cov > (0.03 if k in ("left", "right", "sword") else 0.12):
            tags.append(text)
    return BASE_Q + ", ".join(tags)
