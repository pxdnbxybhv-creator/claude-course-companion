"""Write the deliverable comparison sheets into output/compare/."""
from make_compare import REGIONS, load_rgb, sheet

O = "/tmp/upscale/out/"
DST = "/home/user/claude-course-companion/output/compare/"
VARIANTS = [  # (label, file token, path)
    ("基准：Lanczos + USM", "baseline", O + "baseline_4k.png"),
    ("Real-CUGAN 2x conservative", "cugan2x", O + "realcugan2x_conservative_4k.png"),
    ("2x-AnimeSharpV4 (RCAN)", "animesharpv4", O + "animesharpv4_2x_rcan_4k.png"),
    ("4x-UltraSharp", "ultrasharp4x", O + "ultrasharp_4x_4k.png"),
    ("混合：CUGAN 80% + 基准 20%", "cugan80", O + "blend_realcugan2x_conservative_ai80_4k.png"),
    ("★ 最终：CUGAN 70% + 基准 30%", "cugan70-FINAL", O + "blend_realcugan2x_conservative_ai70_4k.png"),
    ("混合：CUGAN 60% + 基准 40%", "cugan60", O + "blend_realcugan2x_conservative_ai60_4k.png"),
    ("Real-CUGAN 2x no-denoise", "cugan2x-nodenoise", O + "realcugan2x_nodenoise_4k.png"),
]
SHORT = {
    "region1-green-hair-face-flower-sword": "region1-green-face-flower-sword",
    "region2-silver-hair-face": "region2-silver-face",
    "region3-rock-brushstrokes": "region3-rock-brushstrokes",
    "region4-dark-blue-gradient": "region4-dark-blue-gradient",
}
imgs = [(lab, load_rgb(p)) for lab, _, p in VARIANTS]
tokens = "_vs_".join(tok for _, tok, _ in VARIANTS)
written = []
for key, box, title in REGIONS:
    name = SHORT[key]
    written.append(sheet(box, title, imgs, f"{DST}{name}__{tokens}.png", ncols=4))
    if key.startswith("region2"):
        written.append(sheet(box, title + "（200% 放大版）", imgs, f"{DST}{name}-zoom200__{tokens}.png", ncols=4, zoom=2))
    if key.startswith("region4"):
        written.append(sheet(box, title + "（提亮检查版）", imgs, f"{DST}{name}-levels-x5-banding-check__{tokens}.png",
                             ncols=4, stretch=5))
written.append(sheet((2930, 1300, 3100, 1420), "附加：边缘白边检查（银发轮廓与背景）", imgs,
                     f"{DST}extra-edge-halo-check-silver-hair-zoom200__{tokens}.png", ncols=4, zoom=2))
written.append(sheet((3120, 1190, 3330, 1330), "附加：边缘检查（下巴、红领带、白衬衫、深色马甲）", imgs,
                     f"{DST}extra-edge-check-tie-chin-zoom200__{tokens}.png", ncols=4, zoom=2))
print("\n".join(written))
