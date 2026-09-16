# Usage: cd data && python3 ../scripts/features.py   (needs: pip install wordfreq; reads syllabus_words_all.json + cet6_star_words.json, writes features.json)
import json, re, collections
from wordfreq import zipf_frequency
allrows = json.load(open('syllabus_words_all.json'))
stars = json.load(open('cet6_star_words.json'))
cet4 = set()
for r in allrows:
    if not r['star']:
        for t in [r['head']] + r['family']:
            for alt in re.split(r'/', t):
                alt = re.sub(r'[¹²³()]', '', alt).strip()
                if len(alt) >= 3: cet4.add(alt.lower())
def base(h):
    h = re.sub(r'[¹²³]', '', h)
    h = h.split('/')[0]
    h = re.sub(r'\((\w+)\)', r'\1', h)   # appal(l) -> appall ; alumin(i)um -> aluminium
    return h.strip()
PREFIXES = ['anti','auto','bene','circum','co','com','con','contra','counter','de','dis','en','em','ex','extra','fore','hyper','il','im','in','inter','intra','ir','mal','micro','mis','mono','multi','non','ob','out','over','para','per','post','pre','pro','re','retro','semi','sub','super','sur','sym','syn','tele','trans','ultra','un','under','uni','vice']
SUFFIXES = ['ability','ibility','ation','ition','tion','sion','ment','ness','ance','ence','ancy','ency','ship','hood','dom','ism','ist','ity','ty','ery','ary','ory','ory','ive','ous','ious','eous','ful','less','able','ible','al','ial','ic','ical','ish','ize','ise','ify','fy','en','ate','ure','age','ant','ent','er','or','ee','ly','ward','wise','ess','ette','let','ling']
ROOTS = {  # crude Latin/Greek root regexes -> label
 'spect':'spect(看)','vis|vid':'vis/vid(看)','dict|dic':'dict(说)','ject':'ject(投掷)','fer':'fer(带来)','mit|miss':'mit/miss(送)','vert|vers':'vert/vers(转)','duc|duct':'duc(引导)','port':'port(运)','pos|pon':'pos/pon(放)','scrib|script':'scrib(写)','graph|gram':'graph(写画)','log':'log(言语/学)','ced|cess|ceed':'ced(走)','gress|grad':'gress/grad(步)','tract':'tract(拉)','pel|puls':'pel/puls(推)','tend|tens|tent':'tend(伸)','ven|vent':'ven(来)','cap|cept|ceiv':'cap/cept(拿)','fac|fact|fect|fic':'fac/fic(做)','struct':'struct(建)','rupt':'rupt(破)','clud|clus|clos':'clud(关)','pend|pens':'pend(悬/称)','cred':'cred(信)','fid':'fid(信)','vor':'vor(吃)','voc|vok':'voc(叫)','spir':'spir(呼吸)','sens|sent':'sens(感)','path':'path(感/病)','cord':'cord(心)','anim':'anim(生命)','mort':'mort(死)','vit|viv':'viv(活)','gen':'gen(生)','nat':'nat(生)','bio':'bio(生)','chron':'chron(时)','temp':'temp(时)','loc':'loc(地)','terr':'terr(地)','geo':'geo(地)','aqua|aqu':'aqua(水)','hydr':'hydr(水)','flu':'flu(流)','tort':'tort(扭)','flect|flex':'flex(弯)','frag|fract':'frag(碎)','solv|solu':'solv(解)','tain|ten|tin':'tain(持)','sist|stat|stit':'sist/stat(站)','ling|lingu':'lingu(语)','manu|mani':'manu(手)','ped':'ped(足)','corp':'corp(体)','cid|cis':'cid/cis(切/杀)','sect':'sect(切)','junct|join':'junct(连)','leg|lect':'leg/lect(选/读)','liber':'liber(自由)','magn':'magn(大)','min':'min(小)','medi':'medi(中)','omni':'omni(全)','equi|equ':'equ(等)','ver':'ver(真)','luc|lum':'luc(光)','phon':'phon(声)','photo':'photo(光)','therm':'therm(热)','meter|metr':'metr(量)','scope':'scope(看)','onym':'onym(名)','nom|nomin':'nom(名)','labor':'labor(劳)','oper':'oper(工作)','merc|merch':'merc(贸易)','vac|van':'vac(空)','plen|plet':'plen(满)','ampl':'ampl(大)','brev':'brev(短)','long':'long(长)','alt':'alt(高)','prim':'prim(第一)','soci':'soci(伙伴)','popul|publ':'popl/publ(人民)','civ':'civ(公民)','urb':'urb(城)','polit|polis':'polit(城邦)','dem':'dem(人民)','crat|cracy':'crat(统治)','arch':'arch(统治/古)','reg|rect':'reg/rect(直/统治)','jur|jus|jud':'jur/jud(法)','test':'test(证)','sacr|sanct':'sacr(神圣)','the':'the(神)','doc|doct':'doc(教)','sci':'sci(知)','gnos|gni':'gnos(知)','mem|memor':'mem(记)','put':'put(想/算)','opt':'opt(选/眼)','audi':'audi(听)','tact|tang':'tact(触)','press':'press(压)','plic|ply|plex':'plic(折)','clin':'clin(倾)','cur|cours':'cur(跑)','vad|vas':'vad(走)','err':'err(错)','mov|mot|mob':'mov(动)','ag|act':'ag/act(做)','fin':'fin(终/界)','term':'term(界限)','ori':'ori(升起)','cad|cas|cid':'cad(落)','plaus|plaud':'plaud(拍手)','rid|ris':'rid(笑)','lud|lus':'lud(玩)','mand':'mand(命令)','her|hes':'her/hes(粘)','tox':'tox(毒)','phob':'phob(怕)','man|mania':'mania(狂)'}
