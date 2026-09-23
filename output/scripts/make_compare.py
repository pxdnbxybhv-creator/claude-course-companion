"""Per-region 100% comparison sheets (baseline + each model + blends)."""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

# (file key, box in 3840x2160 coords (left, top, right, bottom), Chinese title)
REGIONS = [
    ("region1-green-hair-face-flower-sword", (1260, 1330, 1720, 1640), "区域1 左侧绿发人物：脸、花饰、长剑"),
    ("region2-silver-hair-face", (2960, 1080, 3360, 1360), "区域2 右侧银发人物的脸"),
    ("region3-rock-brushstrokes", (1800, 300, 2300, 650), "区域3 中间岩壁厚涂笔触"),
    ("region4-dark-blue-gradient", (3300, 100, 3800, 450), "区域4 右上角深蓝暗部渐变"),
]


def load_rgb(path):
    if path.endswith(".npy"):
        a = np.load(path)
        return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    return Image.open(path).convert("RGB")


def stretch_levels(crops, gain=5.0):
    """Same linear levels stretch for every crop (for banding inspection only)."""
    lo = min(float(np.percentile(np.asarray(c), 0.5)) for _, c in crops)
    return [(lab, Image.fromarray(np.clip((np.asarray(c).astype(np.float32) - lo) * gain, 0, 255).astype(np.uint8)))
            for lab, c in crops], lo


def sheet(box, title, variants, out_path, ncols=3, zoom=1, stretch=None):
    """variants: list of (label, PIL image 3840x2160)."""
    crops = [(lab, im.crop(box)) for lab, im in variants]
    note = ""
    if stretch:
        crops, lo = stretch_levels(crops, stretch)
        note = f"暗部提亮 (值-{lo:.0f})×{stretch:g}，仅用于检查色带和噪点，不是成品效果"
    if zoom != 1:
        crops = [(lab, c.resize((c.width * zoom, c.height * zoom), Image.NEAREST)) for lab, c in crops]
    w, h = crops[0][1].size
    ncols = min(ncols, len(crops))
    nrows = math.ceil(len(crops) / ncols)
    pad, lab_h, title_h = 12, 40, 84 + (32 if note else 0)
    W = ncols * w + (ncols + 1) * pad
    H = title_h + nrows * (lab_h + h + pad) + pad
    canvas = Image.new("RGB", (W, H), (32, 32, 32))
    d = ImageDraw.Draw(canvas)
    f_title = ImageFont.truetype(FONT, 26)
    f_lab = ImageFont.truetype(FONT, 22)
    zoom_txt = "100% 原尺寸" if zoom == 1 else f"{zoom*100}% 最近邻放大（仅为看清细节）"
    d.text((pad, 10), title, font=f_title, fill=(235, 235, 235))
    d.text((pad, 46), f"框 {box}（3840×2160 坐标）  {zoom_txt}", font=f_lab, fill=(190, 190, 190))
    if note:
        d.text((pad, 78), note, font=f_lab, fill=(255, 150, 150))
    for i, (lab, c) in enumerate(crops):
        r, col = divmod(i, ncols)
        x = pad + col * (w + pad)
        y = title_h + r * (lab_h + h + pad)
        d.text((x + 2, y + 8), lab, font=f_lab, fill=(255, 214, 102))
        canvas.paste(c, (x, y + lab_h))
    canvas.save(out_path, optimize=True)
    return out_path
