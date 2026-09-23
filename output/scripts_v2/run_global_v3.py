"""Global generative pass, final method: independent self-consistent 896x896 img2img tiles (SD1.5 + ControlNet-Tile,
regional prompts, per-pixel strength map) from the continuous Real-CUGAN 4K, one shared noise field, cosine
feathering over 256 px; then wavelet colour fix against the plain Lanczos upscale."""
import json
import time

import numpy as np
import torch
from PIL import Image

from regions_v2 import strength_map, tile_prompt
from sdtile import Refiner, wavelet_color_fix

O = "/tmp/upscale/out/"
V = "/tmp/upscale/v2/"
PARAMS = dict(base="counterfeit_v30", method="independent tiles + shared noise + cosine blend", tile=896,
              overlap=256, steps=24, cfg=6.0, cn_scale=0.85, seed=1234,
              strength=dict(bg=0.46, chars=0.30, sword=0.32, hands=0.25, faces=0.0))
logf = open(V + "global.log", "w", buffering=1)


def log(m):
    logf.write(time.strftime("%H:%M:%S ") + m + "\n")


cug = np.clip(np.load(O + "realcugan2x_conservative_4k_f32.npy"), 0, 1)
lz = np.asarray(Image.open(O + "lanczos_only_4k.png")).astype(np.float32) / 255
S = strength_map(**PARAMS["strength"])
t0 = time.time()
r = Refiner(PARAMS["base"], dtype=torch.bfloat16)
out = r.refine_tiles_blend(cug, tile_prompt, S, tile=PARAMS["tile"], overlap=PARAMS["overlap"], seed=PARAMS["seed"],
                           log=log, steps=PARAMS["steps"], cfg=PARAMS["cfg"], cn_scale=PARAMS["cn_scale"])
np.save(V + "global_raw_f16.npy", out.astype(np.float16))
fixed = wavelet_color_fix(out, lz)
np.save(V + "global_fixed_f32.npy", fixed.astype(np.float32))
Image.fromarray((np.clip(fixed, 0, 1) * 255 + 0.5).astype(np.uint8)).save(V + "global_fixed.png", compress_level=1)
json.dump(dict(PARAMS, total_s=round(time.time() - t0, 1)), open(V + "global_params.json", "w"), indent=1)
log(f"DONE total {time.time() - t0:.0f}s")
