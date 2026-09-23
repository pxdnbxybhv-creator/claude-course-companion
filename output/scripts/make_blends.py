"""AI/baseline linear blends in float (single rounding): out = s*AI + (1-s)*baseline."""
import sys

import numpy as np
from PIL import Image

from finalize import blend

OUT = "/tmp/upscale/out"
name = sys.argv[1]
shares = [float(x) for x in sys.argv[2:]]
ai = np.load(f"{OUT}/{name}_4k_f32.npy")
base = np.load(f"{OUT}/baseline_4k_f32.npy")
for s in shares:
    u8 = blend(ai, base, s)
    p = f"{OUT}/blend_{name}_ai{int(round(s * 100))}_4k.png"
    Image.fromarray(u8).save(p, compress_level=1)
    np.save(p.replace(".png", "_u8.npy"), u8)
    print(p)
