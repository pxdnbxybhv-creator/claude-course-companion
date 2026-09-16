#!/usr/bin/env python3
"""content/dayNN.json -> build/dayNN.html (Jinja2).

The writer supplies the dialogue, CRUX, cards, boxes, exercises and summary.
Everything mechanical is generated here: today's self-test, the spaced-review
queue (DESIGN.md 4.5), the answer page, and the today's-map table.

usage: python3 scripts/render.py content/day01.json [content/day02.json ...]
"""
import json, os, sys, re
from jinja2 import Environment, FileSystemLoader, select_autoescape

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
STUDY_DAYS = [d for d in range(1, 31) if d % 10]
GAPS = [(1, 'en2zh', 1.0, '英→中快速过', 6), (3, 'zh2en', 0.5, '中→英默写', 5),
        (7, 'cloze', 0.5, '句子填空', 5), (14, 'discriminate', 1 / 3, '辨析 / 选词', 4)]
SCENE_TAG = {'roots': 'Scene 1', 'theme': 'Scene 2', 'freebies': 'Scene 3', 'orphans': 'Scene 4'}

def next_study(d):
    return next((x for x in STUDY_DAYS if x >= d), None)

def cards_of(day):
    return [c for s in day['scenes'] for c in s['cards']]

def load_all():
    out = {}
    for f in sorted(os.listdir(os.path.join(ROOT, 'content'))):
        m = re.fullmatch(r'day(\d\d)\.json', f)
        if m: out[int(m.group(1))] = json.load(open(os.path.join(ROOT, 'content', f)))
    return out

def reviews_for(T, all_days):
    """Which earlier days come back today, in which form. Reviews that land on a
    checkpoint day slide to the next study day."""
    out = []
    for d in STUDY_DAYS:
        if d >= T: break
        for gap, form, frac, label, minutes in GAPS:
            if next_study(d + gap) != T: continue
            src = all_days.get(d)
            if not src:
                out.append({'src': d, 'form': form, 'label': label, 'minutes': minutes, 'words': None, 'n': '?'})
                continue
            cs = cards_of(src)
            if frac >= 1: sel = cs
            elif abs(frac - 0.5) < 1e-6: sel = [c for i, c in enumerate(cs) if i % 2 == d % 2]
            else: sel = [c for i, c in enumerate(cs) if i % 3 == d % 3]
            out.append({'src': d, 'form': form, 'label': label, 'minutes': minutes,
                        'words': sel, 'n': len(sel)})
    return out

def future_schedule(day):
    """The six future visits of today's words, for the little table on the homework page."""
    rows = []
    for i, (gap, form, frac, label, minutes) in enumerate(GAPS, start=1):
        t = next_study(day + gap)
        if t is None or t > 29:
            rows.append({'n': i, 'when': 'Day 30 检查站', 'how': label, 'time': '—'}); continue
        rows.append({'n': i, 'when': f'Day {t} 作业', 'how': label, 'time': f'{minutes} 分钟'})
    cp = (day - 1) // 10 * 10 + 10
    rows.insert(3, {'n': '×', 'when': f'Day {cp} 检查站', 'how': f'Part {(day - 1) // 10 + 1} 全量综合测试', 'time': '—'})
    rows.append({'n': '×', 'when': 'Day 30', 'how': '全书 1263 词自评', 'time': '—'})
    for i, r in enumerate(rows, start=1): r['n'] = f'第 {i} 次'
    return rows

def budget(day):
    """Minutes per scene, apportioned by card weight (a full card costs about
    three times a lite one) and rounded to the nearest minute."""
    w = [sum(3 if c['card_style'] == 'full' else 1 for c in s['cards']) for s in day['scenes']]
    total = day['estimated_minutes'] - 7            # opener + summary overhead
    mins = [max(3, round(total * x / sum(w))) for x in w]
    return [{'tag': SCENE_TAG[s['key']], 'title': s['title'].split('：')[0],
             'n': len(s['cards']), 'min': m} for s, m in zip(day['scenes'], mins)]

def chunk(seq, n):
    return [seq[i:i + n] for i in range(0, len(seq), n)]

def hint_for(c):
    """A hint short enough for a table cell: the word parts for a morph hook,
    otherwise the first collocation."""
    h = c['hook']
    if h['type'] == 'morph':
        head = re.split(r'[。；]', h['text'])[0]
        parts = re.findall(r'([A-Za-z\u0100-\u017f-]+)\s*（', head)
        seen, keep = set(), []
        for p in parts:
            if p.lower() in seen: continue
            seen.add(p.lower()); keep.append(p)
            if len(keep) == 3: break
        if keep: return ' + '.join(keep)
    return c['collocations'][0] if c['collocations'] else ''


def build(path, all_days, env):
    day = json.load(open(path))
    n = day['day']
    cards = cards_of(day)
    scene_of = {c['id']: s['key'] for s in day['scenes'] for c in s['cards']}
    selftest = chunk([{'i': i + 1, 'zh': '；'.join(c['senses'])[:22], 'answer': c['head'],
                       'hint': hint_for(c)[:26]} for i, c in enumerate(cards)], 8)
    revs = reviews_for(n, all_days)
    for r in revs:
        if r['words'] is not None:
            r['chunks'] = chunk([{'w': c['head'], 'zh': '；'.join(c['senses'])[:20],
                                  'en': c['example']['en']} for c in r['words']], 12)
    ctx = {
        'd': day, 'day': n, 'total_words': len(cards),
        'scene_tag': SCENE_TAG,
        'map_rows': [{'tag': SCENE_TAG[s['key']], 'title': s['title'].split('：')[0],
                      'heads': [c['head'] for c in s['cards'][:3]], 'n': len(s['cards'])}
                     for s in day['scenes']],
        'budget': budget(day),
        'selftest': selftest, 'reviews': revs, 'schedule': future_schedule(n),
        'progress': round(n / 30 * 100, 1),
        'answers': chunk([{'i': i + 1, 'a': c['head']} for i, c in enumerate(cards)], 12),
        'scene_of': scene_of,
    }
    out = os.path.join(ROOT, 'build', f'day{n:02d}.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w').write(env.get_template('day.html.j2').render(**ctx))
    print(f'day {n}: {len(cards)} cards, {len(revs)} review block(s) -> {os.path.relpath(out, ROOT)}')
    return out

if __name__ == '__main__':
    env = Environment(loader=FileSystemLoader(os.path.join(ROOT, 'templates')),
                      autoescape=select_autoescape(['html']), trim_blocks=True, lstrip_blocks=True)
    all_days = load_all()
    for p in sys.argv[1:]: build(p, all_days, env)
