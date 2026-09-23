"""Tiled (MultiDiffusion-style) SD1.5 + ControlNet-Tile img2img refiner for large images, CPU.

Every denoising step runs UNet+ControlNet on overlapping latent tiles (each with its own prompt)
and averages the noise predictions with feathered weights, so there are no tile seams.
"""
import math
import time

import numpy as np
import torch
from diffusers import (AutoencoderKL, ControlNetModel, DPMSolverMultistepScheduler,
                       StableDiffusionPipeline)
from PIL import Image

SD = "/tmp/upscale/models/sd"
BASES = {
    "counterfeit_v30": dict(single_file=f"{SD}/counterfeit_v30/Counterfeit-V3.0_fix_fp16.safetensors"),
    "meinamix_v11": dict(folder=f"{SD}/meinamix_v11"),
}
NEG = ("lowres, blurry, jpeg artifacts, worst quality, low quality, normal quality, watermark, text, "
       "signature, username, deformed, bad anatomy, extra fingers, mutated hands, poorly drawn face, "
       "disfigured, oversaturated, extra faces, extra people, confetti, glitter, sparkles, colorful spots, "
       "speckles, noise, flat color, posterization")


class Refiner:
    def __init__(self, base="counterfeit_v30", dtype=torch.bfloat16, vae="ft_mse"):
        torch.set_num_threads(4)
        spec = BASES[base]
        if "single_file" in spec:
            pipe = StableDiffusionPipeline.from_single_file(
                spec["single_file"], config=f"{SD}/sd15_configs", torch_dtype=torch.float32,
                safety_checker=None, requires_safety_checker=False, local_files_only=True)
        else:
            pipe = StableDiffusionPipeline.from_pretrained(
                spec["folder"], torch_dtype=torch.float32, safety_checker=None,
                requires_safety_checker=False, local_files_only=True)
        self.tokenizer, self.text_encoder = pipe.tokenizer, pipe.text_encoder
        self.unet = pipe.unet
        self.vae = (AutoencoderKL.from_pretrained(f"{SD}/vae_ft_mse", torch_dtype=torch.float32)
                    if vae == "ft_mse" else pipe.vae)
        self.controlnet = ControlNetModel.from_single_file(
            f"{SD}/controlnet_tile/control_v11f1e_sd15_tile_fp16.safetensors",
            config=f"{SD}/controlnet_tile", torch_dtype=torch.float32, local_files_only=True)
        self.dtype = dtype
        for m in (self.unet, self.controlnet):
            m.to(dtype)
            m.eval()
        self.vae.eval()
        self.text_encoder.eval()
        self.sched_cfg = pipe.scheduler.config
        del pipe

    # ---- text -----------------------------------------------------------------------------
    @torch.inference_mode()
    def embed(self, text):
        ids = self.tokenizer(text, padding="max_length", max_length=77, truncation=True,
                             return_tensors="pt").input_ids
        return self.text_encoder(ids)[0].to(self.dtype)

    # ---- vae ------------------------------------------------------------------------------
    @torch.inference_mode()
    def encode(self, img01, tile=1024):
        """img01: float HxWx3 in [0,1] -> latents (1,4,H/8,W/8), tiled with feathered overlap."""
        x = torch.from_numpy(np.ascontiguousarray(img01.transpose(2, 0, 1)))[None] * 2 - 1
        return self._tiled(x, tile, lambda t: self.vae.encode(t).latent_dist.mean * self.vae.config.scaling_factor,
                           down=8, ch=4, overlap=128)

    @torch.inference_mode()
    def decode(self, lat, tile=1024):
        f = lambda t: self.vae.decode(t / self.vae.config.scaling_factor).sample
        out = self._tiled(lat, tile // 8, f, down=1 / 8, ch=3, overlap=16)
        return ((out[0].clamp(-1, 1) + 1) / 2).permute(1, 2, 0).float().numpy()

    def _tiled(self, x, tile, fn, down, ch, overlap):
        """VAE encode/decode in overlapping tiles WITHOUT averaging: the VAE's GroupNorm/attention make
        each tile's result depend on the tile content, and averaging two different codes smears detail.
        Overlaps are split at their midline, so every output pixel comes from exactly one tile (the one
        it is furthest inside); the small tile-to-tile tint differences are low-frequency and are removed
        later by the wavelet colour fix."""
        H, W = x.shape[2:]
        ys, th = _starts(H, tile, overlap)
        xs, tw = _starts(W, tile, overlap)
        oh, ow = int(H / down), int(W / down)
        out = torch.zeros(1, ch, oh, ow)

        def cuts(starts, size, n):
            c = [0]
            for a, b in zip(starts[:-1], starts[1:]):
                c.append((b + a + size) // 2)  # midpoint of the overlap [b, a+size)
            c.append(n)
            return c
        cy, cx = cuts(ys, th, H), cuts(xs, tw, W)
        for iy, y0 in enumerate(ys):
            for ix, x0 in enumerate(xs):
                o = fn(x[:, :, y0:y0 + th, x0:x0 + tw]).float()
                a0, a1 = int((cy[iy] - y0) / down), int((cy[iy + 1] - y0) / down)
                b0, b1 = int((cx[ix] - x0) / down), int((cx[ix + 1] - x0) / down)
                out[:, :, int(cy[iy] / down):int(cy[iy + 1] / down), int(cx[ix] / down):int(cx[ix + 1] / down)] = \
                    o[:, :, a0:a1, b0:b1]
        return out

    # ---- diffusion ------------------------------------------------------------------------
    @torch.inference_mode()
    def refine(self, init01, control01, tile_prompt_fn, strength=0.4, steps=24, cfg=6.5,
               cn_scale=0.8, tile=96, overlap=32, seed=1234, log=print, init_latents=None, strength_map=None,
               noise=None):
        """init01/control01: HxWx3 float [0,1] (H, W multiples of 8). tile/overlap in latent px.
        tile_prompt_fn(x0, y0, x1, y1) -> prompt text for that tile (pixel coords).
        strength_map: optional HxW per-pixel strength (Differential-Diffusion style): a pixel is held at
        the re-noised original until the noise level has dropped to its own strength."""
        H, W = init01.shape[:2]
        if strength_map is not None:
            strength = float(strength_map.max())
            S = torch.nn.functional.avg_pool2d(torch.from_numpy(strength_map.astype(np.float32))[None, None], 8)
        sched = DPMSolverMultistepScheduler.from_config(self.sched_cfg, use_karras_sigmas=True,
                                                        algorithm_type="dpmsolver++")
        sched.set_timesteps(steps)
        t_start = int(round(steps * (1 - strength)))
        timesteps = sched.timesteps[t_start:]
        if hasattr(sched, "set_begin_index"):
            sched.set_begin_index(t_start)
        t0 = time.time()
        lat0 = init_latents if init_latents is not None else self.encode(init01)
        log(f"vae encode {time.time() - t0:.1f}s latent {tuple(lat0.shape)}")
        if noise is None:
            g = torch.Generator().manual_seed(seed)
            noise = torch.randn(lat0.shape, generator=g)
        latents = sched.add_noise(lat0, noise, timesteps[:1])
        h, w = lat0.shape[2:]
        ys, th = _starts(h, tile, overlap)
        xs, tw = _starts(w, tile, overlap)
        tiles = [(y0, x0) for y0 in ys for x0 in xs]
        ctrl = torch.from_numpy(np.ascontiguousarray(control01.transpose(2, 0, 1)))[None].to(self.dtype)
        neg = self.embed(NEG)
        embs, cache = {}, {}
        for (y0, x0) in tiles:
            p = tile_prompt_fn(x0 * 8, y0 * 8, (x0 + tw) * 8, (y0 + th) * 8)
            if p not in cache:
                cache[p] = self.embed(p)
            embs[(y0, x0)] = torch.cat([neg, cache[p]])
        weights = {(y0, x0): _weight(th, tw, overlap, y0 > 0, y0 + th < h, x0 > 0, x0 + tw < w) for (y0, x0) in tiles}
        log(f"{len(tiles)} tiles of {tw * 8}x{th * 8}px, {len(timesteps)} steps, {len(cache)} distinct prompts")
        for i, t in enumerate(timesteps):
            ts = time.time()
            if strength_map is not None:
                level = (steps - t_start - i) / steps
                locked = S < level - 1e-4
                if bool(locked.any()):
                    latents = torch.where(locked, sched.add_noise(lat0, noise, t.reshape(1)), latents)
            acc = torch.zeros_like(latents)
            wsum = torch.zeros(1, 1, h, w)
            for (y0, x0) in tiles:
                lt = latents[:, :, y0:y0 + th, x0:x0 + tw]
                inp = sched.scale_model_input(torch.cat([lt, lt]), t).to(self.dtype)
                cond = ctrl[:, :, y0 * 8:(y0 + th) * 8, x0 * 8:(x0 + tw) * 8]
                cond = torch.cat([cond, cond])
                emb = embs[(y0, x0)]
                down, mid = self.controlnet(inp, t, encoder_hidden_states=emb, controlnet_cond=cond,
                                            conditioning_scale=cn_scale, return_dict=False)
                eps = self.unet(inp, t, encoder_hidden_states=emb, down_block_additional_residuals=down,
                                mid_block_additional_residual=mid, return_dict=False)[0].float()
                eu, ec = eps.chunk(2)
                eps = eu + cfg * (ec - eu)
                wt = weights[(y0, x0)]
                acc[:, :, y0:y0 + th, x0:x0 + tw] += eps * wt
                wsum[:, :, y0:y0 + th, x0:x0 + tw] += wt
            latents = sched.step(acc / wsum, t, latents).prev_sample
            log(f"step {i + 1}/{len(timesteps)} t={int(t)} {time.time() - ts:.1f}s")
        t0 = time.time()
        out = self.decode(latents)
        log(f"vae decode {time.time() - t0:.1f}s")
        if strength_map is not None:  # fully protected pixels stay pixel-exact
            m = np.clip(strength_map / 0.12, 0, 1)[..., None]
            out = m * out + (1 - m) * init01
        return out


    @torch.inference_mode()
    def refine_seq(self, init01, control01, tile_prompt_fn, strength_map, steps=24, cfg=6.0, cn_scale=0.85,
                   tile_w=96, tile_h=104, overlap=16, ramp=8, seed=1234, log=print):
        """Sequential tiles with latent continuity: each tile is denoised on its own (no averaging of noise
        predictions, so textures stay crisp), while the band it shares with already-finished tiles is held at
        the re-noised finished latents (with a `ramp`-wide soft transition), so the new tile continues its
        neighbours seamlessly. Per-pixel strength as in refine()."""
        S_full = torch.nn.functional.avg_pool2d(torch.from_numpy(strength_map.astype(np.float32))[None, None], 8)
        t0 = time.time()
        canvas = self.encode(init01)
        log(f"vae encode {time.time() - t0:.1f}s latent {tuple(canvas.shape)}")
        h, w = canvas.shape[2:]
        ys, th = _starts(h, tile_h, overlap)
        xs, tw = _starts(w, tile_w, overlap)
        g = torch.Generator().manual_seed(seed)
        noise = torch.randn(canvas.shape, generator=g)
        ctrl = torch.from_numpy(np.ascontiguousarray(control01.transpose(2, 0, 1)))[None].to(self.dtype)
        neg = self.embed(NEG)
        cache = {}
        n, k = len(ys) * len(xs), 0
        log(f"{n} tiles of {tw * 8}x{th * 8}px (overlap {overlap * 8}px, ramp {ramp * 8}px)")
        for iy, y0 in enumerate(ys):
            for ix, x0 in enumerate(xs):
                k += 1
                ts = time.time()
                R = torch.ones(1, 1, th, tw)
                if ix > 0:
                    ov = xs[ix - 1] + tw - x0
                    r = ((torch.arange(tw) - (ov - ramp)).float() / ramp).clamp(0, 1)
                    R = torch.minimum(R, r[None, None, None, :])
                if iy > 0:
                    ov = ys[iy - 1] + th - y0
                    r = ((torch.arange(th) - (ov - ramp)).float() / ramp).clamp(0, 1)
                    R = torch.minimum(R, r[None, None, :, None])
                sl = (slice(None), slice(None), slice(y0, y0 + th), slice(x0, x0 + tw))
                S = S_full[sl] * R
                smax = float(S.max())
                if smax <= 1e-4:
                    continue
                sched = DPMSolverMultistepScheduler.from_config(self.sched_cfg, use_karras_sigmas=True,
                                                                algorithm_type="dpmsolver++")
                sched.set_timesteps(steps)
                t_start = int(round(steps * (1 - smax)))
                timesteps = sched.timesteps[t_start:]
                sched.set_begin_index(t_start)
                lat0 = canvas[sl].clone()
                nz = noise[sl]
                lat = sched.add_noise(lat0, nz, timesteps[:1])
                p = tile_prompt_fn(x0 * 8, y0 * 8, (x0 + tw) * 8, (y0 + th) * 8)
                if p not in cache:
                    cache[p] = self.embed(p)
                emb = torch.cat([neg, cache[p]])
                cond = ctrl[:, :, y0 * 8:(y0 + th) * 8, x0 * 8:(x0 + tw) * 8]
                cond = torch.cat([cond, cond])
                for i, t in enumerate(timesteps):
                    level = (steps - t_start - i) / steps
                    locked = S < level - 1e-4
                    if bool(locked.any()):
                        lat = torch.where(locked, sched.add_noise(lat0, nz, t.reshape(1)), lat)
                    inp = sched.scale_model_input(torch.cat([lat, lat]), t).to(self.dtype)
                    down, mid = self.controlnet(inp, t, encoder_hidden_states=emb, controlnet_cond=cond,
                                                conditioning_scale=cn_scale, return_dict=False)
                    eps = self.unet(inp, t, encoder_hidden_states=emb, down_block_additional_residuals=down,
                                    mid_block_additional_residual=mid, return_dict=False)[0].float()
                    eu, ec = eps.chunk(2)
                    lat = sched.step(eu + cfg * (ec - eu), t, lat).prev_sample
                wb = R * (S_full[sl] > 1e-4).float()
                canvas[sl] = wb * lat + (1 - wb) * canvas[sl]
                log(f"tile {k}/{n} at ({x0 * 8},{y0 * 8}) {len(timesteps)} steps {time.time() - ts:.1f}s")
        t0 = time.time()
        out = self.decode(canvas)
        log(f"vae decode {time.time() - t0:.1f}s")
        m = np.clip(strength_map / 0.12, 0, 1)[..., None]
        return m * out + (1 - m) * init01


    def refine_tiles_px(self, img01, tile_prompt_fn, strength_map, tile_w=768, tile_h=832, overlap=128, ramp=64,
                        log=print, **kw):
        """Ultimate-SD-Upscale-style sequential tiles in PIXEL space. Every tile runs a complete, self-consistent
        img2img (single VAE encode -> denoise -> single VAE decode): stitching SD-VAE latents from different
        encoder tiles breaks the few high-magnitude 'global' latent positions and degrades both the UNet and
        the decoder. Continuity: each tile's input already contains the finished neighbours in the overlap,
        which is locked (strength 0) and released over a `ramp`-px transition."""
        H, W = img01.shape[:2]
        canvas = img01.copy()
        ys, th = _starts(H, tile_h, overlap)
        xs, tw = _starts(W, tile_w, overlap)
        n, k = len(ys) * len(xs), 0
        log(f"{n} tiles of {tw}x{th}px, overlap >= {overlap}px, ramp {ramp}px")
        for iy, y0 in enumerate(ys):
            for ix, x0 in enumerate(xs):
                k += 1
                ts = time.time()
                R = np.ones((th, tw), np.float32)
                if ix > 0:
                    ov = xs[ix - 1] + tw - x0
                    R = np.minimum(R, np.clip((np.arange(tw) - (ov - ramp)) / ramp, 0, 1)[None, :])
                if iy > 0:
                    ov = ys[iy - 1] + th - y0
                    R = np.minimum(R, np.clip((np.arange(th) - (ov - ramp)) / ramp, 0, 1)[:, None])
                S = np.ascontiguousarray(strength_map[y0:y0 + th, x0:x0 + tw] * R)
                if S.max() <= 1e-4:
                    continue
                tin = np.ascontiguousarray(canvas[y0:y0 + th, x0:x0 + tw])
                p = tile_prompt_fn(x0, y0, x0 + tw, y0 + th)
                out = self.refine(tin, tin, lambda *a: p, strength_map=S, tile=max(th, tw) // 8, overlap=16,
                                  log=lambda m: None, **kw)
                canvas[y0:y0 + th, x0:x0 + tw] = out
                log(f"tile {k}/{n} at ({x0},{y0}) smax {S.max():.2f} {time.time() - ts:.1f}s")
        return canvas


    def refine_tiles_blend(self, img01, tile_prompt_fn, strength_map, tile=896, overlap=256, seed=1234, log=print,
                           **kw):
        """Independent self-consistent img2img per tile (single VAE encode/decode each), all starting from the
        same continuous source image and ONE shared noise field (so overlapping tiles start from identical
        noisy latents), merged in pixel space with wide cosine feathering."""
        H, W = img01.shape[:2]
        g = torch.Generator().manual_seed(seed)
        noise_full = torch.randn((1, 4, H // 8, W // 8), generator=g)
        ys, th = _starts(H, tile, overlap, mult=8)
        xs, tw = _starts(W, tile, overlap, mult=8)
        acc = np.zeros((H, W, 3), np.float32)
        wsum = np.zeros((H, W, 1), np.float32)
        n, k = len(ys) * len(xs), 0
        log(f"{n} tiles of {tw}x{th}px, overlap >= {overlap}px")
        for iy, y0 in enumerate(ys):
            for ix, x0 in enumerate(xs):
                k += 1
                ts = time.time()
                S = np.ascontiguousarray(strength_map[y0:y0 + th, x0:x0 + tw])
                tin = np.ascontiguousarray(img01[y0:y0 + th, x0:x0 + tw])
                if S.max() <= 1e-4:
                    out = tin
                else:
                    p = tile_prompt_fn(x0, y0, x0 + tw, y0 + th)
                    nz = noise_full[:, :, y0 // 8:(y0 + th) // 8, x0 // 8:(x0 + tw) // 8]
                    out = self.refine(tin, tin, lambda *a: p, strength_map=S, tile=max(th, tw) // 8, overlap=16,
                                      noise=nz, log=lambda m: None, **kw)
                wy = _cos_ramp(th, iy > 0, iy < len(ys) - 1, overlap)
                wx = _cos_ramp(tw, ix > 0, ix < len(xs) - 1, overlap)
                w = (wy[:, None] * wx[None, :])[..., None]
                acc[y0:y0 + th, x0:x0 + tw] += out * w
                wsum[y0:y0 + th, x0:x0 + tw] += w
                log(f"tile {k}/{n} at ({x0},{y0}) smax {S.max():.2f} {time.time() - ts:.1f}s")
        return acc / wsum


def _starts(n, tile, overlap, mult=1):
    if n <= tile:
        return [0], n
    k = math.ceil((n - overlap) / (tile - overlap))
    return [int(round(i * (n - tile) / (k - 1) / mult)) * mult for i in range(k)], tile


def _cos_ramp(n, lo, hi, ov):
    r = np.ones(n, np.float32)
    e = (0.5 - 0.5 * np.cos(np.pi * (np.arange(ov) + 0.5) / ov)).astype(np.float32)
    if lo:
        r[:ov] = np.minimum(r[:ov], e)
    if hi:
        r[-ov:] = np.minimum(r[-ov:], e[::-1])
    return r


def _weight(h, w, ov, top, bottom, left, right):
    def ramp(n, lo, hi):
        r = torch.ones(n)
        e = (torch.arange(ov) + 0.5) / ov
        if lo:
            r[:ov] = torch.minimum(r[:ov], e)
        if hi:
            r[-ov:] = torch.minimum(r[-ov:], e.flip(0))
        return r
    return (ramp(h, top, bottom)[:, None] * ramp(w, left, right)[None, :])[None, None]


def wavelet_color_fix(content, style, levels=5):
    """StableSR-style: keep the high frequencies of `content`, take the low frequencies of `style`.
    Both HxWx3 float [0,1]."""
    def lowpass(img):
        x = torch.from_numpy(np.ascontiguousarray(img.transpose(2, 0, 1)))[None].float()
        k = torch.tensor([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=torch.float32) / 16
        k = k[None, None].repeat(3, 1, 1, 1)
        for i in range(levels):
            d = 2 ** i
            x = torch.nn.functional.conv2d(torch.nn.functional.pad(x, (d, d, d, d), mode="replicate"), k,
                                           groups=3, dilation=d)
        return x[0].permute(1, 2, 0).numpy()
    return np.clip(content - lowpass(content) + lowpass(style), 0, 1)
