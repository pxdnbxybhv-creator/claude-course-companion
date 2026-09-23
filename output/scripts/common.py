"""Shared helpers: model loading (spandrel) and tiled inference with feathered overlap."""
import math
import time

import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

MODELS_DIR = "/tmp/upscale/models"
SRC = "/tmp/upscale/work/IMG_1297.png"
CROP_BOX = (0, 162, 2388, 1505)  # -> 2388x1343, as specified by the user
TARGET = (3840, 2160)

MODEL_FILES = {
    "realcugan2x_conservative": "up2x-latest-conservative.pth",
    "realcugan2x_nodenoise": "up2x-latest-no-denoise.pth",
    "realcugan2x_denoise1x": "up2x-latest-denoise1x.pth",
    "realcugan2x_denoise3x": "up2x-latest-denoise3x.pth",
    "animesharpv4_2x_rcan": "2x-AnimeSharpV4_RCAN.safetensors",
    "animesharpv4_2x_fast": "2x-AnimeSharpV4_Fast_RCAN_PU.safetensors",
    "animesharpv3_2x": "2x-AnimeSharpV3.safetensors",
    "ultrasharp_4x": "4x-UltraSharp.safetensors",
    "animesharp_4x": "4x-AnimeSharp.safetensors",
    "ultrasharpv2lite_4x": "4x-UltraSharpV2_Lite.safetensors",
    "realesrgan_anime6b_4x": "RealESRGAN_x4plus_anime_6B.hlky.safetensors",
}


def load_model(name):
    path = f"{MODELS_DIR}/{MODEL_FILES[name]}"
    if path.endswith(".pth"):
        # .pth only: load tensors with weights_only=True (no pickle code execution)
        sd = torch.load(path, map_location="cpu", weights_only=True)
        desc = ModelLoader().load_from_state_dict(sd)
    else:
        desc = ModelLoader().load_from_file(path)
    desc.model.eval()
    desc.model.float()  # some safetensors ship fp16 weights; run in fp32
    for p in desc.model.parameters():
        p.requires_grad_(False)
    return desc


def load_src_crop():
    im = Image.open(SRC).convert("RGB").crop(CROP_BOX)
    assert im.size == (2388, 1343), im.size
    return im


def _layout(length, tile_max, overlap, mult=4):
    """Evenly spaced tiles of one common size T (<= tile_max, multiple of `mult`) that cover
    [0, length) with at least `overlap` px shared between neighbours."""
    if length <= tile_max:
        return length, [0]
    n = math.ceil((length - overlap) / (tile_max - overlap))
    T = math.ceil((length + (n - 1) * overlap) / n / mult) * mult
    starts = [round(i * (length - T) / (n - 1)) for i in range(n)]
    return T, starts


def _ramp(n_out, lo_interior, hi_interior, ramp_len):
    """1-D blend weight: linear ramp over ramp_len px at interior (overlapping) edges."""
    w = np.ones(n_out, np.float32)
    r = (np.arange(ramp_len, dtype=np.float32) + 0.5) / ramp_len
    if lo_interior:
        w[:ramp_len] = np.minimum(w[:ramp_len], r)
    if hi_interior:
        w[-ramp_len:] = np.minimum(w[-ramp_len:], r[::-1])
    return w


def tiled_upscale(model, scale, img, tile=384, overlap=48, border_pad=16, log=None):
    """img: float32 HxWx3 in [0,1]. Returns float32 (H*scale)x(W*scale)x3 (not clamped).

    The whole image is reflect-padded by border_pad first (so the model never sees an
    artificial zero border at the real image edges), then split into equal-size tiles
    that overlap by `overlap` input px. Overlaps are feather-blended with linear ramps,
    so tile edges (where the network sees zero padding) get ~0 weight.
    """
    H, W = img.shape[:2]
    P = border_pad
    padded = np.pad(img, ((P, P), (P, P), (0, 0)), mode="reflect")
    Hp, Wp = padded.shape[:2]
    th, ys = _layout(Hp, tile, overlap)
    tw, xs = _layout(Wp, tile, overlap)
    out = np.zeros((Hp * scale, Wp * scale, 3), np.float32)
    wsum = np.zeros((Hp * scale, Wp * scale, 1), np.float32)
    ramp_len = overlap * scale
    n = len(ys) * len(xs)
    k = 0
    t_start = time.time()
    for y0 in ys:
        for x0 in xs:
            t = padded[y0:y0 + th, x0:x0 + tw]
            h, w = t.shape[:2]
            x = torch.from_numpy(np.ascontiguousarray(t.transpose(2, 0, 1)))[None]
            with torch.inference_mode():
                o = model(x)[0].float().numpy().transpose(1, 2, 0)
            assert o.shape[:2] == (h * scale, w * scale), (o.shape, h, w, scale)
            wy = _ramp(h * scale, y0 > 0, y0 + h < Hp, ramp_len)
            wx = _ramp(w * scale, x0 > 0, x0 + w < Wp, ramp_len)
            wgt = (wy[:, None] * wx[None, :])[..., None]
            out[y0 * scale:(y0 + h) * scale, x0 * scale:(x0 + w) * scale] += o * wgt
            wsum[y0 * scale:(y0 + h) * scale, x0 * scale:(x0 + w) * scale] += wgt
            k += 1
            if log:
                el = time.time() - t_start
                log(f"tile {k}/{n} elapsed {el:7.1f}s eta {el / k * (n - k):7.1f}s")
    out /= wsum
    return out[P * scale:(P + H) * scale, P * scale:(P + W) * scale]


def tile_plan(H, W, tile=384, overlap=48, border_pad=16):
    th, ys = _layout(H + 2 * border_pad, tile, overlap)
    tw, xs = _layout(W + 2 * border_pad, tile, overlap)
    return dict(tile_h=th, tile_w=tw, n=len(ys) * len(xs), px=len(ys) * len(xs) * th * tw)


def resize_float(arr, size):
    """Lanczos resize of a float HxWx3 array, per channel in 32-bit float (PIL mode 'F'),
    so there is only one rounding step at the very end."""
    chans = [np.asarray(Image.fromarray(np.ascontiguousarray(arr[..., c], dtype=np.float32)).resize(size, Image.LANCZOS))
             for c in range(arr.shape[2])]
    return np.stack(chans, axis=-1)


def to_uint8(arr):
    return (np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
