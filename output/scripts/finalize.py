"""Blend helpers and final PNG writer (RGB, 8-bit, sRGB chunk, no alpha) with verification."""
import struct

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from common import to_uint8

OUT = "/tmp/upscale/out"


def blend(ai_f32, base_f32, ai_share):
    return to_uint8(ai_share * ai_f32 + (1.0 - ai_share) * base_f32)


def save_png_srgb(u8, path):
    assert u8.dtype == np.uint8 and u8.ndim == 3 and u8.shape[2] == 3
    info = PngInfo()
    info.add(b"sRGB", b"\x00")  # same as the source: sRGB, rendering intent 0 (perceptual)
    Image.fromarray(u8).save(path, pnginfo=info, optimize=True)


def png_chunks(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    i, out = 8, []
    while i < len(data):
        ln = struct.unpack(">I", data[i:i + 4])[0]
        typ = data[i + 4:i + 8].decode("latin1")
        if not out or out[-1] != typ:
            out.append(typ)
        i += 12 + ln
    return out


def verify(path, ref_u8):
    im = Image.open(path)
    im.load()
    chunks = png_chunks(path)
    ihdr = open(path, "rb").read()[16:29]
    w, h, bitdepth, colortype = struct.unpack(">IIBB", ihdr[:10])
    a = np.asarray(im)
    edge = {
        "top_row_vs_row8": float(a[0].mean() - a[8].mean()),
        "bottom_row_vs_row-9": float(a[-1].mean() - a[-9].mean()),
        "left_col_vs_col8": float(a[:, 0].mean() - a[:, 8].mean()),
        "right_col_vs_col-9": float(a[:, -1].mean() - a[:, -9].mean()),
    }
    rep = dict(size=im.size, mode=im.mode, bitdepth=bitdepth, colortype=colortype, chunks=chunks,
               identical_pixels=bool((a == ref_u8).all()), edge_mean_diffs=edge,
               min_edge_mean=float(min(a[0].mean(), a[-1].mean(), a[:, 0].mean(), a[:, -1].mean())))
    assert im.size == (3840, 2160) and im.mode == "RGB" and bitdepth == 8 and colortype == 2
    assert "sRGB" in chunks and "tRNS" not in chunks and "iCCP" not in chunks
    assert rep["identical_pixels"]
    return rep
