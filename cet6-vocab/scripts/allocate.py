# Usage: cd data && python3 ../scripts/allocate.py && mv day_plan.* ../schedule/   (reads features.json + interference.json)
"""Draft v0 allocator: 1263 CET-6 star words -> 27 study days (3 parts x 9) + 3 checkpoint days.
Inputs : features.json (from features.py), interference.json (optional)
Outputs: day_plan.json, day_plan.md
Rules  : frequency-tiered (Part I high-freq ... Part III low-freq), root families kept together,
         per-day quotas for freebies (cognates) and orphans (lowest-frequency), no two members of an
         interference group on the same day.  Theme/story assignment is a phase-2 (writer) task.
"""
import json, collections, statistics
feat = json.load(open('features.json'))
inter = json.load(open('interference.json'))['groups']
STUDY_DAYS = [d for d in range(1, 31) if d % 10 != 0]           # 27 study days
CHECKPOINTS = [10, 20, 30]
LIGHT = {1, 2, 26, 27, 28, 29}                                  # 46-word days; others 47
size = {d: (46 if d in LIGHT else 47) for d in STUDY_DAYS}
assert sum(size.values()) == len(feat), sum(size.values())
Q_FREE, Q_ORPH, CAP_ROOT = 9, 5, 14
by_base = {f['base']: f for f in feat}
# ---- root groups (a word joins its largest tagged group; groups < 3 dissolve)
members = collections.defaultdict(list)
for f in feat:
    for t in f['roots']: members[t].append(f['base'])
assigned = {}
for lab, ms in sorted(members.items(), key=lambda kv: -len(kv[1])):
    ms = [m for m in ms if m not in assigned]
    if len(ms) >= 3:
        for m in ms: assigned[m] = lab
groups = collections.defaultdict(list)
for m, lab in assigned.items(): groups[lab].append(m)
R = set(assigned)
F = [f['base'] for f in feat if f['cognate'] and f['base'] not in R]
rest = [f for f in feat if f['base'] not in R and f['base'] not in F]
rest.sort(key=lambda f: -f['zipf'])
n_orph = Q_ORPH * len(STUDY_DAYS)
O = [f['base'] for f in rest[-n_orph:]]
T = [f['base'] for f in rest[:-n_orph]]
F.sort(key=lambda b: -by_base[b]['zipf']); O.sort(key=lambda b: -by_base[b]['zipf'])
# ---- day buckets
plan = {d: {'roots': [], 'theme': [], 'freebies': [], 'orphans': []} for d in STUDY_DAYS}
def deal(pool, key, quota):
    i = 0
    for d in STUDY_DAYS:
        q = quota(d)
        plan[d][key] = pool[i:i+q]; i += q
    return pool[i:]                      # leftovers (spill into theme pool)
