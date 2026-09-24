#!/usr/bin/env python3
"""Build the self-hosted, subsetted web fonts for 半亩 · Half-Acre.

    npm run fonts                 # = python3 scripts/build_fonts.py
    python3 scripts/build_fonts.py --check   # exit 1 if the committed fonts miss a character

Sources are downloaded once into .cache/fonts (idempotent; delete the folder to refresh):

  * LXGW WenKai Regular (OFL) from the npm package lxgw-wenkai-webfont@1.7.0, which ships the
    font only as ~100 unicode-range slices. We fetch just the slices that hold our characters,
    subset each one, and merge them back into a single font with fontTools.merge.
  * Ma Shan Zheng (OFL) and Cormorant Garamond (OFL, variable wght) from google/fonts.

Character set = every CJK character / full-width or typographic punctuation found in
src/**/*.{ts,tsx,css}, index.html and scripts/brush_chars.txt, plus ASCII and a base set.

Outputs (fonts live under src/ so that Vite fingerprints them in the normal build and inlines
them as data: URLs in the single-file build):

  src/assets/fonts/wenkai.woff2        LXGW WenKai — every character the app itself uses
  src/assets/fonts/wenkai-common.woff2 LXGW WenKai — the most frequent Chinese characters not in
                                       the file above (for habit names the user types). Declared
                                       with a unicode-range, so browsers fetch it only on demand.
  src/assets/fonts/mashanzheng.woff2   Ma Shan Zheng — the display set (scripts/brush_chars.txt:
                                       tab glyphs, titles, plants, solar terms, dates, seals)
  src/assets/fonts/mashanzheng-ext.woff2
                                       Ma Shan Zheng — every other hanzi in the source (the poems the
                                       scroll poster brushes); unicode-range, so fetched on demand
  src/assets/fonts/cormorant.woff2     Cormorant Garamond, variable 300–700, Latin
  src/assets/fonts/cormorant-italic.woff2
  src/styles/fonts.css                 the @font-face rules (generated)
  public/fonts/*-OFL.txt               licence texts, shipped with the site

Re-run whenever new Chinese text lands in the source (the --check mode tells you when).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import logging
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger, Options as MergeOptions
from fontTools.ttLib import TTFont

logging.getLogger('fontTools').setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'fonts'
OUT = ROOT / 'src' / 'assets' / 'fonts'
CSS_OUT = ROOT / 'src' / 'styles' / 'fonts.css'
LICENSE_OUT = ROOT / 'public' / 'fonts'
BRUSH_CHARS = ROOT / 'scripts' / 'brush_chars.txt'

WENKAI_PKG = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0'
GFONTS = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl'
# google/fonts is fetched from its main branch; these hashes pin what the committed fonts were
# built from, so a changed upstream file is reported instead of silently altering the output.
KNOWN_SHA256 = {
    'MaShanZheng-Regular.ttf': '6d2546bb189c732a8ca29af9e22457b152387d158aa459e4ac2ce1e51788b7fb',
    'CormorantGaramond[wght].ttf': 'b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0',
    'CormorantGaramond-Italic[wght].ttf': '0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d',
}
# Jun Da's character frequency list (Modern Chinese corpus), via the `hanzi` npm package.
# Only used at build time, to pick which extra characters go into wenkai-common.woff2.
FREQ_URL = 'https://cdn.jsdelivr.net/npm/hanzi@3.2.0/lib/data/frequencyjunda.txt.js'

# How many of the most frequent characters to make available for user-typed text.
COMMON_TOP_N = 3500

# Base set that is always included (numbers, dates, punctuation), whether or not the
# source happens to use it today.
BASE_CJK = (
    '〇零一二三四五六七八九十廿卅百千万亿两年月日时分秒周天今明昨初上中下旬'
    '，。、；：？！“”‘’（）《》〈〉「」『』【】〔〕…—～·・／＋－＝％＃＆＊＠'
    '０１２３４５６７８９'
)
# Typographic punctuation that WenKai should carry for mixed text.
BASE_PUNCT = '–—‘’“”…‧·•′″※→←↑↓×÷−±≈≠≤≥°℃'

# Blocks that the lazily loaded common-character face is declared for.
HAN_BLOCKS = [(0x3000, 0x303F), (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0xFF00, 0xFFEF)]

# Google Fonts' "latin" subset (+ a few typographic extras).
LATIN_RANGES = [
    (0x0000, 0x00FF), (0x0131, 0x0131), (0x0152, 0x0153), (0x02BB, 0x02BC), (0x02C6, 0x02C6),
    (0x02DA, 0x02DA), (0x02DC, 0x02DC), (0x0304, 0x0304), (0x0308, 0x0308), (0x0329, 0x0329),
    (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212),
    (0x2215, 0x2215), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD),
]


def is_cjkish(cp: int) -> bool:
    """Characters that belong in the Chinese text/display fonts."""
    return (
        0x2E80 <= cp <= 0x2FDF  # CJK radicals
        or 0x3000 <= cp <= 0x303F  # CJK symbols & punctuation
        or 0x3100 <= cp <= 0x312F  # bopomofo
        or 0x31C0 <= cp <= 0x31EF  # CJK strokes
        or 0x3200 <= cp <= 0x33FF  # enclosed CJK, compatibility
        or 0x3400 <= cp <= 0x4DBF  # ext A
        or 0x4E00 <= cp <= 0x9FFF  # unified ideographs
        or 0xF900 <= cp <= 0xFAFF  # compatibility ideographs
        or 0xFE10 <= cp <= 0xFE1F  # vertical forms
        or 0xFE30 <= cp <= 0xFE4F  # CJK compatibility forms
        or 0xFF00 <= cp <= 0xFFEF  # half/full-width forms
        or 0x20000 <= cp <= 0x3FFFF  # ext B+
    )


def is_han(cp: int) -> bool:
    return 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF or cp >= 0x20000


# ---------------------------------------------------------------------------------------------
# downloads


def fetch(url: str, dest: Path) -> Path:
    """Download url to dest unless it is already cached."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + '.part')
    print(f'  ↓ {url}')
    if shutil.which('curl'):
        # curl honours the proxy / CA configuration of the environment.
        subprocess.run(['curl', '-sSLf', '--retry', '3', '-o', str(tmp), url], check=True)
    else:
        with urllib.request.urlopen(url, timeout=60) as r, open(tmp, 'wb') as f:
            shutil.copyfileobj(r, f)
    tmp.replace(dest)
    want = KNOWN_SHA256.get(dest.name)
    if want and hashlib.sha256(dest.read_bytes()).hexdigest() != want:
        print(f'  ! {dest.name} differs from the version the committed fonts were built from '
              f'(upstream changed); check the output, then update KNOWN_SHA256')
    return dest


