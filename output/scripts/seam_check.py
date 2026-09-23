"""Tile-overlap consistency: run neighbouring tiles of the real layout and compare their
predictions where they overlap (8-bit units). Small differences => no visible seams after
feathered blending."""
import json
import sys

import numpy as np
import torch

from common import _layout, load_model, load_src_crop

torch.set_num_threads(4)
name = sys.argv[1]
d = load_model(name)
s = d.scale
img = np.asarray(load_src_crop()).astype(np.float32) / 255.0
P = 16
padded = np.pad(img, ((P, P), (P, P), (0, 0)), mode="reflect")
th, ys = _layout(padded.shape[0], 448, 48)
tw, xs = _layout(padded.shape[1], 448, 48)


def run(y0, x0):
    t = padded[y0:y0 + th, x0:x0 + tw]
    x = torch.from_numpy(np.ascontiguousarray(t.transpose(2, 0, 1)))[None]
    with torch.inference_mode():
        return np.clip(d.model(x)[0].numpy().transpose(1, 2, 0), 0, 1)


def stats(diff, inner):
    core = diff[inner] if inner is not None else diff
    return dict(mean=round(float(diff.mean()), 3), p99=round(float(np.percentile(diff, 99)), 2),
                inner_mean=round(float(core.mean()), 3), inner_p99=round(float(np.percentile(core, 99)), 2))


A = run(ys[1], xs[2])
B = run(ys[1], xs[3])  # right neighbour
C = run(ys[2], xs[2])  # bottom neighbour
e = 8 * s  # skip the outer 8 input px of each tile edge (lowest blend weight, most padding influence)
ov = (xs[2] + tw - xs[3]) * s
dh = np.abs(A[:, -ov:] - B[:, :ov]) * 255
ovv = (ys[1] + th - ys[2]) * s
dv = np.abs(A[-ovv:, :] - C[:ovv, :]) * 255
res = dict(model=name, overlap_out_px=[ov, ovv],
           horizontal=stats(dh, (slice(None), slice(e, ov - e))),
           vertical=stats(dv, (slice(e, ovv - e), slice(None))))
print(json.dumps(res))
json.dump(res, open(f"/tmp/upscale/out/{name}_seam.json", "w"), indent=1)
