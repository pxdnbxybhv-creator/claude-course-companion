"""Final image: 70% Real-CUGAN 2x conservative + 30% baseline, saved as RGB PNG with an sRGB chunk."""
import json
import sys

import numpy as np

from finalize import blend, save_png_srgb, verify

O = "/tmp/upscale/out/"
dst = sys.argv[1] if len(sys.argv) > 1 else "output/IMG_1297_4K_AI.png"
ai = np.load(O + "realcugan2x_conservative_4k_f32.npy")  # written by run_model.py
base = np.load(O + "baseline_4k_f32.npy")  # written by make_baseline.py
u8 = blend(ai, base, 0.70)
save_png_srgb(u8, dst)
print(json.dumps(verify(dst, u8), indent=1))
