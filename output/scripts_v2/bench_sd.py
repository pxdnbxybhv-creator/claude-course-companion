import sys
import time

import torch

from sdtile import Refiner

base = sys.argv[1] if len(sys.argv) > 1 else "counterfeit_v30"
r = Refiner(base, dtype=torch.float32)
emb = torch.cat([r.embed("x"), r.embed("y")])


def step(dtype, lat=96, reps=2):
    x = torch.randn(2, 4, lat, lat, dtype=dtype)
    c = torch.rand(2, 3, lat * 8, lat * 8, dtype=dtype)
    e = emb.to(dtype)
    t = torch.tensor(500)
    best = 1e9
    with torch.inference_mode():
        for _ in range(reps):
            t0 = time.perf_counter()
            d, m = r.controlnet(x, t, encoder_hidden_states=e, controlnet_cond=c, conditioning_scale=0.8, return_dict=False)
            r.unet(x, t, encoder_hidden_states=e, down_block_additional_residuals=d, mid_block_additional_residual=m)
            best = min(best, time.perf_counter() - t0)
    return best


print(f"fp32  unet+cn, 768px tile, batch2 (CFG): {step(torch.float32):.1f}s", flush=True)
r.unet.to(torch.bfloat16); r.controlnet.to(torch.bfloat16)
print(f"bf16  unet+cn, 768px tile, batch2 (CFG): {step(torch.bfloat16):.1f}s", flush=True)
print(f"bf16  unet+cn, 512px tile, batch2 (CFG): {step(torch.bfloat16, 64):.1f}s", flush=True)
with torch.inference_mode():
    z = torch.randn(1, 4, 128, 128)
    t0 = time.perf_counter(); r.vae.decode(z); print(f"fp32 vae decode 1024px: {time.perf_counter() - t0:.1f}s", flush=True)
    im = torch.rand(1, 3, 1024, 1024)
    t0 = time.perf_counter(); r.vae.encode(im); print(f"fp32 vae encode 1024px: {time.perf_counter() - t0:.1f}s", flush=True)
