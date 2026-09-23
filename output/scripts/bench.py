import sys, time, json
import numpy as np, torch
from common import load_model, load_src_crop, tile_plan
torch.set_num_threads(4)
names = sys.argv[1:]
a = np.asarray(load_src_crop()).astype(np.float32) / 255.0
T = 256
tile = a[150:150 + T, 1100:1100 + T]            # rock-wall brush strokes
x = torch.from_numpy(np.ascontiguousarray(tile.transpose(2, 0, 1)))[None]
plan = tile_plan(1343, 2388, 448, 48)
res = {}
for name in names:
    d = load_model(name); m = d.model
    with torch.inference_mode():
        m(x)                                   # warm-up (oneDNN primitive creation)
        t0 = time.perf_counter(); y32 = m(x); t32 = time.perf_counter() - t0
        with torch.autocast("cpu", dtype=torch.bfloat16):
            m(x)
            t0 = time.perf_counter(); y16 = m(x).float(); t16 = time.perf_counter() - t0
    diff = (y16 - y32).abs() * 255
    mse = float(((y16.clamp(0, 1) - y32.clamp(0, 1)) ** 2).mean())
    psnr = 10 * np.log10(1 / mse) if mse > 0 else 99
    est32 = t32 / (T * T) * plan["px"] / 60
    est16 = t16 / (T * T) * plan["px"] / 60
    res[name] = dict(scale=d.scale, fp32_s=t32, bf16_s=t16, est_fp32_min=est32, est_bf16_min=est16,
                     bf16_vs_fp32_psnr=psnr, bf16_maxdiff255=float(diff.max()), bf16_meandiff255=float(diff.mean()))
    print(f"{name:26s} x{d.scale}  fp32 {t32:6.2f}s/256² -> full ~{est32:6.1f} min | bf16 {t16:6.2f}s -> ~{est16:6.1f} min "
          f"| bf16 vs fp32: PSNR {psnr:5.1f} dB, mean|d| {float(diff.mean()):.3f}/255, max {float(diff.max()):.1f}/255", flush=True)
json.dump(res, open(f"bench_{'_'.join(n[:6] for n in names)}.json", "w"), indent=1)
