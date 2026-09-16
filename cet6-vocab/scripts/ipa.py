#!/usr/bin/env python3
"""ARPAbet (CMUdict) -> General-American IPA, used to draft and to audit the `ipa` field.

usage: python3 scripts/ipa.py word [word ...]
       python3 scripts/ipa.py --check content/day01.json      # compare cards against CMUdict
Words missing from CMUdict print NONE; the writer supplies those by hand and the auditor checks them.
"""
import sys, json, re
import cmudict

V = {'AA':'ɑ','AE':'æ','AH':'ʌ','AO':'ɔ','AW':'aʊ','AY':'aɪ','EH':'ɛ','ER':'ɜr','EY':'eɪ',
     'IH':'ɪ','IY':'i','OW':'oʊ','OY':'ɔɪ','UH':'ʊ','UW':'u'}
C = {'B':'b','CH':'tʃ','D':'d','DH':'ð','F':'f','G':'ɡ','HH':'h','JH':'dʒ','K':'k','L':'l','M':'m',
     'N':'n','NG':'ŋ','P':'p','R':'r','S':'s','SH':'ʃ','T':'t','TH':'θ','V':'v','W':'w','Y':'j','Z':'z','ZH':'ʒ'}
ONSET1 = set(C.values())
ONSET2 = {'pl','pr','pj','bl','br','bj','tr','tw','tj','dr','dw','dj','kl','kr','kw','kj','ɡl','ɡr','ɡw',
          'fl','fr','fj','θr','θw','sl','sw','sp','st','sk','sm','sn','sj','ʃr','vj','hj','mj','nj','lj'}
ONSET3 = {'spl','spr','str','skr','skw','spj','stj','skj'}
_D = cmudict.dict()

def arpa_to_ipa(phones):
    # a word with one vowel carries no stress mark; several primaries = compound, keep only the last
    nv = sum(1 for p in phones if re.fullmatch(r'[A-Z]+[0-2]', p) and p[:-1] in V)
    prim = [i for i, p in enumerate(phones) if p.endswith('1')]
    phones = list(phones)
    if nv <= 1:
        phones = [re.sub(r'[0-2]$', '', p) if p[:-1] in V else p for p in phones]
    elif len(prim) > 1:
        for i in prim[:-1]: phones[i] = phones[i][:-1] + '2'
    out = []
    for p in phones:
        m = re.fullmatch(r'([A-Z]+)([0-2]?)', p)
        base, stress = m.group(1), m.group(2)
        if base in V and stress == '': stress = '_'
        if base in V:
            s = V[base]
            if base == 'AH' and stress == '0': s = 'ə'
            if base == 'ER' and stress == '0': s = 'ər'
            out.append((s, stress))
        else:
            out.append((C.get(base, base), None))
    # place stress marks before the *legal* onset cluster of the stressed vowel
    marks = {'1': 'ˈ', '2': 'ˌ'}
    cons = set(C.values())
    text = []
    for s, stress in out:
        if stress in marks:
            run = 0
            while run < 3 and len(text) - run > 0 and text[len(text) - 1 - run] in cons: run += 1
            take = 0
            for n in (3, 2, 1):
                if n <= run and ''.join(text[len(text) - n:]) in (ONSET3 if n == 3 else ONSET2 if n == 2 else ONSET1):
                    take = n; break
            text.insert(len(text) - take, marks[stress])
        text.append(s)
    return ''.join(text)

def all_ipa(word):
    w = re.sub(r'[¹²³]', '', word).split('/')[0]
    w = re.sub(r'\((\w+)\)', r'\1', w).lower()
    prons = _D.get(w)
    if not prons: return []
    seen, out = set(), []
    for p in prons:
        v = '/' + arpa_to_ipa(p) + '/'
        if v not in seen: seen.add(v); out.append(v)
    return out

def ipa(word):
    v = all_ipa(word)
    return v[0] if v else None

if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--check':
        bad = 0
        for f in args[1:]:
            d = json.load(open(f))
            for s in d['scenes']:
                for c in s['cards']:
                    refs = all_ipa(c['head'])
                    if not refs: print(f"NONE  {c['head']:<18} card={c['ipa']}   (not in CMUdict — verify by hand)")
                    elif c['ipa'] not in refs:
                        print(f"DIFF  {c['head']:<18} card={c['ipa']:<22} cmudict={' | '.join(refs)}"); bad += 1
        print(f'{bad} differing')
    else:
        for w in args: print(w, ipa(w))