def tag_roots(w):
    tags = []
    for rx, lab in ROOTS.items():
        alts = [a for a in rx.split('|')]
        hit = False
        for a in alts:
            if len(a) >= 4 and a in w and len(w) >= len(a) + 3: hit = True
            elif len(a) == 3:
                for p in PREFIXES + ['a', 'e']:
                    if w.startswith(p + a) and len(w) >= len(p) + len(a) + 2: hit = True
        if hit: tags.append(lab)
    return tags
feat = []
for r in stars:
    b = base(r['head']).lower()
    z = zipf_frequency(b, 'en')
    # transparent cognate: contains a CET-4 headword (>=4 letters) as substring after light affix stripping
    cog = None
    CPRE = set(PREFIXES) | {'', 'a', 'be', 'ab', 'ad', 'al', 'as', 'ac', 'ap', 'at', 'e', 'up', 'out', 'with', 'off', 'by', 'over', 'under', 'fore', 'after', 'self', 'well', 'air', 'sea', 'home', 'head', 'hand', 'work', 'over'}
    CSUF = set(SUFFIXES) | {'', 's', 'ed', 'ing', 'y', 'er', 'ry', 'ance', 'ee', 'ness', 'ery', 'ular'}
    for c in cet4:
        if len(c) >= 4 and c in b and c != b:
            i = b.find(c); pre, suf = b[:i], b[i+len(c):]
            if pre in CPRE and suf in CSUF:
                if cog is None or len(c) > len(cog): cog = c
    pre = [p for p in PREFIXES if b.startswith(p) and len(b) > len(p) + 3]
    suf = [s for s in SUFFIXES if b.endswith(s) and len(b) > len(s) + 3]
    feat.append({'id': r['id'], 'head': r['head'], 'base': b, 'family': r['family'], 'zipf': z,
                 'cognate': cog, 'prefix': max(pre, key=len) if pre else None,
                 'suffix': max(suf, key=len) if suf else None, 'roots': tag_roots(b), 'len': len(b)})
json.dump(feat, open('features.json', 'w'), ensure_ascii=False, indent=1)
zs = sorted(f['zipf'] for f in feat)
n = len(zs)
print('n', n, 'zipf quantiles 10/25/50/75/90:', [zs[int(n*q)] for q in (.1,.25,.5,.75,.9)], 'zero-freq:', sum(1 for z in zs if z == 0))
print('with cognate:', sum(1 for f in feat if f['cognate']), ' with prefix:', sum(1 for f in feat if f['prefix']), ' with suffix:', sum(1 for f in feat if f['suffix']), ' with root tag:', sum(1 for f in feat if f['roots']))
rc = collections.Counter(t for f in feat for t in f['roots'])
print('root groups >=3:', [(k, v) for k, v in rc.most_common() if v >= 3][:60])
print('families with derivatives:', sum(1 for f in feat if f['family']), 'total derivative tokens:', sum(len(f['family']) for f in feat))
print('lowest zipf sample:', [(f['head'], f['zipf']) for f in sorted(feat, key=lambda f: f['zipf'])[:25]])
print('highest zipf sample:', [(f['head'], f['zipf']) for f in sorted(feat, key=lambda f: -f['zipf'])[:25]])
print('cognate samples:', [(f['head'], f['cognate']) for f in feat if f['cognate']][:40])
