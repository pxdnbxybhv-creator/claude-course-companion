# -*- coding: utf-8 -*-
"""Number {@key} citations by first appearance and emit the ==REFERENCES== block."""
import re, io, sys
src, dst = sys.argv[1], sys.argv[2]
t = io.open(src, encoding='utf-8').read()
main, refdb = t.split('==REFDB==')
db = {}
for line in refdb.strip().split('\n'):
    if not line.strip(): continue
    k, v = line.split(':', 1)
    db[k.strip()] = v.strip()
order = []
def sub(m):
    keys = [k.strip() for k in m.group(1).split(',')]
    nums = []
    for k in keys:
        if k not in db: raise SystemExit('unknown ref key: ' + k)
        if k not in order: order.append(k)
        nums.append(order.index(k) + 1)
    nums = sorted(set(nums))
    # compress consecutive runs a-b
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j+1] == nums[j] + 1: j += 1
        out.append(f'{nums[i]}-{nums[j]}' if j - i >= 2 else ','.join(str(n) for n in nums[i:j+1]))
        i = j + 1
    return '[' + ','.join(out) + ']'
body = re.sub(r'\{@([^}]+)\}', sub, main)
refs = '\n'.join(f'[{i+1}] {db[k]}' for i, k in enumerate(order))
io.open(dst, 'w', encoding='utf-8').write(body.rstrip('\n') + '\n==REFERENCES==\n' + refs + '\n')
unused = [k for k in db if k not in order]
print(f'{len(order)} refs used; unused keys: {unused}')
