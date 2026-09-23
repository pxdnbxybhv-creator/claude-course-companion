"""Baseline: crop -> Lanczos to 3840x2160 -> UnsharpMask(radius=1.4, percent=70, threshold=3)."""
import numpy as np
from PIL import Image, ImageFilter

from common import TARGET, load_src_crop

OUT = "/tmp/upscale/out"
im = load_src_crop()
im.save(f"{OUT}/src_crop_2388x1343.png")
up = im.resize(TARGET, Image.LANCZOS)
up.save(f"{OUT}/lanczos_only_4k.png", compress_level=1)
base = up.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=3))
base.save(f"{OUT}/baseline_4k.png", compress_level=1)
np.save(f"{OUT}/baseline_4k_f32.npy", np.asarray(base).astype(np.float32) / 255.0)
print(im.size, base.size, base.mode)
