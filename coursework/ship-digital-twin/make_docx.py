# -*- coding: utf-8 -*-
"""Build the course paper .docx from a plain-text content file, replicating the
《船海智能仿真与数字孪生》大作业 template layout.

Content file format (UTF-8):
  ==TITLE==      one line
  ==ABSTRACT==   one paragraph
  ==KEYWORDS==   one line, items separated by "；"
  ==BODY==       markdown-ish: "# " level-1 heading, "## " level-2 heading, other
                 non-empty lines are body paragraphs
  ==REFERENCES== one reference per line, already numbered "[1] ..."
"""
import re, sys
from docx import Document
from docx.shared import Pt, Cm, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SONG, HEI, TNR = '宋体', '黑体', 'Times New Roman'

STUDENT = {'id': '2024065420', 'major': '计算机科学与技术', 'name': '晁政'}
TEACHERS = '昝英飞  刘旸   李新飞'
DATE = '2026年10月'


def parse_content(path):
    txt = open(path, encoding='utf-8').read()
    parts = re.split(r'^==([A-Z]+)==\s*$', txt, flags=re.M)
    data = {}
    for i in range(1, len(parts), 2):
        data[parts[i]] = parts[i + 1].strip('\n')
    return data


def set_run_font(run, east=SONG, latin=TNR, size=None, bold=None):
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    rfonts.set(qn('w:ascii'), latin)
    rfonts.set(qn('w:hAnsi'), latin)
    rfonts.set(qn('w:eastAsia'), east)
    rfonts.set(qn('w:cs'), latin)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold


def set_ind(par, first_chars=None, left_chars=None, hanging_twips=None, left_twips=None, first_twips=None):
    ppr = par._element.get_or_add_pPr()
    ind = ppr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        ppr.append(ind)
    if first_chars is not None:
        ind.set(qn('w:firstLineChars'), str(first_chars * 100))
    if left_chars is not None:
        ind.set(qn('w:leftChars'), str(left_chars * 100))
    if left_twips is not None:
        ind.set(qn('w:left'), str(left_twips))
    if hanging_twips is not None:
        ind.set(qn('w:hanging'), str(hanging_twips))
    if first_twips is not None:
        ind.set(qn('w:firstLine'), str(first_twips))


def para(doc, text='', east=SONG, latin=TNR, size=12, align=None, exact=None,
         before=0, after=0, bold=None, first_chars=None, page_break_before=False):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    if align is not None:
        p.alignment = align
    if exact is not None:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(exact)
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if page_break_before:
        pf.page_break_before = True
    if first_chars is not None:
        set_ind(p, first_chars=first_chars)
    if text:
        r = p.add_run(text)
        set_run_font(r, east, latin, size, bold)
    return p


def add_mixed_runs(p, text, east, latin, size, bold=None):
    """Add text as a run; python-docx run with rFonts handles CJK/Latin split via Word."""
    r = p.add_run(text)
    set_run_font(r, east, latin, size, bold)
    return r


def setup_document():
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Twips(1440)
    sec.left_margin = sec.right_margin = Twips(1800)
    sec.header_distance = sec.footer_distance = Twips(0)
    # Normal style defaults
    st = doc.styles['Normal']
    st.font.name = TNR
    st.font.size = Pt(12)
    rpr = st.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts'); rpr.insert(0, rfonts)
    for k in ('w:ascii', 'w:hAnsi', 'w:cs'):
        rfonts.set(qn(k), TNR)
    rfonts.set(qn('w:eastAsia'), SONG)
    lang = rpr.find(qn('w:lang'))
    if lang is None:
        lang = OxmlElement('w:lang'); rpr.append(lang)
    lang.set(qn('w:val'), 'en-US'); lang.set(qn('w:eastAsia'), 'zh-CN')
    ppr = st.element.get_or_add_pPr()
    # widow control off + justify like template
    jc = OxmlElement('w:jc'); jc.set(qn('w:val'), 'both'); ppr.append(jc)
    st.paragraph_format.space_before = Pt(0)
    st.paragraph_format.space_after = Pt(0)
    return doc


