"""Zoomed detail passes (ADetailer-like) for small but important areas: crop -> upscale to ~768 ->
low-strength SD + ControlNet-Tile -> keep only fine detail (wavelet: structure/colour from the source crop)
-> downscale -> paste back with a feathered mask."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from common import resize_float
from sdtile import wavelet_color_fix

BASE_Q = "masterpiece, best quality, ultra detailed, anime illustration, painterly, "
FACE_PASSES = {
    # name: (box in 4K coords, prompt, ellipse (cx, cy, rx, ry) for the paste mask)
    "insight_face": ((3033, 1093, 3257, 1317),
                     BASE_Q + "1girl, close-up, long silver hair with lavender tint, blue eyes, expressionless, "
                              "closed mouth, looking at viewer, pale skin, white collar, red necktie, soft light",
                     (3145, 1205, 78, 86)),
    "saya_face": ((1410, 1316, 1634, 1540),
                  BASE_Q + "1girl, close-up, short aquamarine hair, white flower covering right eye, "
                           "white flower hair ornament, pale skin, closed mouth, profile, wind, light particles",
                  (1522, 1428, 86, 91)),
}


def ellipse_mask(shape, box, ell, feather):
    x0, y0, x1, y1 = box
    cx, cy, rx, ry = ell
    m = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).ellipse([cx - rx - x0, cy - ry - y0, cx + rx - x0, cy + ry - y0], fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32)[..., None] / 255


def run_pass(refiner, img4k, box, prompt, strength=0.3, size=768, cn=1.0, cfg=6.0, steps=24, seed=77,
             wavelet_levels=5, log=print):
    x0, y0, x1, y1 = box
    crop = np.ascontiguousarray(img4k[y0:y1, x0:x1])
    up = np.clip(resize_float(crop, (size, size)), 0, 1).astype(np.float32)
    out = refiner.refine(up, up, lambda *a: prompt, strength=strength, steps=steps, cfg=cfg, cn_scale=cn,
                         tile=size // 8, overlap=16, seed=seed, log=log)
    out = wavelet_color_fix(out, up, levels=wavelet_levels)  # structure & colour above ~2^levels px from source
    return np.clip(resize_float(out, (x1 - x0, y1 - y0)), 0, 1)


def paste(img4k, patch, box, ell, feather=10):
    x0, y0, x1, y1 = box
    m = ellipse_mask(img4k.shape, box, ell, feather)
    out = img4k.copy()
    out[y0:y1, x0:x1] = m * patch + (1 - m) * img4k[y0:y1, x0:x1]
    return out
