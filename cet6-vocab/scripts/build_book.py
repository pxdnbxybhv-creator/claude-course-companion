#!/usr/bin/env python3
"""Merge the per-day PDFs into one book: bookmarks, page labels, link check.

usage: python3 scripts/build_book.py [--out dist/CET6-Thirty-Easy-Pieces.pdf] build/day01.pdf build/day02.pdf
Bookmarks come from build/dayNN.pages.json, written by scripts/render.cjs.
"""
import fitz, json, os, re, sys, argparse, warnings
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ROMAN = {1: 'I', 2: 'II', 3: 'III'}
PART_NAME = {1: '拆词术', 2: '语境术', 3: '钉牢术'}

ap = argparse.ArgumentParser()
ap.add_argument('pdfs', nargs='+')
ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'CET6-Thirty-Easy-Pieces.pdf'))
args = ap.parse_args()

book = fitz.open()
toc, labels, seen_parts, cursor = [], [], set(), 0
for pdf in sorted(args.pdfs):
    n = int(re.search(r'day(\d+)', os.path.basename(pdf)).group(1))
    day = json.load(open(os.path.join(ROOT, 'content', f'day{n:02d}.json')))
    pages = json.load(open(pdf.replace('.pdf', '.pages.json')))
    src = fitz.open(pdf)
    book.insert_pdf(src)
    # Chromium writes in-document links as named destinations, which insert_pdf
    # drops; re-create them as plain GoTo links shifted by this day's page offset.
    for i, spg in enumerate(src):
        for l in spg.get_links():
            if l['kind'] in (fitz.LINK_GOTO, fitz.LINK_NAMED) and l.get('page') is not None and l['page'] >= 0:
                book[cursor + i].insert_link({'kind': fitz.LINK_GOTO, 'from': l['from'],
                                              'page': cursor + l['page'], 'to': l.get('to', fitz.Point(0, 0))})
    part = day['part']
    if part not in seen_parts:
        seen_parts.add(part)
        toc.append([1, f"Part {ROMAN[part]} · {PART_NAME[part]}", cursor + 1])
        labels.append({'startpage': cursor, 'prefix': f'{ROMAN[part]}-', 'style': 'D', 'firstpagenum': 1})
    toc.append([2, f"Day {n} · {day['title']}", cursor + 1])
    placed = set()
    for i, pg in enumerate(pages):
        for lab in pg['labels']:
            key = re.sub(r'\s*Day \d+$', '', lab)
            if key in placed: continue
            placed.add(key)
            toc.append([3, lab, cursor + i + 1])
    cursor += src.page_count
    src.close()

book.set_toc(toc)
try:
    book.set_page_labels(labels)
except Exception as e:
    print('page labels skipped:', e)
os.makedirs(os.path.dirname(args.out), exist_ok=True)
book.save(args.out, garbage=4, deflate=True, clean=True)
links = [l for pg in book for l in pg.get_links() if l['kind'] == fitz.LINK_GOTO]
bad = sum(1 for l in links if not (0 <= l['page'] < book.page_count))
print(f"{book.page_count} pages, {len([t for t in toc if t[0]==3])} section bookmarks, "
      f"{len(links)} internal link(s), {bad} broken -> {os.path.relpath(args.out, ROOT)} "
      f"({round(os.path.getsize(args.out)/1e6, 2)} MB)")