# ---------------------------------------------------------------------------------------------
# character collection


def source_files() -> list[Path]:
    files = [ROOT / 'index.html']
    for ext in ('ts', 'tsx', 'css'):
        files += (ROOT / 'src').rglob(f'*.{ext}')
    return [f for f in files if f.is_file() and f != CSS_OUT]


def read_brush_chars() -> set[str]:
    if not BRUSH_CHARS.exists():
        return set()
    out: set[str] = set()
    for line in BRUSH_CHARS.read_text(encoding='utf-8').splitlines():
        if line.lstrip().startswith('#'):
            continue
        out |= {c for c in line if not c.isspace()}
    return out


def collect_used() -> set[str]:
    used: set[str] = set()
    for f in source_files():
        text = f.read_text(encoding='utf-8', errors='replace')
        used |= {c for c in text if is_cjkish(ord(c)) or c in BASE_PUNCT}
    return used


def ascii_chars() -> set[str]:
    return {chr(c) for c in range(0x20, 0x7F)}


def latin_chars() -> set[int]:
    return {cp for a, b in LATIN_RANGES for cp in range(a, b + 1)}


def load_frequency() -> list[str]:
    js = fetch(FREQ_URL, CACHE / 'frequencyjunda.txt.js').read_text(encoding='utf-8')
    chars = []
    for line in js.splitlines():
        parts = line.split('\t')
        if len(parts) > 2 and len(parts[1]) == 1:
            chars.append(parts[1])
    return chars


# ---------------------------------------------------------------------------------------------
# helpers


def parse_unicode_range(spec: str) -> set[int]:
    cps: set[int] = set()
    for part in spec.split(','):
        part = part.strip().upper().removeprefix('U+')
        if not part:
            continue
        if '?' in part:
            lo, hi = int(part.replace('?', '0'), 16), int(part.replace('?', 'F'), 16)
        elif '-' in part:
            lo_s, hi_s = part.split('-')
            lo, hi = int(lo_s, 16), int(hi_s, 16)
        else:
            lo = hi = int(part, 16)
        cps.update(range(lo, hi + 1))
    return cps


