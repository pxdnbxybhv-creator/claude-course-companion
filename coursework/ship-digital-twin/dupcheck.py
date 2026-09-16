# -*- coding: utf-8 -*-
import re, io, glob, os, subprocess, html
from collections import defaultdict

def strip_html(b):
    try: t = b.decode('utf-8')
    except: 
        try: t = b.decode('gb18030', errors='ignore')
        except: t = b.decode('latin-1', errors='ignore')
    t = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', t)
    t = re.sub(r'(?s)<[^>]+>', ' ', t)
    return html.unescape(t)

def norm(t):
    # keep CJK, letters, digits; drop whitespace & punctuation so matching is punctuation-insensitive
    return re.sub(r'[^一-鿿A-Za-z0-9]', '', t)

corpus = {}
for f in glob.glob('sources/*.md'): corpus[os.path.basename(f)] = io.open(f, encoding='utf-8').read()
for f in glob.glob('research/raw/*.html'): corpus['raw/'+os.path.basename(f)] = strip_html(open(f,'rb').read())
for f in glob.glob('research/raw2/*.bin'):
    b = open(f,'rb').read()
    if not b: continue
    if b[:4] == b'%PDF':
        t = subprocess.run(['pdftotext', f, '-'], capture_output=True).stdout.decode('utf-8', errors='ignore')
    else:
        t = strip_html(b)
    corpus['raw2/'+os.path.basename(f)] = t
# also the two journal PDFs downloaded earlier
for f in glob.glob('/root/.claude/projects/-home-user-claude-course-companion/2b5d1c31-5830-5baf-a224-028a05616558/tool-results/*.pdf'):
    corpus['pdf/'+os.path.basename(f)] = subprocess.run(['pdftotext', f, '-'], capture_output=True).stdout.decode('utf-8', errors='ignore')

d = io.open('content.txt', encoding='utf-8').read()
parts = dict(re.findall(r'==([A-Z]+)==\n(.*?)(?=\n==[A-Z]+==|\Z)', d, flags=re.S))
paper_raw = parts['TITLE'] + '\n' + parts['ABSTRACT'] + '\n' + '\n'.join(l for l in parts['BODY'].split('\n') if not l.startswith('#'))
# map normalized index -> raw index for reporting
raw_idx = [i for i, ch in enumerate(paper_raw) if re.match(r'[一-鿿A-Za-z0-9]', ch)]
P = norm(paper_raw)
N = len(P)
K = 13
# index corpus k-grams
gram_src = defaultdict(set)
for name, t in corpus.items():
    T = norm(t)
    for i in range(len(T) - K + 1):
        gram_src[T[i:i+K]].add(name)
# find maximal matched runs in paper
covered = [False]*N
hits = []
i = 0
while i <= N - K:
    g = P[i:i+K]
    if g in gram_src:
        srcs = gram_src[g]
        j = i
        while j <= N - K and P[j:j+K] in gram_src and (gram_src[P[j:j+K]] & srcs):
            srcs = srcs & gram_src[P[j:j+K]]
            j += 1
        end = j + K - 1
        for k in range(i, end): covered[k] = True
        hits.append((end - i, i, end, sorted(srcs)))
        i = end
    else:
        i += 1
hits.sort(reverse=True)
tot = sum(covered)
print(f'正文+摘要有效字符数 {N}，连续{K}字以上与来源重合的字符数 {tot}，估算重复率 {100*tot/N:.1f}%')
print(f'重合片段数 {len(hits)}')
for L, a, b, srcs in hits:
    seg = paper_raw[raw_idx[a]:raw_idx[b-1]+1]
    print(f'--- {L}字 | 来源: {", ".join(srcs)[:80]}\n    {seg}')
