"""Post-processing for v2: chroma guard (keep all luminance detail from the generative pass, but limit how far
the colour (Cb/Cr) may drift from the faithful Real-CUGAN upscale)."""
import numpy as np


def _ycc(a):
    y = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    return y, (a[..., 2] - y) * 0.564, (a[..., 0] - y) * 0.713


def chroma_guard(img, ref, delta=6 / 255):
    """img, ref: HxWx3 float [0,1]. Returns img with Cb/Cr clamped to ref +- delta (luma untouched) and the
    share of pixels that were clamped."""
    y, cb, cr = _ycc(img)
    _, cbr, crr = _ycc(ref)
    cb2 = cbr + np.clip(cb - cbr, -delta, delta)
    cr2 = crr + np.clip(cr - crr, -delta, delta)
    clamped = float(((cb2 != cb) | (cr2 != cr)).mean())
    r = y + cr2 / 0.713
    b = y + cb2 / 0.564
    g = (y - 0.299 * r - 0.114 * b) / 0.587
    return np.clip(np.stack([r, g, b], -1), 0, 1), clamped
