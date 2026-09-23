"""Final zoomed face passes (strength 0.35, ControlNet-Tile 1.0, structure above ~9 px locked to the source)."""
import json
import time

import numpy as np
import torch

from detail_pass import FACE_PASSES, run_pass
from sdtile import Refiner

O = "/tmp/upscale/out/"
V = "/tmp/upscale/v2/"
cug = np.clip(np.load(O + "realcugan2x_conservative_4k_f32.npy"), 0, 1)  # faces are locked to these pixels in the global pass
r = Refiner("counterfeit_v30", dtype=torch.bfloat16)
info = {}
for name, (box, prompt, ell) in FACE_PASSES.items():
    t0 = time.time()
    patch = run_pass(r, cug, box, prompt, strength=0.35, size=768, cn=1.0, cfg=6.0, steps=24, seed=77, log=lambda m: None)
    np.save(V + f"faces/{name}_s35.npy", patch)
    info[name] = dict(box=box, prompt=prompt, strength=0.35, size=768, cn=1.0, cfg=6.0, steps=24, seed=77,
                      seconds=round(time.time() - t0, 1))
    print(name, info[name]["seconds"], flush=True)
json.dump(info, open(V + "faces/faces_params.json", "w"), indent=1, ensure_ascii=False)