def build_cover(doc):
    C = WD_ALIGN_PARAGRAPH.CENTER
    para(doc, '', size=22, align=C, exact=22, after=6)
    para(doc, '船舶工程学院', east=SONG, size=22, align=C, exact=22, after=6)
    for _ in range(3):
        para(doc, '', size=22, align=C, exact=22, after=6)
    para(doc, '船海智能仿真与数字孪生', east=HEI, latin=HEI, size=24, align=C, exact=26, after=6)
    para(doc, '（大作业）', east=HEI, latin=HEI, size=15, align=C, exact=22, after=6)
    for _ in range(2):
        para(doc, '', size=14, exact=22, after=6)
    info = [('学    号：', STUDENT['id']), ('专    业：', STUDENT['major']),
            ('学生姓名：', STUDENT['name']), ('任课教师：', TEACHERS)]
    for label, val in info:
        p = para(doc, '', size=14, exact=22, before=7.8)
        set_ind(p, first_twips=2642)
        add_mixed_runs(p, label + val, SONG, TNR, 14)
    para(doc, '', size=12, exact=22, after=6)
    p = para(doc, '教师评价：', size=14, exact=22, before=7.8)
    items = ['选题符合作业要求：', '学术价值/现实意义：', '观点鲜明/论证充分：', '结构合理/重点突出：',
             '理论与实际相结合：', '文献资料的丰富性：', '论文格式的规范性：']
    scale = '优秀□   良好□   中等□   及格□   不及格□'
    tbl = doc.add_table(rows=len(items), cols=2)
    tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl.autofit = False
    tblPr = tbl._element.tblPr
    ind = OxmlElement('w:tblInd'); ind.set(qn('w:w'), '300'); ind.set(qn('w:type'), 'dxa'); tblPr.append(ind)
    widths = [Twips(2700), Twips(5346)]
    # fixed layout + explicit grid so Word/LibreOffice honour the column widths
    layout = OxmlElement('w:tblLayout'); layout.set(qn('w:type'), 'fixed'); tblPr.append(layout)
    tblW = tblPr.find(qn('w:tblW'))
    if tblW is None:
        tblW = OxmlElement('w:tblW'); tblPr.append(tblW)
    tblW.set(qn('w:w'), '8046'); tblW.set(qn('w:type'), 'dxa')
    grid = tbl._element.find(qn('w:tblGrid'))
    for gc, w in zip(grid.findall(qn('w:gridCol')), (2700, 5346)):
        gc.set(qn('w:w'), str(w))
    for j, w in enumerate(widths):
        tbl.columns[j].width = w
    for i, item in enumerate(items):
        row = tbl.rows[i]
        tr = row._element
        trPr = tr.get_or_add_trPr()
        h = OxmlElement('w:trHeight'); h.set(qn('w:val'), '440'); h.set(qn('w:hRule'), 'exact'); trPr.append(h)
        for j, txt in enumerate((item, scale)):
            cell = row.cells[j]
            cell.width = widths[j]
            cp = cell.paragraphs[0]
            cp.alignment = WD_ALIGN_PARAGRAPH.LEFT
            cp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            cp.paragraph_format.line_spacing = Pt(22)
            cp.paragraph_format.space_before = Pt(0)
            cp.paragraph_format.space_after = Pt(0)
            r = cp.add_run(txt)
            set_run_font(r, SONG, TNR, 12)
    p = para(doc, '', size=12, exact=22, before=7.8)
    set_ind(p, first_twips=240)
    add_mixed_runs(p, '其他：' + '　' * 20, SONG, TNR, 12)
    para(doc, '', size=14, exact=22)
    para(doc, '综合成绩：', size=14, exact=22)
    para(doc, '', size=9, exact=22)
    para(doc, DATE, size=18, align=C, exact=26)


def build_front(doc, data):
    C = WD_ALIGN_PARAGRAPH.CENTER
    p = para(doc, data['TITLE'], east=HEI, latin=HEI, size=18, align=C, exact=22, page_break_before=True)
    para(doc, '', size=18, exact=22)
    # 摘要
    p = para(doc, '', size=10.5, exact=22)
    set_ind(p, left_twips=840, hanging_twips=840)
    add_mixed_runs(p, '摘  要：', HEI, HEI, 10.5)
    add_mixed_runs(p, data['ABSTRACT'].replace('\n', ''), SONG, TNR, 10.5)
    # 关键词
    p = para(doc, '', size=10.5, exact=22)
    set_ind(p, left_twips=840, hanging_twips=840)
    add_mixed_runs(p, '关键词：', HEI, HEI, 10.5)
    kws = [k.strip() for k in re.split(r'[；;]', data['KEYWORDS']) if k.strip()]
    add_mixed_runs(p, '  '.join(kws), SONG, TNR, 10.5)
    para(doc, '', size=10.5, exact=22)


