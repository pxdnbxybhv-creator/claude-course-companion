# Usage: python3 scripts/extract_wordlist.py  (expects the syllabus PDF as ./syllabus2016.pdf in the CWD; writes cet6_star_words.json/.txt and syllabus_words_all.json)
import fitz, json, re, sys, collections
doc = fitz.open('syllabus2016.pdf')
SUP = {'１':'¹','２':'²','３':'³'}
def norm(s):
    return (s.replace('Ｇ','-').replace('\U001001b3',"'").replace('．','.')
             .replace('（','(').replace('）',')'))
rows = []
for pno in range(20, 149):            # PDF pages 21..149 (book pages 16..144)
    page = doc[pno]
    words = page.get_text('words')     # x0,y0,x1,y1,text,block,line,word
    ws = []
    for x0,y0,x1,y1,t,b,l,w in words:
        t = t.strip()
        if not t: continue
        yc = (y0+y1)/2; h = y1-y0
        if yc < 60 or yc > 690: continue          # running header / page number band
        if x0 > 470: continue                      # side tab
        if re.fullmatch(r'[０-９]+', t) and h > 8.6: continue   # page number (superscript homograph digits are ~8.2 high)
        if '大纲' in t or '考试' in t: continue
        ws.append((x0, yc, h, t))
    ws.sort(key=lambda r: (r[1], r[0]))
    lines, cur, anchor = [], [], None
    for r in ws:
        if anchor is None or r[1]-anchor > 7:   # line pitch is 14.2; the ★ glyph inflates a word box by ~3
            if cur: lines.append(cur)
            cur, anchor = [r], r[1]
        else: cur.append(r)
    if cur: lines.append(cur)
    for ln in lines:
        ln.sort(key=lambda r: r[0])
        star = False; toks = []
        for x0,yc,h,t in ln:
            if t.startswith('★'):
                star = True; t = t[1:].strip()
                if not t: continue
            m = re.match(r'^([１２３])(.*)$', t)
            if m and h < 8.5 or (m and m.group(2)):
                if toks: toks[-1] += SUP[m.group(1)]
                t = m.group(2)
                if not t: continue
            toks.append(norm(t))
        merged = []
        for t in toks:
            if merged and (t.startswith('/') or merged[-1].endswith('/') or t == '/'):
                merged[-1] += t
            else: merged.append(t)
        if not merged: continue
        rows.append({'page': pno+1, 'book_page': pno-4, 'star': star, 'head': merged[0], 'family': merged[1:]})
stars = [r for r in rows if r['star']]
print('rows', len(rows), 'star', len(stars), 'family tokens', sum(len(r['family']) for r in rows), file=sys.stderr)
bad = [r for r in rows if any(re.search(r"[^A-Za-z/().'¹²³-]", t) for t in [r['head']]+r['family'])]
print('anomalous', len(bad), file=sys.stderr)
for r in bad: print('ANOM', r)
# duplicates
c = collections.Counter(r['head'] for r in rows)
print('dup heads', [k for k,v in c.items() if v>1][:30], file=sys.stderr)
json.dump(rows, open('syllabus_words_all.json','w'), ensure_ascii=False, indent=1)
for i, r in enumerate(stars): r['id'] = i+1
json.dump(stars, open('cet6_star_words.json','w'), ensure_ascii=False, indent=1)
with open('cet6_star_words.txt','w') as f:
    for r in stars: f.write(r['head'] + ('  |  ' + ' '.join(r['family']) if r['family'] else '') + '\n')