leftF = deal(F, 'freebies', lambda d: min(Q_FREE, len(F) // len(STUDY_DAYS) + (1 if d <= len(F) % len(STUDY_DAYS) else 0)))
leftO = deal(O, 'orphans', lambda d: Q_ORPH)
glist = sorted(groups.items(), key=lambda kv: -statistics.mean(by_base[m]['zipf'] for m in kv[1]))
di = 0
for lab, ms in glist:
    while di < len(STUDY_DAYS) and len(plan[STUDY_DAYS[di]]['roots']) + len(ms) > CAP_ROOT: di += 1
    if di >= len(STUDY_DAYS): T = ms + T; continue
    plan[STUDY_DAYS[di]]['roots'].extend(sorted(ms, key=lambda b: -by_base[b]['zipf']))
T = leftF + leftO + T
T.sort(key=lambda b: -by_base[b]['zipf'])
# ---- fill thin root scenes with slices of prefix families ("今日零件: dis-")
MIN_PARTS = 8
pf = collections.defaultdict(list)
for b in T:
    p = by_base[b]['prefix']
    if p and p not in ('co', 'a', 'e'): pf[p].append(b)
for d in STUDY_DAYS:
    need = MIN_PARTS - len(plan[d]['roots'])
    if need <= 0 or not pf: continue
    p = max(pf, key=lambda k: len(pf[k]))
    take = pf[p][:need]; pf[p] = pf[p][need:]
    if not pf[p]: del pf[p]
    plan[d]['roots'].extend(take); assigned.update({b: f'{p}-' for b in take})
    T = [b for b in T if b not in take]
i = 0
for d in STUDY_DAYS:
    need = size[d] - sum(len(v) for v in plan[d].values())
    plan[d]['theme'] = T[i:i+need]; i += need
assert i == len(T), (i, len(T))
# ---- interference: push later member to the next day (same pool), swapping to keep sizes
def day_of(b):
    for d in STUDY_DAYS:
        for k, v in plan[d].items():
            if b in v: return d, k
    return None, None
star_bases = set(by_base)
for _ in range(20):
    moved = False
    for g in inter:
        g = [w for w in g if w in star_bases]
        seen = {}
        for w in g:
            d, k = day_of(w)
            if d in seen:
                # swap w with the last word of the same pool on the next study day (within the same part if possible)
                nd = next((x for x in STUDY_DAYS if x > d and plan[x][k] and (x-1)//10 == (d-1)//10), None) or \
                     next((x for x in STUDY_DAYS if x > d and plan[x][k]), None)
                if nd is None: continue
                other = plan[nd][k][-1]
                plan[d][k][plan[d][k].index(w)] = other
                plan[nd][k][-1] = w
                moved = True
            else: seen[d] = w
    if not moved: break
# ---- emit
def entry(b):
    f = by_base[b]
    return {'id': f['id'], 'head': f['head'], 'family': f['family'], 'zipf': f['zipf'],
            'cognate': f['cognate'], 'roots': [assigned.get(b)] if b in assigned else []}
out = {'meta': {'total_words': len(feat), 'study_days': STUDY_DAYS, 'checkpoints': CHECKPOINTS,
                'scene_quotas': {'freebies': Q_FREE, 'orphans': Q_ORPH, 'root_cap': CAP_ROOT},
                'note': 'draft v0 - mechanical allocation; theme/story pass (phase 2) may swap words within a part'},
       'days': []}
lines = ['| Day | Part | 词数 | 词根家族 | 情景剧 | 闪电轮 | 孤儿院 | 平均Zipf | 词根组 |', '|---|---|---|---|---|---|---|---|---|']
for d in range(1, 31):
    if d in CHECKPOINTS:
        out['days'].append({'day': d, 'part': d // 10, 'kind': 'checkpoint', 'words': []})
        lines.append(f'| {d} | {d//10} | 0 | – | – | – | – | – | 检查站：本 Part 全量复习 + 综合测试 |'); continue
    p = plan[d]; allw = p['roots'] + p['theme'] + p['freebies'] + p['orphans']
    labs = sorted(set(assigned[b] for b in p['roots']))
    out['days'].append({'day': d, 'part': (d - 1) // 10 + 1, 'kind': 'study',
                        'scenes': {k: [entry(b) for b in v] for k, v in p.items()}})
    lines.append(f"| {d} | {(d-1)//10+1} | {len(allw)} | {len(p['roots'])} | {len(p['theme'])} | {len(p['freebies'])} | {len(p['orphans'])} | {statistics.mean(by_base[b]['zipf'] for b in allw):.2f} | {', '.join(labs)} |")
json.dump(out, open('day_plan.json', 'w'), ensure_ascii=False, indent=1)
open('day_plan.md', 'w').write('\n'.join(lines) + '\n')
allc = collections.Counter(b for d in STUDY_DAYS for v in plan[d].values() for b in v)
assert len(allc) == len(feat) and max(allc.values()) == 1, 'coverage error'
print('OK days', len(STUDY_DAYS), 'root groups', len(groups), 'R', len(R), 'F', len(F), 'O', len(O), 'T', len(T))
print('\n'.join(lines[:14])); print('...'); print('\n'.join(lines[-6:]))
print('Day 1 sample:', {k: [e['head'] for e in v][:8] for k, v in out['days'][0]['scenes'].items()})
print('Day 29 sample:', {k: [e['head'] for e in v][:8] for k, v in out['days'][28]['scenes'].items()})
