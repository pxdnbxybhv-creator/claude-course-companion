#!/usr/bin/env python3
"""Look words up in ECDICT (phonetic / Chinese gloss / exam tags / Collins stars).

ECDICT is a large open English-Chinese dictionary (skywind3000/ECDICT, CC-BY / MIT data).
It is NOT committed to this repo; fetch it once:
    curl -sSL -o data/ecdict.csv https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
(or set ECDICT=/path/to/ecdict.csv). Used by the writer to draft and by the auditor to verify.

usage: python3 scripts/lookup.py verdict archive
       python3 scripts/lookup.py --check content/day01.json     # audit every card in a day file
"""
import csv, sys, os, json, re
csv.field_size_limit(10**7)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PATH = os.environ.get('ECDICT', os.path.join(ROOT, 'data', 'ecdict.csv'))
def load(words):
    want = {w.lower() for w in words}
    out = {}
    with open(PATH, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            w = row['word'].lower()
            if w in want: out[w] = row
    return out
def norm(h):
    h = re.sub(r'[¹²³]', '', h).split('/')[0]
    return re.sub(r'\((\w+)\)', r'\1', h).strip().lower()
if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--check':
        cards = []
        for f in args[1:]:
            d = json.load(open(f))
            cards += [c for s in d['scenes'] for c in s['cards']]
        rows = load([norm(c['head']) for c in cards])
        sys.path.insert(0, HERE)
        from ipa import ipa as cmu
        for c in cards:
            r = rows.get(norm(c['head']))
            tr = (r['translation'].replace('\\n', ' / ') if r else '?')
            print(f"{c['head']:<16} card={c['ipa']:<20} cmu={str(cmu(c['head'])):<20} ecdict=/{r['phonetic'] if r else '?'}/  tag={r['tag'] if r else '?'}")
            print(f"    card释义: {' / '.join(c['senses'])}")
            print(f"    ecdict  : {tr[:150]}")
    else:
        rows = load([norm(w) for w in args])
        for w in args:
            r = rows.get(norm(w))
            if not r: print(f'{w}: NOT FOUND'); continue
            print(f"== {r['word']}  /{r['phonetic']}/  tag={r['tag']} collins={r['collins']} oxford={r['oxford']} freq={r['bnc']}/{r['frq']}")
            print('  ' + r['translation'].replace('\\n', '\n  '))
            if r['definition']: print('  EN: ' + r['definition'].replace('\\n', ' | ')[:300])
