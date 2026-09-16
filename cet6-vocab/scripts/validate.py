#!/usr/bin/env python3
"""Validate one or more content/dayNN.json files against the schema and the project rules.

usage: validate.py [--partial] [--plan schedule/day_plan.json] content/day01.json [content/day02.json ...]
       validate.py --all content/            # also checks global coverage of the 1263 words

--partial : sample / draft mode — word-count and plan-membership checks become warnings.
Exit code 1 on any ERROR.  (jsonschema is optional; without it only the project rules run.)
"""
import json, re, sys, os, glob, argparse, collections
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ap = argparse.ArgumentParser()
ap.add_argument('files', nargs='*'); ap.add_argument('--partial', action='store_true')
ap.add_argument('--all', help='directory of dayNN.json files'); ap.add_argument('--plan', default=os.path.join(ROOT, 'schedule', 'day_plan.json'))
args = ap.parse_args()
files = sorted(glob.glob(os.path.join(args.all, 'day*.json'))) if args.all else args.files
words = {w['id']: w for w in json.load(open(os.path.join(ROOT, 'data', 'cet6_star_words.json')))}
by_head = {re.sub(r'[¹²³]', '', w['head']).split('/')[0]: w['id'] for w in words.values()}
inter = json.load(open(os.path.join(ROOT, 'data', 'interference.json')))['groups']
plan = json.load(open(args.plan)) if os.path.exists(args.plan) else None
plan_day = {}
if plan:
    for d in plan['days']:
        for k, v in d.get('scenes', {}).items():
            for e in v: plan_day[e['id']] = (d['day'], d['part'], k)
schema = json.load(open(os.path.join(ROOT, 'schema', 'day.schema.json')))
try:
    import jsonschema
except ImportError:
    jsonschema = None
errors, warnings = [], []
def err(f, m): errors.append(f'{f}: {m}')
def warn(f, m): warnings.append(f'{f}: {m}')
CAL = {1: 46, 2: 46, 26: 46, 27: 46, 28: 46, 29: 46}
def base(h): return re.sub(r'[¹²³]', '', h).split('/')[0]
def stem_in(word, sentence):
    b = base(word).lower(); b = re.sub(r'\((\w+)\)', r'\1', b)
    s = sentence.lower()
    stems = {b, b[:-1] if b.endswith('e') else b, b[:-1] + 'i' if b.endswith('y') else b}
    return any(re.search(r'\b' + re.escape(st) + r'[a-z]{0,4}\b', s) for st in stems if len(st) >= 3)