def to_unicode_range(cps: set[int]) -> str:
    """Compact CSS unicode-range for a set of code points."""
    out: list[str] = []
    s = sorted(cps)
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[j + 1] == s[j] + 1:
            j += 1
        out.append(f'U+{s[i]:x}' if i == j else f'U+{s[i]:x}-{s[j]:x}')
        i = j + 1
    return ', '.join(out)


def subset_options(features: list[str] | str = '*') -> subset.Options:
    o = subset.Options()
    o.flavor = None
    o.layout_features = features if isinstance(features, list) else ['*']
    o.hinting = False  # CJK hinting is huge and modern rasterisers do not need it
    o.desubroutinize = True
    o.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep copyright + licence strings
    o.name_languages = ['*']
    o.notdef_outline = True
    o.recalc_timestamp = False
    o.drop_tables += ['DSIG', 'gasp']
    return o


def load_font(path) -> TTFont:
    # recalcTimestamp=False keeps head.modified from the source, so rebuilding is reproducible.
    return TTFont(path, recalcTimestamp=False)


def do_subset(font: TTFont, cps: set[int], features: list[str] | str = '*') -> TTFont:
    s = subset.Subsetter(options=subset_options(features))
    s.populate(unicodes=sorted(cps))
    s.subset(font)
    return font


def save_woff2(font: TTFont, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf, reorderTables=False)
    data = buf.getvalue()
    if not dest.exists() or dest.read_bytes() != data:
        dest.write_bytes(data)
    return len(data)


def cmap_of(path_or_font) -> set[int]:
    font = path_or_font if isinstance(path_or_font, TTFont) else load_font(path_or_font)
    return set(font.getBestCmap().keys())


def write_license(src: Path, name: str, copyright_line: str) -> None:
    LICENSE_OUT.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding='utf-8')
    if copyright_line and copyright_line not in text:
        text = f'{copyright_line}\n\n{text}'
    dest = LICENSE_OUT / f'{name}-OFL.txt'
    if not dest.exists() or dest.read_text(encoding='utf-8') != text:
        dest.write_text(text, encoding='utf-8')


# ---------------------------------------------------------------------------------------------
# WenKai: merge unicode-range slices


def wenkai_slices() -> list[tuple[str, set[int]]]:
    css = fetch(f'{WENKAI_PKG}/lxgwwenkai-regular.css', CACHE / 'lxgwwenkai-regular.css').read_text()
    blocks = re.findall(
        r"src:\s*url\('\./files/(lxgwwenkai-regular-subset-\d+\.woff2)'\)[^}]*?unicode-range:\s*([^;}]+)",
        css,
    )
    if not blocks:
        raise SystemExit('could not parse lxgwwenkai-regular.css')
    return [(name, parse_unicode_range(spec)) for name, spec in blocks]


def build_wenkai(cps: set[int], tmp: Path, label: str) -> tuple[TTFont, set[int]]:
    """Subset the needed slices and merge them into one font covering `cps`."""
    parts: list[Path] = []
    for name, rng in wenkai_slices():
        want = cps & rng
        if not want:
            continue
        src = fetch(f'{WENKAI_PKG}/files/{name}', CACHE / 'lxgw' / name)
        font = load_font(src)
        want &= cmap_of(font)
        if not want:
            continue
        do_subset(font, want)
        font.flavor = None
        p = tmp / f'{label}-{len(parts):03d}.ttf'
        font.save(p)
        parts.append(p)
    if not parts:
        raise SystemExit(f'no WenKai glyphs for {label}')
    if len(parts) == 1:
        merged = load_font(parts[0])
    else:
        opts = MergeOptions()
        opts.drop_tables = ['vmtx', 'vhea', 'DSIG', 'gasp']
        merged = Merger(options=opts).merge([str(p) for p in parts])
        # fontTools.merge stamps head.created/modified with the current time; keep the source's.
        first = load_font(parts[0])['head']
        merged['head'].created, merged['head'].modified = first.created, first.modified
        merged.recalcTimestamp = False
    # A final pass drops anything the merge carried over that we do not need and normalises tables.
    p = tmp / f'{label}-merged.ttf'
    merged.save(p)
    merged = load_font(p)
    covered = cmap_of(merged)
    do_subset(merged, cps & covered)
    return merged, cps & covered


# ---------------------------------------------------------------------------------------------
# CSS


