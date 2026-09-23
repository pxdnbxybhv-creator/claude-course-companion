"""Deliverable comparison sheets for v2 (baseline vs v1 vs v2) in output/compare_v2/."""
from PIL import Image

from make_compare import REGIONS, sheet

O = "/tmp/upscale/out/"
DST = "/home/user/claude-course-companion/output/compare_v2/"
imgs = [("基准：Lanczos + USM", Image.open(O + "baseline_4k.png")),
        ("v1：CUGAN 70% + 基准 30%", Image.open("/home/user/claude-course-companion/output/IMG_1297_4K_AI.png")),
        ("★ v2：生成式重绘", Image.open("/home/user/claude-course-companion/output/IMG_1297_4K_v2.png"))]
tok = "baseline_vs_v1_vs_v2"
names = {"region1-green-hair-face-flower-sword": "region1-saya-face-flower-sword",
         "region2-silver-hair-face": "region2-insight-face",
         "region3-rock-brushstrokes": "region3-rock-brushstrokes",
         "region4-dark-blue-gradient": "region4-dark-blue-gradient"}
titles = {"region1-green-hair-face-flower-sword": "区域1 咲弥（左）：脸、白花、长剑",
          "region2-silver-hair-face": "区域2 洞烛（右）：脸"}
out = []
for key, box, title in REGIONS:
    t = titles.get(key, title)
    out.append(sheet(box, t, imgs, f"{DST}{names[key]}__{tok}.png", ncols=3))
    if key.startswith("region4"):
        out.append(sheet(box, t + "（提亮检查版）", imgs, f"{DST}{names[key]}-levels-x5-banding-check__{tok}.png",
                         ncols=3, stretch=5))
extra = [
    ((3033, 1093, 3257, 1317), "洞烛的脸（300% 放大）", "extra-insight-face-zoom300", 3, 3),
    ((1410, 1316, 1634, 1540), "咲弥的脸与右眼白花（300% 放大）", "extra-saya-face-zoom300", 3, 3),
    ((1296, 1440, 2040, 1600), "咲弥的长剑（200% 放大）", "extra-saya-long-sword-zoom200", 2, 1),
    ((2250, 300, 2750, 1000), "岩壁中段到暗部的过渡（100%）", "extra-rock-to-shadow", 1, 3),
    ((300, 250, 900, 700), "左上岩壁（100%）", "extra-rock-upper-left", 1, 3),
    ((2860, 1330, 3460, 1800), "洞烛的上身、手套与衣摆（100%）", "extra-insight-body", 1, 3),
    ((200, 1050, 1300, 1900), "咲弥的披风、裙摆与光环（100%）", "extra-saya-cape-dress", 1, 1),
]
for box, title, name, zoom, ncols in extra:
    out.append(sheet(box, title, imgs, f"{DST}{name}__{tok}.png", ncols=ncols, zoom=zoom))
print("\n".join(out))