seen_ids = collections.Counter()
for f in files:
    name = os.path.basename(f)
    try:
        d = json.load(open(f))
    except Exception as e:
        err(name, f'invalid JSON: {e}'); continue
    if jsonschema:
        for e in sorted(jsonschema.Draft7Validator(schema).iter_errors(d), key=lambda e: list(e.path)):
            err(name, f'schema {list(e.path)}: {e.message[:120]}')
    day = d.get('day'); cards = [(s['key'], c) for s in d.get('scenes', []) for c in s.get('cards', [])]
    n = len(cards); expected = CAL.get(day, 47)
    if n != expected:
        (warn if args.partial else err)(name, f'word count {n} != calendar {expected}')
    keys = [s['key'] for s in d.get('scenes', [])]
    if keys != ['roots', 'theme', 'freebies', 'orphans']: err(name, f'scene order must be roots,theme,freebies,orphans; got {keys}')
    puns = 0; jokes = 0
    for key, c in cards:
        cid = c.get('id'); seen_ids[cid] += 1
        w = words.get(cid)
        if not w: err(name, f'card id {cid} not in word list'); continue
        if c.get('head') != w['head']: err(name, f'id {cid}: head {c.get("head")!r} != list {w["head"]!r}')
        fam = sorted(x['form'] for x in c.get('family', []))
        if fam != sorted(w['family']): err(name, f'{w["head"]}: family {fam} != list {w["family"]}')
        if plan_day and cid in plan_day:
            pd, pp, pk = plan_day[cid]
            if pd != day:
                if pp != d.get('part'): (warn if args.partial else err)(name, f'{w["head"]}: planned for day {pd} (part {pp}) — cross-part moves are not allowed')
                else: warn(name, f'{w["head"]}: planned for day {pd}, moved to day {day} (same part) — ok if <= 6 swaps')
            if pk != key: warn(name, f'{w["head"]}: planned scene {pk}, placed in {key}')
        ex = c.get('example', {}).get('en', '')
        if ex and not stem_in(w['head'], ex): err(name, f'{w["head"]}: example does not contain the headword')
        nw = len(ex.split())
        if ex and not (8 <= nw <= 24): warn(name, f'{w["head"]}: example has {nw} words (target 10–20)')
        h = c.get('hook', {})
        if h.get('type') == 'morph' and 'true_etymology' not in h: err(name, f'{w["head"]}: morph hook needs true_etymology')
        if h.get('type') == 'pun': puns += 1
        if h.get('joke'): jokes += 1
        if key == 'freebies' and c.get('card_style') != 'lite': err(name, f'{w["head"]}: freebies must be lite')
        if key != 'freebies' and c.get('card_style') == 'lite': warn(name, f'{w["head"]}: lite card outside freebies')
        zh_len = sum(len(s) for s in c.get('senses', [])) + len(c.get('example', {}).get('zh', '')) + len(h.get('text', ''))
        if c.get('card_style') == 'full' and zh_len > 160: warn(name, f'{w["head"]}: chinese text {zh_len} > 160')
        for cf in c.get('confusable_with', []):
            oid = by_head.get(cf['head'])
            if oid and plan_day and plan_day.get(oid, (99,))[0] >= day: err(name, f'{w["head"]}: confusable {cf["head"]} is not taught earlier')
    if puns > 4: err(name, f'{puns} pun hooks > 4')
    boxes = [b for s in d.get('scenes', []) for b in s.get('boxes', [])]
    if sum(b['type'] == 'aside' for b in boxes) < 2: err(name, 'need >= 2 ASIDE boxes')
    if sum(b['type'] == 'tip' for b in boxes) < 1: err(name, 'need >= 1 TIP box')
    for b in boxes:
        if b['type'] == 'aside' and not b.get('source'): warn(name, f'ASIDE 「{b["title"]}」 has no source')
        if b.get('joke'): jokes += 1
    if jokes > 2 * max(1, n // 5): warn(name, f'{jokes} jokes for {n} cards — density likely > 2 per page')
    ans = d.get('crux', {}).get('answer', '')
    if len(ans) > 120: err(name, f'crux answer {len(ans)} chars > 120')
    turns = d.get('dialogue', {}).get('turns', [])
    if turns and turns[0]['who'] != 'student': warn(name, 'dialogue usually opens with the student')
    if sum(len(t['text']) for t in turns) > 450: warn(name, 'dialogue > 450 chars')
    # ---- story layer
    theme = next((sc for sc in d.get('scenes', []) if sc['key'] == 'theme'), None)
    if theme is not None and len(theme.get('beats', [])) < 3: err(name, 'theme scene needs >= 3 story beats')
    for sc in d.get('scenes', []):
        ids = {c['id'] for c in sc['cards']}
        for b in sc.get('beats', []):
            if b.get('after') is not None and b['after'] not in ids: err(name, f"beat after={b['after']} is not a card of scene {sc['key']}")
    if not d.get('hook'): err(name, 'missing hook (今天的悬念)')
    if not d.get('cliffhanger'): err(name, 'missing cliffhanger (下集预告)')
    if any(k in d.get('cliffhanger', '') for k in ('明天继续', '待续')): warn(name, 'cliffhanger should name a concrete event')
    for t in turns:
        if t['who'] == 'professor' and len(t['text']) > 80: warn(name, f"professor turn of {len(t['text'])} chars reads like a lecture (limit 80)")
    if turns and turns[-1]['who'] != 'professor': warn(name, 'dialogue usually ends on the professor')
    for ex in d.get('homework', {}).get('exercises', []):
        if ex.get('passage'):
            blanks = ex['passage'].count('____'); n_ans = len(ex['items'])
            if blanks != n_ans: err(name, f"story cloze: {blanks} blanks but {n_ans} answers")
            nw = len(ex['passage'].split())
            if not (60 <= nw <= 160): warn(name, f'story cloze passage has {nw} words (target 80–120)')
        else:
            for it in ex['items']:
                if not it.get('prompt'): err(name, f"exercise 「{ex['title']}」: item without prompt needs a passage")
    day_ids = {c['id'] for _, c in cards}
    for g in inter:
        hit = [h for h in g if by_head.get(h) in day_ids]
        if len(hit) > 1: err(name, f'interference: {hit} introduced on the same day')
if args.all:
    missing = set(words) - set(seen_ids); dup = [i for i, c in seen_ids.items() if c > 1]
    if missing: err('ALL', f'{len(missing)} words never introduced, e.g. {[words[i]["head"] for i in sorted(missing)[:10]]}')
    if dup: err('ALL', f'duplicated ids: {dup[:10]}')
for w in warnings: print('WARN ', w)
for e in errors: print('ERROR', e)
print(f'{len(files)} file(s): {len(errors)} error(s), {len(warnings)} warning(s)' + ('' if jsonschema else '  [jsonschema not installed: schema check skipped]'))
sys.exit(1 if errors else 0)
