#!/usr/bin/env python3
"""下载讲义所需的字体与 paged.js（来自 jsdelivr），生成 fonts.css。"""
import concurrent.futures as cf
import os
import re
import subprocess

BASE = "https://cdn.jsdelivr.net/npm/"
PKGS = {"noto-serif-sc": ["400", "700"], "noto-sans-sc": ["400", "700"], "jetbrains-mono": ["400", "700"]}

os.makedirs("fonts", exist_ok=True)
os.makedirs("lib", exist_ok=True)
subprocess.run(["curl", "-sS", "--max-time", "60", "-o", "lib/paged.polyfill.min.js",
                BASE + "pagedjs@0.4.3/dist/paged.polyfill.min.js"], check=True)

css_all, jobs = [], []
for pkg, weights in PKGS.items():
    for w in weights:
        url = f"{BASE}@fontsource/{pkg}@5/{w}.css"
        css = subprocess.run(["curl", "-sS", "--max-time", "60", url], capture_output=True, text=True, check=True).stdout

        def repl(m, pkg=pkg):
            rel = m.group(1)
            fname = os.path.basename(rel)
            jobs.append((f"{BASE}@fontsource/{pkg}@5/{rel.lstrip('./')}", f"fonts/{fname}"))
            return f"url(./fonts/{fname})"

        css_all.append(re.sub(r"url\(\.?/?(files/[^)]+)\)", repl, css))
open("fonts.css", "w").write("\n".join(css_all))


def fetch(job):
    url, dst = job
    if os.path.exists(dst):
        return 0
    return subprocess.run(["curl", "-sS", "--max-time", "60", "-o", dst, url]).returncode


with cf.ThreadPoolExecutor(16) as ex:
    failed = sum(1 for rc in ex.map(fetch, jobs) if rc)
print(f"font files: {len(jobs)}, failed: {failed}")
