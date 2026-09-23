"""Objective checks for each 3840x2160 variant.

- fidelity: downscale the variant back to 2388x1343 (float Lanczos) and compare with the source crop
  (PSNR overall / per region) -> how much the content was changed.
- colour shift: mean per-channel difference vs source, plus the worst *local* shift after a
  sigma=8px Gaussian blur of the difference (a local tint would show up here, texture would not).
- detail: std of the luminance high-pass (x - G(x, 1.5)) per region, relative to plain Lanczos.
- texture correlation: correlation of the band-pass (G(0.8) - G(3)) luminance with plain Lanczos,
  per region -> low = original texture was repainted/removed, high = kept.
- overshoot: share of pixels outside the local 7x7 min/max of plain Lanczos by > 6 levels
  (halos / ringing / hallucinated sparkle).
- banding (region 4): share of pixels whose 5x5 neighbourhood is perfectly flat in 8-bit, and
  number of distinct colours.
"""
import json
import sys

import numpy as np
from scipy.ndimage import gaussian_filter, maximum_filter, minimum_filter

from common import load_src_crop, resize_float
from make_compare import REGIONS

OUT = "/tmp/upscale/out"
SX, SY = 2388 / 3840, 1343 / 2160


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def src_box(box):
    l, t, r, b = box
    return int(round(l * SX)), int(round(t * SY)), int(round(r * SX)), int(round(b * SY))


def psnr(a, b):
    mse = float(((a - b) ** 2).mean())
    return 10 * np.log10(1.0 / mse)


def analyse(v, src, lanczos):
    res = {}
    v8 = np.clip(np.round(v * 255), 0, 255) / 255.0  # evaluate what is actually saved (8-bit)
    down = np.clip(resize_float(v8, (2388, 1343)), 0, 1)
    res["psnr_vs_src"] = round(psnr(down, src), 2)
    d = (down - src) * 255
    res["mean_shift_rgb"] = [round(float(d[..., c].mean()), 2) for c in range(3)]
    blur = np.stack([gaussian_filter(d[..., c], 8) for c in range(3)], -1)[16:-16, 16:-16]
    res["local_shift_max_rgb"] = [round(float(np.abs(blur[..., c]).max()), 2) for c in range(3)]
    res["local_shift_p999"] = round(float(np.percentile(np.abs(blur), 99.9)), 2)
    yv, yl = lum(v8), lum(lanczos)
    # halo / ringing: values outside the local 7x7 range of plain Lanczos by > 6 levels (any channel)
    over = np.zeros(v8.shape[:2], bool)
    for c in range(3):
        hi = maximum_filter(lanczos[..., c], 7) + 6 / 255
        lo = minimum_filter(lanczos[..., c], 7) - 6 / 255
        over |= (v8[..., c] > hi) | (v8[..., c] < lo)
    res["overshoot_share"] = round(float(over.mean()), 4)
    for k, box, _ in REGIONS:
        l, t, r, b = box
        sl, st, sr, sb = src_box(box)
        reg = {}
        reg["psnr_vs_src"] = round(psnr(down[st:sb, sl:sr], src[st:sb, sl:sr]), 2)
        pv, pl = yv[t:b, l:r], yl[t:b, l:r]
        hp_v = pv - gaussian_filter(pv, 1.5)
        hp_l = pl - gaussian_filter(pl, 1.5)
        reg["detail_vs_lanczos"] = round(float(hp_v.std() / hp_l.std()), 3)
        bp_v = gaussian_filter(pv, 0.8) - gaussian_filter(pv, 3)
        bp_l = gaussian_filter(pl, 0.8) - gaussian_filter(pl, 3)
        reg["overshoot_share"] = round(float(over[t:b, l:r].mean()), 4)
        reg["texture_corr"] = round(float(np.corrcoef(bp_v.ravel(), bp_l.ravel())[0, 1]), 3)
        if k.startswith("region4"):
            q = np.round(v8[t:b, l:r] * 255).astype(np.int16)
            flat = np.ones(q.shape[:2], bool)
            for c in range(3):
                flat &= (maximum_filter(q[..., c], 5) - minimum_filter(q[..., c], 5)) == 0
            reg["flat5x5_share"] = round(float(flat.mean()), 3)
            reg["distinct_colours"] = int(len(np.unique(q.reshape(-1, 3), axis=0)))
        res[k.split("-")[0]] = reg
    return res


if __name__ == "__main__":
    src = np.asarray(load_src_crop()).astype(np.float32) / 255.0
    from PIL import Image
    lanczos = np.asarray(Image.open(f"{OUT}/lanczos_only_4k.png")).astype(np.float32) / 255.0
    results = {}
    for spec in sys.argv[1:]:
        label, path = spec.split("=", 1)
        v = np.load(path) if path.endswith(".npy") else np.asarray(Image.open(path))
        if v.dtype == np.uint8:
            v = v.astype(np.float32) / 255.0
        results[label] = analyse(v.astype(np.float32), src, lanczos)
        print(label, json.dumps(results[label], ensure_ascii=False), flush=True)
    json.dump(results, open(f"{OUT}/metrics.json", "w"), indent=1, ensure_ascii=False)
