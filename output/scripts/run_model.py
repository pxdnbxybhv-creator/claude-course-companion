"""Full-image tiled inference for one model; writes raw output, 3840x2160 float + PNG, timing json."""
import json
import sys
import time

import numpy as np
import torch
from PIL import Image

from common import MODEL_FILES, TARGET, load_model, load_src_crop, resize_float, tile_plan, tiled_upscale, to_uint8

torch.set_num_threads(4)
name = sys.argv[1]
tile = int(sys.argv[2]) if len(sys.argv) > 2 else 448
overlap = int(sys.argv[3]) if len(sys.argv) > 3 else 48
OUT = "/tmp/upscale/out"

logf = open(f"{OUT}/{name}.progress.log", "w", buffering=1)


def log(msg):
    logf.write(time.strftime("%H:%M:%S ") + msg + "\n")


d = load_model(name)
src = np.asarray(load_src_crop()).astype(np.float32) / 255.0
plan = tile_plan(1343, 2388, tile, overlap)
log(f"model {name} ({MODEL_FILES[name]}) arch={d.architecture.name} scale={d.scale} plan={plan} overlap={overlap}")

t0 = time.time()
raw = tiled_upscale(d.model, d.scale, src, tile=tile, overlap=overlap, border_pad=16, log=log)
t_inf = time.time() - t0
raw = np.clip(raw, 0.0, 1.0)
np.save(f"{OUT}/{name}_raw_x{d.scale}.npy", raw.astype(np.float16))

t1 = time.time()
r4k = resize_float(raw, TARGET)
t_rs = time.time() - t1
np.save(f"{OUT}/{name}_4k_f32.npy", r4k.astype(np.float32))
Image.fromarray(to_uint8(r4k)).save(f"{OUT}/{name}_4k.png", compress_level=1)

info = dict(model=name, file=MODEL_FILES[name], arch=d.architecture.name, scale=d.scale,
            raw_size=[raw.shape[1], raw.shape[0]], tile_plan=plan, overlap=overlap, border_pad=16,
            precision="fp32", threads=torch.get_num_threads(),
            inference_s=round(t_inf, 1), resize_s=round(t_rs, 1))
json.dump(info, open(f"{OUT}/{name}_timing.json", "w"), indent=1)
log(f"done inference {t_inf:.1f}s resize {t_rs:.1f}s")