def font_face(family: str, file: str, *, weight='400', style='normal', urange: str | None = None) -> str:
    lines = [
        '@font-face {',
        f"  font-family: '{family}';",
        f'  font-style: {style};',
        f'  font-weight: {weight};',
        '  font-display: swap;',
        f"  src: url('../assets/fonts/{file}') format('woff2');",
    ]
    if urange:
        lines.append(f'  unicode-range: {urange};')
    lines.append('}')
    return '\n'.join(lines)


# ---------------------------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='only verify that the built fonts cover the source text')
    args = ap.parse_args()

    used = collect_used() | read_brush_chars()
    base = set(BASE_CJK) | set(BASE_PUNCT)
    text_chars = used | base | ascii_chars()
    brush_display = read_brush_chars() | set(BASE_CJK) | ascii_chars()
    used_han = {c for c in used if is_han(ord(c))}

    if args.check:
        absent_file = OUT / 'absent.txt'
        known_absent = set(absent_file.read_text(encoding='utf-8')) if absent_file.exists() else set()
        problems = []
        for files, want in (
            (['wenkai.woff2'], text_chars),
            (['mashanzheng.woff2'], read_brush_chars()),
            (['mashanzheng.woff2', 'mashanzheng-ext.woff2'], used_han),
        ):
            have: set[int] = set()
            for name in files:
                if not (OUT / name).exists():
                    print(f'✗ src/assets/fonts/{name} is missing — run `npm run fonts`')
                    return 1
                have |= cmap_of(OUT / name)
            miss = sorted(c for c in want if is_cjkish(ord(c)) and ord(c) not in have and c not in known_absent)
            if miss:
                problems.append(f'{" + ".join(files)} lacks: {"".join(miss)}')
        if problems:
            print('✗ fonts are out of date — run `npm run fonts`\n  ' + '\n  '.join(problems))
            return 1
        print(f'✓ fonts cover all {sum(is_cjkish(ord(c)) for c in text_chars)} CJK characters in the source')
        return 0

    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    print(f'characters: {len(text_chars)} text ({len(used_han)} hanzi), {len(brush_display)} brush display')

    sizes: dict[str, int] = {}
    absent: set[str] = set()
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # --- LXGW WenKai: core (everything the app uses) ----------------------------------------
        core_cps = {ord(c) for c in text_chars}
        wk, core_cov = build_wenkai(core_cps, tmp, 'core')
        absent |= {chr(c) for c in core_cps - core_cov if is_cjkish(c)}
        sizes['wenkai.woff2'] = save_woff2(wk, OUT / 'wenkai.woff2')
        copyright_wk = wk['name'].getDebugName(0) or 'Copyright 2021-2024 LXGW'

        # --- LXGW WenKai: common characters for user-typed text (lazy) -------------------------
        freq = load_frequency()
        common = {ord(c) for c in freq[:COMMON_TOP_N]} - core_cov
        common |= {ord(c) for c in '，。、；：？！“”（）《》…—·'} - core_cov
        wkc, common_cov = build_wenkai(common, tmp, 'common')
        sizes['wenkai-common.woff2'] = save_woff2(wkc, OUT / 'wenkai-common.woff2')

        # --- Ma Shan Zheng: display set (eager) + the rest of the source's hanzi (lazy) ----------
        msz_src = fetch(f'{GFONTS}/mashanzheng/MaShanZheng-Regular.ttf', CACHE / 'MaShanZheng-Regular.ttf')
        msz_all = cmap_of(load_font(msz_src))
        msz_cov = {ord(c) for c in brush_display} & msz_all
        absent |= {c for c in brush_display | used_han if is_cjkish(ord(c)) and ord(c) not in msz_all}
        msz = do_subset(load_font(msz_src), msz_cov)
        sizes['mashanzheng.woff2'] = save_woff2(msz, OUT / 'mashanzheng.woff2')
        copyright_msz = msz['name'].getDebugName(0)
        msz_ext_cov = ({ord(c) for c in used_han} & msz_all) - msz_cov
        if msz_ext_cov:
            sizes['mashanzheng-ext.woff2'] = save_woff2(do_subset(load_font(msz_src), msz_ext_cov), OUT / 'mashanzheng-ext.woff2')

        # --- Cormorant Garamond (variable wght 300–700) -------------------------------------
        latin = latin_chars()
        feats = ['kern', 'liga', 'clig', 'calt', 'onum', 'lnum', 'pnum', 'tnum', 'smcp', 'c2sc', 'frac', 'ordn', 'sups', 'mark', 'mkmk', 'ccmp', 'locl']
        copyright_cg = ''
        for style, fname, out in (
            ('normal', 'CormorantGaramond[wght].ttf', 'cormorant.woff2'),
            ('italic', 'CormorantGaramond-Italic[wght].ttf', 'cormorant-italic.woff2'),
        ):
            url_name = fname.replace('[', '%5B').replace(']', '%5D')
            src = fetch(f'{GFONTS}/cormorantgaramond/{url_name}', CACHE / fname)
            cg = load_font(src)
            do_subset(cg, latin & cmap_of(cg), feats)
            sizes[out] = save_woff2(cg, OUT / out)
            copyright_cg = cg['name'].getDebugName(0)

    # Characters the source fonts lack (they use the system fallback); --check tolerates these.
    absent_file = OUT / 'absent.txt'
    if absent:
        absent_file.write_text(''.join(sorted(absent)) + '\n', encoding='utf-8')
    elif absent_file.exists():
        absent_file.unlink()

    # --- licences ----------------------------------------------------------------------------
    write_license(fetch(f'{WENKAI_PKG}/OFL.txt', CACHE / 'OFL-LXGWWenKai.txt'), 'LXGWWenKai', copyright_wk)
    write_license(fetch(f'{GFONTS}/mashanzheng/OFL.txt', CACHE / 'OFL-MaShanZheng.txt'), 'MaShanZheng', copyright_msz)
    write_license(fetch(f'{GFONTS}/cormorantgaramond/OFL.txt', CACHE / 'OFL-CormorantGaramond.txt'), 'CormorantGaramond', copyright_cg)

    # --- CSS -----------------------------------------------------------------------------------
    # Lazy faces claim every Han / CJK-punctuation code point that their eager sibling lacks.
    # (Listing the lazy file's own characters exactly would cost ~25 KB of render-blocking CSS;
    # the complement of the small eager set is a few KB. A character in neither file costs one
    # on-demand download, then falls back to the next family in the stack.)
    han = {cp for a, b in HAN_BLOCKS for cp in range(a, b + 1)}
    faces = [
        '/* Generated by scripts/build_fonts.py (`npm run fonts`) — do not edit by hand.\n'
        ' * Self-hosted, subsetted fonts (SIL Open Font License 1.1; see public/fonts/*-OFL.txt).\n'
        ' * Relative URLs, so Vite fingerprints the files (and inlines them in the single-file build).\n'
        ' * The faces with a unicode-range are downloaded only when one of their characters is shown:\n'
        ' * wenkai-common = frequent hanzi for text the user types; mashanzheng-ext = the poems. */',
        font_face('LXGW WenKai', 'wenkai.woff2'),
        font_face('LXGW WenKai', 'wenkai-common.woff2', urange=to_unicode_range(han - core_cov)),
        font_face('Ma Shan Zheng', 'mashanzheng.woff2'),
    ]
    if msz_ext_cov:
        faces.append(font_face('Ma Shan Zheng', 'mashanzheng-ext.woff2', urange=to_unicode_range(han - msz_cov)))
    latin_range = to_unicode_range(latin)
    faces += [
        font_face('Cormorant Garamond', 'cormorant.woff2', weight='300 700', urange=latin_range),
        font_face('Cormorant Garamond', 'cormorant-italic.woff2', weight='300 700', style='italic', urange=latin_range),
    ]
    css = '\n\n'.join(faces) + '\n'
    stale = OUT / 'mashanzheng-ext.woff2'
    if not msz_ext_cov and stale.exists():
        stale.unlink()
    if not CSS_OUT.exists() or CSS_OUT.read_text(encoding='utf-8') != css:
        CSS_OUT.write_text(css, encoding='utf-8')

    # --- report ------------------------------------------------------------------------------
    lazy = {'wenkai-common.woff2', 'mashanzheng-ext.woff2'}
    print()
    for name, n in sizes.items():
        print(f'  {name:<24} {n / 1024:8.1f} KB{"  (on demand)" if name in lazy else ""}')
    eager = sum(n for k, n in sizes.items() if k not in lazy)
    print(f'  {"total":<24} {sum(sizes.values()) / 1024:8.1f} KB  ({eager / 1024:.1f} KB eager)')
    print(f'  WenKai {len(core_cov)} + {len(common_cov)} code points; Ma Shan Zheng {len(msz_cov)} + {len(msz_ext_cov)}')
    if absent:
        print(f'  not in the source fonts (system fallback): {"".join(sorted(absent))}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