def set_cell_borders(cell, **kw):
    tcPr = cell._element.get_or_add_tcPr()
    b = tcPr.find(qn('w:tcBorders'))
    if b is None:
        b = OxmlElement('w:tcBorders'); tcPr.append(b)
    for edge in ('top', 'bottom', 'left', 'right'):
        el = OxmlElement('w:' + edge)
        if edge in kw:
            el.set(qn('w:val'), 'single'); el.set(qn('w:sz'), str(kw[edge])); el.set(qn('w:color'), '000000')
        else:
            el.set(qn('w:val'), 'nil')
        b.append(el)


def build_table(doc, caption, rows):
    C = WD_ALIGN_PARAGRAPH.CENTER
    p = para(doc, '', size=10.5, align=C, exact=22, before=6)
    p.paragraph_format.keep_with_next = True
    add_mixed_runs(p, caption, HEI, HEI, 10.5)
    ncol = max(len(r) for r in rows)
    tbl = doc.add_table(rows=len(rows), cols=ncol)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = True
    total = 8312
    # first column narrower when many columns
    widths = [int(total / ncol)] * ncol
    for i, r in enumerate(rows):
        for j in range(ncol):
            cell = tbl.rows[i].cells[j]
            cell.width = Twips(widths[j])
            cp = cell.paragraphs[0]
            cp.alignment = C if (i == 0 or j > 0) else WD_ALIGN_PARAGRAPH.LEFT
            cp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            cp.paragraph_format.line_spacing = Pt(16)
            cp.paragraph_format.space_before = Pt(0); cp.paragraph_format.space_after = Pt(0)
            if i < len(rows) - 1:
                cp.paragraph_format.keep_with_next = True
            txt = r[j] if j < len(r) else ''
            run = cp.add_run(txt)
            set_run_font(run, SONG, TNR, 9)
            kw = {}
            if i == 0: kw = dict(top=12, bottom=6)
            if i == len(rows) - 1: kw['bottom'] = 12
            set_cell_borders(cell, **kw)
    para(doc, '', size=6, exact=8)


def build_body(doc, data):
    lines = data['BODY'].split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1; continue
        if line.startswith('!!TABLE '):
            caption = line[8:].strip()
            rows = []
            i += 1
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(set(c) <= set('-: ') for c in cells):
                    rows.append(cells)
                i += 1
            build_table(doc, caption, rows)
            continue
        i += 1
        if line.startswith('## '):
            p = para(doc, '', size=12, exact=22, before=3)
            add_mixed_runs(p, line[3:].strip(), HEI, HEI, 12)
        elif line.startswith('# '):
            p = para(doc, '', size=12, exact=22, before=8)
            add_mixed_runs(p, line[2:].strip(), HEI, HEI, 12)
        else:
            p = para(doc, '', size=12, exact=22, first_chars=2)
            add_mixed_runs(p, line.strip(), SONG, TNR, 12)


def build_refs(doc, data):
    C = WD_ALIGN_PARAGRAPH.CENTER
    para(doc, '', size=12, exact=22)
    p = para(doc, '', size=10.5, align=C, exact=22)
    add_mixed_runs(p, '参考文献', HEI, HEI, 10.5)
    for line in data['REFERENCES'].split('\n'):
        line = line.strip()
        if not line:
            continue
        p = para(doc, '', size=10.5, exact=22, align=WD_ALIGN_PARAGRAPH.LEFT)
        set_ind(p, left_twips=520, hanging_twips=520)
        add_mixed_runs(p, line, SONG, TNR, 10.5)


def stats(data):
    body = data['BODY']
    body_text = '\n'.join(l for l in body.split('\n') if not l.startswith('#') and not l.startswith('|') and not l.startswith('!!TABLE'))
    cjk = len(re.findall(r'[一-鿿]', body_text))
    nonspace = len(re.sub(r'\s', '', body_text))
    abstract = len(re.sub(r'\s', '', data['ABSTRACT']))
    refs = [l for l in data['REFERENCES'].split('\n') if l.strip()]
    recent = [l for l in refs if re.search(r'\b(2024|2025|2026)\b', l)]
    cites = sorted(set(int(x) for x in re.findall(r'\[(\d+)\]', body_text)))
    return dict(body_cjk=cjk, body_nonspace=nonspace, abstract_chars=abstract,
                n_refs=len(refs), n_recent=len(recent), cited=cites)


def main():
    src, out = sys.argv[1], sys.argv[2]
    data = parse_content(src)
    doc = setup_document()
    build_cover(doc)
    build_front(doc, data)
    build_body(doc, data)
    build_refs(doc, data)
    doc.save(out)
    print('saved', out)
    print('stats', stats(data))


if __name__ == '__main__':
    main()
