"""Assemble v2: global generative pass + zoomed face passes + chroma guard -> final PNG (sRGB, RGB, no alpha)."""
import json
import sys

import numpy as np

sys.path.insert(0, "/tmp/upscale/work")
from common import to_uint8  # noqa: E402
from detail_pass import FACE_PASSES, paste  # noqa: E402
from finalize import save_png_srgb, verify  # noqa: E402
from v2_post import chroma_guard  # noqa: E402

O = "/tmp/upscale/out/"
V = "/tmp/upscale/v2/"
dst = sys.argv[1]
delta = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0
img = np.clip(np.load(V + "global_fixed_f32.npy"), 0, 1)
for name, (box, prompt, ell) in FACE_PASSES.items():
    img = paste(img, np.load(V + f"faces/{name}_s35.npy"), box, ell)
cug = np.clip(np.load(O + "realcugan2x_conservative_4k_f32.npy"), 0, 1)
img, clamped = chroma_guard(img, cug, delta=delta / 255)
u8 = to_uint8(img)
save_png_srgb(u8, dst)
np.save(V + "final_u8.npy", u8)
print(f"chroma guard delta {delta} levels: {clamped * 100:.2f}% of pixels clamped")
print(json.dumps(verify(dst, u8), indent=1))
