"""Builds the DBMS project report from the college template (DBMS_MINI_PROJECT_REPORT_SAMPLE.docx).

Usage (from the project root):
    python3 docs/report_assets/build_report.py <template.docx> <out.docx> [pages.json]
pages.json (optional) maps TOC / figure / table keys to page numbers (filled in on the 2nd pass).
"""
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Emu
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
A = os.path.join(ROOT, 'docs', 'report_assets')
SHOT = lambda n: os.path.join(A, 'shots', n + '.png')
CODE = lambda n: os.path.join(A, 'code', n + '.png')
APP = lambda n: os.path.join(ROOT, 'docs', 'screenshots', n + '.png')

TEMPLATE, OUT = sys.argv[1], sys.argv[2]
PAGES = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
MERGE_RUNS = '/mnt/skills/public/docx/scripts/merge_runs.py'

TITLE = 'SkillSwap Campus'
SUBTITLE = 'Peer-to-Peer Skill Exchange and Resource Sharing Platform'
FULL_TITLE = f'{TITLE}: {SUBTITLE}'
GITHUB = 'https://github.com/<your-github-username>/skillswap-campus'

# =====================================================================
# Stage 1: text replacements inside the template XML (keeps its formatting)
# =====================================================================
tmp = tempfile.mkdtemp()
merged = os.path.join(tmp, 'merged.docx')
subprocess.run([sys.executable, MERGE_RUNS, TEMPLATE, '-o', merged], check=True, capture_output=True)
with zipfile.ZipFile(merged) as z:
    names = z.namelist()
    data = {n: z.read(n) for n in names}
x = data['word/document.xml'].decode('utf8')


def rep(old, new, count=None):
    global x
    n = x.count(old)
    assert n and (count is None or n == count), (old, n)
    x = x.replace(old, new)


rep('>TITLE<', f'>{TITLE}<', 1)
rep('Disasters data Management System', FULL_TITLE, 1)
rep('Disasters Data Management System ', f'{FULL_TITLE} ', 1)
rep('UE23CS351A', 'UE24CS351A')
rep('UE24CSS351A', 'UE24CS351A')
rep('Shilpa S', 'Vaishali')
rep('T. Lohith Srinivas', 'Harsh Mannan', 3)
rep('fghdfjjkshjdhs', 'Chirag Arun Yadwad', 1)
srns = iter(['PES2UG24CS183', 'PES2UG24CS136', 'PES2UG24CS183', 'PES2UG24CS183'])
x = re.sub('PES2UG19CS203', lambda m: next(srns), x)
rep('I would like to express my gratitude', 'We would like to express our gratitude')
rep('I take this opportunity', 'We take this opportunity')
rep('support I have received from the department', 'support we have received from the department')
rep('providing to me various', 'providing us with various')
rep('encouragement I have received from my family and friends',
    'encouragement we have received from our families and friends')
data['word/document.xml'] = x.encode('utf8')
stage1 = os.path.join(tmp, 'stage1.docx')
with zipfile.ZipFile(stage1, 'w', zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, data[n])

# =====================================================================
# Stage 2: python-docx
# =====================================================================
doc = Document(stage1)
body = doc.element.body
FONT = 'Times New Roman'
MONO = 'Courier New'


def is_blank(p_el):
    if p_el.tag != qn('w:p'):
        return False
    if p_el.xpath('.//w:drawing') or p_el.xpath('.//w:pict') or p_el.xpath('.//w:sectPr') or p_el.xpath('.//w:br'):
        return False
    return ''.join(p_el.itertext()).strip() == ''


def para_with_text(text, start=0):
    for i, p in enumerate(doc.paragraphs):
        if i >= start and p.text.strip() == text:
            return p
    raise KeyError(text)


def new_page_before(p, drop_blanks=True):
    """Start paragraph p on a new page and delete the blank filler paragraphs before it."""
    if drop_blanks:
        prev = p._p.getprevious()
        while prev is not None and is_blank(prev):
            nxt = prev.getprevious()
            body.remove(prev)
            prev = nxt
    p.paragraph_format.page_break_before = True


def set_cell(cell, text, bold=None, align=None, size=None):
    paras = cell.paragraphs
    p = paras[0]
    for extra in paras[1:]:
        extra._p.getparent().remove(extra._p)
    runs = p.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r._r.getparent().remove(r._r)
        r = runs[0]
    else:
        r = p.add_run(text)
        r.font.name = FONT
    if bold is not None:
        r.bold = bold
    if size:
        r.font.size = Pt(size)
    if align is not None:
        p.alignment = align


def copy_para_text(src_p, text):
    """Fill an empty paragraph next to src_p using src_p's first-run formatting."""
    new = copy.deepcopy(src_p._p)
    src_p._p.addnext(new)
    from docx.text.paragraph import Paragraph
    np_ = Paragraph(new, src_p._parent)
    for r in np_.runs[1:]:
        r._r.getparent().remove(r._r)
    np_.runs[0].text = text
    return np_


# ---- names in the certificate (table 2) and declaration (table 4): add Chirag
t_cert, t_decl = doc.tables[2], doc.tables[4]
for t, vals in ((t_cert, ['Chirag Arun Yadwad', 'PES2UG24CS136']),
                (t_decl, ['Chirag Arun Yadwad', 'PES2UG24CS136', '<Signature>'])):
    for cell, v in zip(t.rows[0].cells, vals):
        first = cell.paragraphs[0]
        for extra in cell.paragraphs[1:]:
            if not extra.text.strip():
                extra._p.getparent().remove(extra._p)
        copy_para_text(first, v)

# ---- one page per front-matter part
cover_end = [p for p in doc.paragraphs if p._p.xpath('.//w:drawing')][2]   # PES logo on the certificate page
new_page_before(cover_end)
decl = para_with_text('DECLARATION')
decl.runs[0].text = 'DECLARATION'
for _r in decl.runs[1:]:
    _r._r.getparent().remove(_r._r)
decl.alignment = WD_ALIGN_PARAGRAPH.CENTER
new_page_before(decl)
new_page_before(para_with_text('ACKNOWLEDGEMENT'))
abstract_h = para_with_text('ABSTRACT')
new_page_before(abstract_h)
toc_h = para_with_text('TABLE OF CONTENTS')
lof_h = para_with_text('LIST OF FIGURES')

# remove everything between ABSTRACT and TABLE OF CONTENTS, then write the abstract
el = abstract_h._p.getnext()
while el is not None and el is not toc_h._p:
    nxt = el.getnext()
    body.remove(el)
    el = nxt
toc_h.paragraph_format.page_break_before = True
toc_h.paragraph_format.space_before = Pt(0)

ABSTRACT = [
    "Students on a university campus have skills they could teach and skills they want to learn, but no trusted way "
    "to find each other, agree on a time and keep the exchange fair. At the same time, calculators, lab kits and "
    "textbooks sit unused in hostel rooms while other students buy the same items. SkillSwap Campus is a web "
    "platform that solves both problems: a peer-to-peer skill marketplace paid for with campus credits, and a "
    "resource lending library.",
    "The system uses two database paradigms, each chosen for the kind of data it stores. Users, skills, sessions, "
    "reviews, the credit ledger, items and loans are relational, transactional data, so they live in PostgreSQL 16 "
    "with primary and foreign keys, CHECK, UNIQUE and GiST EXCLUDE constraints, stored procedures, thirteen triggers "
    "and five views. A credit transfer is settled atomically by a trigger, a tutor or learner can never be "
    "double-booked, and an item can never be lent to two people for overlapping dates. Skill and item descriptions "
    "are free text, so they are also stored as 384-dimensional sentence embeddings (all-MiniLM-L6-v2) in the pgvector "
    "extension with HNSW indexes. This allows semantic search (“sing indian classical music” finds a Carnatic "
    "Vocals tutor although no word matches), hybrid search that fuses vector and full-text rankings with Reciprocal "
    "Rank Fusion, and tutor recommendations.",
    "The application is built with Next.js 15 (App Router and Route Handlers) and talks to the database only "
    "through parameterised SQL. It has three roles (student, staff and admin), bcrypt-hashed passwords, JWT sessions "
    "in httpOnly cookies and configuration through environment variables. The design was verified with a "
    "24-case database integrity suite and a 51-check end-to-end API test, all of which pass.",
    "Keywords: PostgreSQL, pgvector, vector similarity search, triggers, stored procedures, transactions, Next.js.",
]
anchor = abstract_h._p
for i, txt in enumerate(ABSTRACT):
    p = doc.add_paragraph()
    anchor.addnext(p._p)
    anchor = p._p
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(8)
    if i == 0:
        p.paragraph_format.space_before = Pt(18)
    r = p.add_run(txt)
    r.font.name, r.font.size = FONT, Pt(12)
    if txt.startswith('Keywords'):
        r.text = ''
        b = p.add_run('Keywords: ')
        b.bold, b.font.name, b.font.size = True, FONT, Pt(12)
        r2 = p.add_run(txt[len('Keywords: '):])
        r2.italic, r2.font.name, r2.font.size = True, FONT, Pt(12)

new_page_before(lof_h)

# ---- delete everything after the LIST OF FIGURES table (the template's chapter stubs)
lof_table = doc.tables[7]._tbl
el = lof_table.getnext()
final_sect = body.find(qn('w:sectPr'))
while el is not None:
    nxt = el.getnext()
    if el is not final_sect:
        body.remove(el)
    el = nxt

# =====================================================================
# Helpers for the body
# =====================================================================
FIGS, TABS, TOC = [], [], []   # (key, number, title)
state = {'ch': 0, 'fig': 0, 'tab': 0}


def run(p, text, bold=False, italic=False, size=12, font=FONT, color=None):
    r = p.add_run(text)
    r.bold, r.italic = bold, italic
    r.font.name, r.font.size = font, Pt(size)
    r._element.rPr.rFonts.set(qn('w:eastAsia'), font)
    if color:
        r.font.color.rgb = RGBColor.from_string(color)
    return r


def rich(p, text, size=12):
    """**bold** and `code` inline markup."""
    for part in re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text):
        if not part:
            continue
        if part.startswith('**'):
            run(p, part[2:-2], bold=True, size=size)
        elif part.startswith('`'):
            run(p, part[1:-1], size=size - 1, font=MONO)
        else:
            run(p, part, size=size)


def para(text, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size=12, after=6, indent=False):
    p = doc.add_paragraph()
    p.alignment = align
    pf = p.paragraph_format
    pf.line_spacing = 1.5
    pf.space_after = Pt(after)
    if indent:
        pf.first_line_indent = Inches(0.4)
    rich(p, text, size)
    return p


def bullets(items, size=12):
    for it in items:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        pf = p.paragraph_format
        pf.left_indent = Inches(0.45)
        pf.first_line_indent = Inches(-0.25)
        pf.line_spacing = 1.3
        pf.space_after = Pt(3)
        run(p, '•\t', size=size)
        pf.tab_stops.add_tab_stop(Inches(0.45))
        rich(p, it, size)


def outline(p, level):
    pPr = p._p.get_or_add_pPr()
    o = OxmlElement('w:outlineLvl')
    o.set(qn('w:val'), str(level))
    pPr.append(o)


def chapter(title, key=None, numbered=True):
    if numbered:
        state['ch'] += 1
        state['fig'] = state['tab'] = 0
        text = f"{state['ch']}. {title.upper()}"
    else:
        text = title.upper()
    p = doc.add_paragraph(style='Heading 1')
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.page_break_before = True
    p.paragraph_format.space_after = Pt(12)
    r = p.add_run(text)
    r.font.name = FONT
    TOC.append((key or text, str(state['ch']) + '.' if numbered else '', title.upper(), text))
    return p


def section(title, level=1):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(12)
    pf.space_after = Pt(6)
    pf.keep_with_next = True
    run(p, title.upper() if level == 1 else title, bold=True, size=14 if level == 1 else 12)
    outline(p, level)
    return p


def caption_text(kind):
    if kind == 'fig':
        state['fig'] += 1
        return f"{state['ch']}.{state['fig']}"
    state['tab'] += 1
    return f"{state['ch']}.{state['tab']}"


def figure(path, title, width=6.5, max_h=8.0):
    w, h = Image.open(path).size
    width = min(width, max_h * w / h)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(6)
    p.add_run().add_picture(path, width=Inches(width))
    num = caption_text('fig')
    c = doc.add_paragraph()
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.paragraph_format.space_after = Pt(12)
    run(c, f'Figure {num}: ', bold=True, size=10)
    run(c, title, italic=True, size=10)
    FIGS.append((f'Figure {num}:', num, title))


def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    s = OxmlElement('w:shd')
    s.set(qn('w:val'), 'clear')
    s.set(qn('w:color'), 'auto')
    s.set(qn('w:fill'), fill)
    tcPr.append(s)


TBLPR_ORDER = ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize',
               'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar',
               'tblLook', 'tblCaption', 'tblDescription']


def tblpr_insert(tblPr, el):
    name = el.tag.split('}')[1]
    after = TBLPR_ORDER[TBLPR_ORDER.index(name) + 1:]
    for child in tblPr:
        if child.tag.split('}')[1] in after:
            child.addprevious(el)
            return
    tblPr.append(el)


def borders(table, color='808080', sz=4):
    tblPr = table._tbl.tblPr
    b = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        e = OxmlElement(f'w:{side}')
        e.set(qn('w:val'), 'single')
        e.set(qn('w:sz'), str(sz))
        e.set(qn('w:space'), '0')
        e.set(qn('w:color'), color)
        b.append(e)
    tblpr_insert(tblPr, b)


def set_widths(table, widths):
    tbl = table._tbl
    grid = tbl.tblGrid
    for gc, w in zip(grid.findall(qn('w:gridCol')), widths):
        gc.set(qn('w:w'), str(int(w * 1440)))
    for row in table.rows:
        for c, w in zip(row.cells, widths):
            c.width = Inches(w)
    tblW = tbl.tblPr.find(qn('w:tblW'))
    if tblW is None:
        tblW = OxmlElement('w:tblW')
        tblpr_insert(tbl.tblPr, tblW)
    tblW.set(qn('w:w'), str(int(sum(widths) * 1440)))
    tblW.set(qn('w:type'), 'dxa')
    lay = OxmlElement('w:tblLayout')
    lay.set(qn('w:type'), 'fixed')
    tblpr_insert(tbl.tblPr, lay)


def table(header, rows, widths, title=None, size=10, mono_cols=()):
    if title:
        num = caption_text('tab')
        c = doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c.paragraph_format.keep_with_next = True
        c.paragraph_format.space_before = Pt(6)
        run(c, f'Table {num}: ', bold=True, size=10)
        run(c, title, italic=True, size=10)
        TABS.append((f'Table {num}:', num, title))
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t)
    set_widths(t, widths)
    for i, h in enumerate(header):
        cell = t.rows[0].cells[i]
        shade(cell, 'D9E2F3')
        p = cell.paragraphs[0]
        run(p, h, bold=True, size=size)
    # repeat header row
    trPr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement('w:tblHeader')
    th.set(qn('w:val'), 'true')
    trPr.append(th)
    for ri, row in enumerate(rows, 1):
        for ci, val in enumerate(row):
            p = t.rows[ri].cells[ci].paragraphs[0]
            if ci in mono_cols:
                run(p, val, size=size - 1, font=MONO)
            else:
                rich(p, val, size=size)
    for row in t.rows:
        trPr = row._tr.get_or_add_trPr()
        cs = OxmlElement('w:cantSplit')
        trPr.append(cs)
        for c in row.cells:
            for p in c.paragraphs:
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.space_before = Pt(2)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


def code(text, size=8.5):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t, 'BFBFBF')
    set_widths(t, [6.6])
    cell = t.rows[0].cells[0]
    shade(cell, 'F3F3F3')
    lines = text.strip('\n').split('\n')
    p = cell.paragraphs[0]
    for i, line in enumerate(lines):
        if i:
            p = cell.add_paragraph()
        pf = p.paragraph_format
        pf.space_after = Pt(0)
        pf.space_before = Pt(0)
        pf.line_spacing = 1.0
        run(p, line if line else ' ', size=size, font=MONO)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def landscape_start():
    s = doc.add_section(WD_SECTION.NEW_PAGE)
    s.orientation = WD_ORIENT.LANDSCAPE
    s.page_width, s.page_height = Emu(10058400), Emu(7772400)
    s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Inches(0.5)
    return s


def portrait_start():
    s = doc.add_section(WD_SECTION.NEW_PAGE)
    s.orientation = WD_ORIENT.PORTRAIT
    s.page_width, s.page_height = Emu(7772400), Emu(10058400)
    s.left_margin = s.right_margin = s.top_margin = s.bottom_margin = Emu(721995)
    return s


def first_heading_without_break():
    """The paragraph right after a section break must not add a second page break."""
    doc.paragraphs[-1].paragraph_format.page_break_before = False


# =====================================================================
# CHAPTER 1: INTRODUCTION
# =====================================================================
chapter('Introduction')
section('1.1 Background')
para("Every semester, students in one department need help with exactly the subjects that students in another "
     "department are good at. A mechanical engineering student who plays the guitar may want help with Python, "
     "while a computer science student may want to learn the guitar. Today these students meet only by chance, "
     "through notice boards or messaging groups, and there is no record of who taught whom, no fair way to "
     "pay for help, and no protection against two people booking the same tutor at the same time.", indent=True)
para("The same pattern exists for physical items. Scientific calculators, Arduino kits, drafting tools and "
     "reference books are bought by many students and used for a few weeks each. Lending them is common but "
     "informal, so the owner does not know who has the item or when it will come back.", indent=True)
para("**SkillSwap Campus** brings both exchanges onto one platform. Students list the skills they offer and the "
     "skills they want, find each other with search that understands meaning, book sessions, pay with campus "
     "credits that move automatically when a session is completed, review each other, and lend items through "
     "a managed request and approval flow. Staff and administrators get analytics and moderation tools.", indent=True)

section('1.2 Objectives')
bullets([
    "Design a normalised relational database (ER model → relational schema) for users, skills, sessions, "
    "reviews, a credit ledger, resources, loans and notifications.",
    "Enforce every business rule **inside the database** with keys, CHECK, UNIQUE and EXCLUDE constraints, "
    "triggers and a stored procedure, so that no client can break the data.",
    "Keep the credit economy exact: credits are only created by recorded grants and only move in atomic "
    "transactions, and the balance of every user always equals the sum of their ledger.",
    "Add a vector database layer (pgvector) so free-text skill and item descriptions can be searched by meaning, "
    "and justify why vectors are needed for this data.",
    "Build a functional Next.js web application with role-based access (student, staff, admin) that uses all of "
    "the above through a secure API layer.",
    "Prove correctness with automated tests that attack the database and the API.",
])

section('1.3 Scope')
para("**In scope:** registration and login; skill listings (offered and wanted); keyword, semantic and hybrid "
     "search; “perfect swap” matching and semantic tutor recommendations; booking, confirming, completing, "
     "cancelling and reviewing sessions; the credit balance and ledger; resource listing, borrowing, approval and "
     "return; in-app notifications; admin analytics, user management, catalogue management and a DB Lab that runs "
     "the integrity tests and showcase queries live.")
para("**Out of scope:** real payments, campus single sign-on, e-mail or push notifications, and a mobile app "
     "(the web interface is responsive and works on phones).")

section('1.4 Functional Requirements')
table(['ID', 'Requirement', 'Implemented by'], [
    ['FR1', 'Users register, log in and log out; passwords are never stored in plain text.', 'users table, bcrypt, JWT cookie'],
    ['FR2', 'Three roles: student, staff (read-only admin views) and admin (full control).', 'users.role CHECK, route() wrapper, middleware'],
    ['FR3', 'Students list skills they offer or want, with level and description.', 'user_skills, skill_embeddings'],
    ['FR4', 'Search tutors by keyword, by meaning (semantic) or both (hybrid), with filters.', 'GIN full-text index, pgvector HNSW, fn_hybrid_skill_search'],
    ['FR5', 'Book a session; the system rejects clashes, past times and bookings the learner cannot afford.', 'sp_book_session, EXCLUDE constraints, triggers'],
    ['FR6', 'Confirm, complete or cancel a session; credits move automatically and atomically.', 'state-machine trigger, settlement trigger'],
    ['FR7', 'Review a completed session (participants only, once each).', 'reviews, trg_validate_review'],
    ['FR8', 'View credit balance and the full ledger with a running balance.', 'credit_transactions, window function, reconciliation view'],
    ['FR9', 'List items, request a loan, approve or reject, mark returned.', 'resource tables, daterange EXCLUDE, transaction'],
    ['FR10', 'Receive notifications for bookings, loans and reviews.', 'notification triggers'],
    ['FR11', 'Admin analytics, user management, catalogue, DB Lab.', 'views, GROUP BY / HAVING, RANK(), EXPLAIN'],
], [0.55, 3.55, 2.5], 'Functional requirements')

section('1.5 Organisation of the Report')
para("Chapter 2 defines the problem. Chapter 3 describes the technology stack and why each database paradigm was "
     "chosen. Chapters 4 and 5 present the ER model in Chen notation and its mapping to relations. Chapters 6 to 9 "
     "contain the SQL commands (DDL, DML, queries, procedures, functions and triggers) with screenshots of their "
     "execution. Chapter 10 contains the vector database commands. Chapter 11 shows the Next.js project tree, code "
     "and application screenshots, Chapter 12 the test results and Chapter 13 the completion status against the "
     "evaluation rubric.")

# =====================================================================
# CHAPTER 2: PROBLEM DEFINITION
# =====================================================================
chapter('Problem Definition')
section('2.1 Problem Statement')
para("Design and implement a campus platform where students exchange skills for credits and lend each other "
     "physical resources, such that (a) students can find the right peer even when they describe their need in "
     "their own words, (b) no booking or loan can violate time, ownership or balance rules even under concurrent "
     "use, (c) the credit economy can never create or lose credits, and (d) every action is available through a "
     "role-aware web interface.", indent=True)

section('2.2 Why This Is More Than CRUD')
bullets([
    "**Two-sided matching.** A useful match needs A to teach what B wants and B to teach what A wants "
    "(a “perfect swap”), which is a four-way self-join on the listings table.",
    "**A closed economy.** Credits behave like money. A session completion must debit one user and credit another "
    "in one indivisible step, and two completions running at the same moment must not deadlock or lose an update.",
    "**Scheduling integrity.** A tutor, a learner and a lent item each have time intervals that must never overlap. "
    "These are constraints over ranges of time, not single values.",
    "**Unstructured text.** Listings are free text. “Help with regression for my thesis” should find a Statistics "
    "tutor, which keyword matching cannot do. This requires embeddings and similarity search.",
    "**Roles and trust.** Students, staff and administrators see and do different things, and the database itself "
    "must reject invalid data whatever the client sends.",
])

section('2.3 Users and Roles')
table(['Role', 'What the role can do'], [
    ['Student', 'Manage own profile and listings, search, book and review sessions, lend and borrow items, view own credits and notifications.'],
    ['Staff', 'Everything a student can do, plus read-only access to analytics, the user list, the catalogue and the DB Lab test results.'],
    ['Admin', 'Everything staff can do, plus change roles, activate or deactivate users, grant bonus credits, edit the catalogue and use the read-only SQL console.'],
], [1.2, 5.4], 'User roles')

section('2.4 Key Business Rules')
bullets([
    "A user cannot review themselves, can review only a completed session they took part in, and only once.",
    "A session cannot be booked in the past, must last 15 to 240 minutes and must not overlap any other live session "
    "of either participant, in either role.",
    "A learner can book only if their balance minus the credits already reserved by open bookings covers the price.",
    "A session moves only along pending → confirmed → completed, or to cancelled; completing it moves the "
    "credits, and cancelling a completed session refunds them.",
    "An item cannot be borrowed by its owner, cannot be lent to two people for overlapping dates and cannot be "
    "borrowed for more than 30 days.",
])

# =====================================================================
# CHAPTER 3: TECH STACK
# =====================================================================
chapter('Tech Stack')
section('3.1 Technologies Used')
table(['Layer', 'Technology', 'Version', 'Purpose'], [
    ['Relational database', 'PostgreSQL', '16', 'All transactional data, constraints, triggers, procedures, views'],
    ['Vector database', 'pgvector extension', '0.6+', 'vector(384) columns, cosine distance <=>, HNSW indexes'],
    ['Range constraints', 'btree_gist extension', 'built-in', 'GiST EXCLUDE constraints on time and date ranges'],
    ['Embedding model', 'all-MiniLM-L6-v2 via Transformers.js (ONNX)', '3.8', 'Sentence embeddings computed locally and offline'],
    ['Web framework', 'Next.js (App Router)', '15.5', 'Pages and the API layer (Route Handlers)'],
    ['UI library', 'React', '19.2', 'Interactive pages'],
    ['Database driver', 'node-postgres (pg)', '8.16', 'Connection pool, parameterised SQL, transactions'],
    ['Authentication', 'bcryptjs, jose (JWT)', '3.0 / 6.1', 'Password hashing; signed session cookie'],
    ['Runtime', 'Node.js', '18.18+', 'Server, scripts and tests'],
    ['Cloud database (demo)', 'Neon serverless PostgreSQL', '16', 'Hosted Postgres with pgvector, used on demo day'],
    ['Version control', 'Git and GitHub', '-', 'Source history and individual contributions'],
], [1.45, 2.05, 0.75, 2.35], 'Technology stack')

section('3.2 Why SQL (PostgreSQL) for the Core Data')
para("Users, sessions, reviews, credits, items and loans are structured and strongly related, and many operations "
     "change several rows that must stay consistent. A half-applied credit transfer would corrupt the economy, and "
     "two simultaneous bookings must not both succeed. These needs map directly onto relational features: ACID "
     "transactions, foreign keys with chosen delete rules, CHECK and UNIQUE constraints, row locks, triggers and "
     "stored procedures. PostgreSQL was preferred over MySQL because it also offers EXCLUDE constraints over "
     "time ranges (no double booking), generated columns, rich PL/pgSQL and the pgvector extension.", indent=True)
section('3.3 Why a Vector Database (pgvector) for Descriptions')
para("Skill and item descriptions are unstructured text written by students in their own words. Keyword search "
     "only finds listings that share words with the query. Embedding each description as a vector captures its "
     "meaning, so a nearest-neighbour search finds relevant tutors even when no words match. pgvector was chosen "
     "over a separate vector store (such as Pinecone or Qdrant) because the vectors then live in the same "
     "database and the same transactions as the rows they describe: one SQL query can join similarity with "
     "ratings, filters and availability, and ON DELETE CASCADE removes a vector when its listing is deleted, so "
     "search can never return a deleted or stale listing.", indent=True)
table(['Data', 'Store', 'Reason'], [
    ['Users, roles, credits, ledger', 'PostgreSQL tables', 'Money-like values need ACID transactions and CHECK constraints'],
    ['Sessions and loans', 'PostgreSQL tables', 'Time-range overlap rules need EXCLUDE constraints and triggers'],
    ['Reviews and notifications', 'PostgreSQL tables', 'Must reference real sessions and users (foreign keys)'],
    ['Skill listing descriptions', 'pgvector (skill_embeddings)', 'Free text, searched by meaning'],
    ['Item descriptions', 'pgvector (resource_embeddings)', 'Free text, searched by meaning'],
], [2.0, 1.9, 2.7], 'Data type and chosen database paradigm')

section('3.4 System Architecture')
para("The browser never talks to the database directly. Pages call the Next.js Route Handlers under `app/api`, "
     "which authenticate the user, check the role, embed search text when needed and run parameterised SQL "
     "through a connection pool. Multi-step operations run inside `withTransaction()`. All business rules are "
     "enforced again inside PostgreSQL.")
figure(os.path.join(A, 'architecture.png'), 'System architecture')

# =====================================================================
# CHAPTER 4: ER MODEL
# =====================================================================
chapter('ER Model')
para("The ER model is drawn in Chen notation as taught in the course. Rectangles are entities, double rectangles "
     "are weak entities, diamonds are relationships, double diamonds are identifying relationships, ellipses are "
     "attributes, underlined attributes are keys, dashed ellipses are derived attributes and a double line shows "
     "total participation. Cardinalities are written as 1 and N on the connecting lines.")
section('4.1 Entities')
table(['Entity', 'Type', 'Key', 'Main attributes'], [
    ['USER', 'Strong', 'user_id', 'full_name, email, password_hash, role, department, credits_balance, is_active, bio, created_at, last_login_at'],
    ['CATEGORY', 'Strong', 'category_id', 'category_name'],
    ['SKILL', 'Strong', 'skill_id', 'skill_name'],
    ['SKILL_LISTING', 'Strong', 'user_skill_id', 'proficiency_level, description, is_offering, search_vector (derived)'],
    ['SESSION', 'Strong', 'session_id', 'scheduled_time, duration_minutes, status, credits_charged, location, created_at, session_period (derived)'],
    ['REVIEW', 'Strong', 'review_id', 'rating, comment, created_at'],
    ['CREDIT_TRANSACTION', 'Strong', 'transaction_id', 'amount, transaction_type, created_at'],
    ['RESOURCE', 'Strong', 'resource_id', 'title, description, condition, availability_status, created_at'],
    ['BORROW_REQUEST', 'Strong', 'request_id', 'request_date, start_date, end_date, status, return_confirmed, borrow_period (derived)'],
    ['NOTIFICATION', 'Strong', 'notification_id', 'message, is_read, created_at'],
    ['SKILL_EMBEDDING', 'Weak (owner SKILL_LISTING)', 'owner key', 'embedding, source_text, model_name, embedded_at'],
    ['RESOURCE_EMBEDDING', 'Weak (owner RESOURCE)', 'owner key', 'embedding, source_text, model_name, embedded_at'],
], [1.55, 1.25, 1.05, 2.75], 'Entities, keys and attributes', size=9)
section('4.2 Relationships')
table(['Relationship', 'Between', 'Cardinality', 'Participation'], [
    ['TEACHES', 'USER – SESSION', '1 : N', 'SESSION total'],
    ['ATTENDS', 'USER – SESSION', '1 : N', 'SESSION total'],
    ['LISTS', 'USER – SKILL_LISTING', '1 : N', 'SKILL_LISTING total'],
    ['OF_SKILL', 'SKILL – SKILL_LISTING', '1 : N', 'SKILL_LISTING total'],
    ['TOPIC_OF', 'SKILL – SESSION', '1 : N', 'SESSION total'],
    ['BELONGS_TO', 'CATEGORY – SKILL', '1 : N', 'SKILL total'],
    ['CLASSIFIED_AS', 'CATEGORY – RESOURCE', '1 : N', 'partial (category optional)'],
    ['EMBEDS (identifying)', 'SKILL_LISTING – SKILL_EMBEDDING', '1 : 1', 'SKILL_EMBEDDING total'],
    ['EMBEDS (identifying)', 'RESOURCE – RESOURCE_EMBEDDING', '1 : 1', 'RESOURCE_EMBEDDING total'],
    ['OWNS', 'USER – RESOURCE', '1 : N', 'RESOURCE total'],
    ['FOR_ITEM', 'RESOURCE – BORROW_REQUEST', '1 : N', 'BORROW_REQUEST total'],
    ['REQUESTS', 'USER – BORROW_REQUEST', '1 : N', 'BORROW_REQUEST total'],
    ['WRITES / RECEIVES', 'USER – REVIEW (two roles)', '1 : N each', 'REVIEW total'],
    ['HAS_REVIEW', 'SESSION – REVIEW', '1 : N', 'REVIEW total'],
    ['NOTIFIES', 'USER – NOTIFICATION', '1 : N', 'NOTIFICATION total'],
    ['CONCERNS', 'SESSION – NOTIFICATION', '1 : N', 'partial'],
    ['HOLDS', 'USER – CREDIT_TRANSACTION', '1 : N', 'CREDIT_TRANSACTION total'],
    ['SETTLES', 'SESSION – CREDIT_TRANSACTION', '1 : N', 'partial (bonus rows have no session)'],
], [1.6, 2.4, 1.0, 1.6], 'Relationships, cardinality and participation', size=9)
para("SESSION is modelled as an entity rather than a ternary relationship between tutor, learner and skill, "
     "because a session has its own key, attributes and life cycle and is itself referenced by reviews, "
     "notifications and ledger rows. Likewise SKILL_LISTING turns the many-to-many “user has skill” association "
     "into an entity, because each listing carries its own level, description and embedding.")
landscape_start()
figure(os.path.join(A, 'er_diagram_chen.png'), 'ER diagram of SkillSwap Campus (Chen notation)', width=10, max_h=6.85)
portrait_start()

# =====================================================================
# CHAPTER 5: ER TO RELATIONAL MAPPING
# =====================================================================
chapter('ER to Relational Mapping')
first_heading_without_break()
section('5.1 Steps of Algorithm for the Chosen Problem')
para("The standard seven-step ER-to-relational mapping algorithm was applied as follows.")
steps = [
    ("Step 1: Regular (strong) entity types.",
     "Each strong entity becomes a relation with all its simple attributes, and its key becomes the primary key: "
     "USERS(user_id), CATEGORIES(category_id), SKILLS(skill_id), USER_SKILLS(user_skill_id) for SKILL_LISTING, "
     "SESSIONS(session_id), REVIEWS(review_id), CREDIT_TRANSACTIONS(transaction_id), RESOURCE_LISTINGS(resource_id), "
     "RESOURCE_BORROW_REQUESTS(request_id) and NOTIFICATIONS(notification_id). Surrogate SERIAL keys are used and "
     "natural keys are kept as UNIQUE constraints (email, category_name, (skill_name, category_id))."),
    ("Step 2: Weak entity types.",
     "SKILL_EMBEDDING and RESOURCE_EMBEDDING become SKILL_EMBEDDINGS and RESOURCE_EMBEDDINGS. Each has exactly one "
     "embedding per owner, so the owner's primary key is both the primary key and a foreign key of the weak "
     "relation (user_skill_id, resource_id), with ON DELETE CASCADE."),
    ("Step 3: Binary 1:1 relationships.",
     "The only 1:1 relationships are the two identifying EMBEDS relationships, already mapped in Step 2 by the "
     "shared primary key (foreign-key approach on the total-participation side)."),
    ("Step 4: Binary 1:N relationships.",
     "The primary key of the 1-side is added as a foreign key on the N-side: TEACHES → sessions.offering_user_id, "
     "ATTENDS → sessions.requesting_user_id, TOPIC_OF → sessions.skill_id, LISTS → user_skills.user_id, "
     "OF_SKILL → user_skills.skill_id, BELONGS_TO → skills.category_id, CLASSIFIED_AS → "
     "resource_listings.category_id, OWNS → resource_listings.owner_id, FOR_ITEM → "
     "resource_borrow_requests.resource_id, REQUESTS → resource_borrow_requests.borrower_id, WRITES → "
     "reviews.reviewer_id, RECEIVES → reviews.reviewee_id, HAS_REVIEW → reviews.session_id, NOTIFIES → "
     "notifications.user_id, CONCERNS → notifications.related_session_id, HOLDS → credit_transactions.user_id, "
     "SETTLES → credit_transactions.session_id. Total participation becomes NOT NULL; partial participation "
     "leaves the column nullable."),
    ("Step 5: Binary M:N relationships.",
     "The many-to-many association between users and skills was modelled as the entity SKILL_LISTING, so it "
     "already became the relation USER_SKILLS in Step 1 with two foreign keys and UNIQUE(user_id, skill_id). "
     "No other M:N relationship remains."),
    ("Step 6: Multivalued attributes.",
     "None. Lists that could have been multivalued (skills of a user, reviews of a user) are separate entities."),
    ("Step 7: N-ary relationships.",
     "None. The tutor–learner–skill association is the entity SESSION with three foreign keys."),
    ("Derived attributes.",
     "search_vector, session_period and borrow_period are stored GENERATED ALWAYS columns, computed by the "
     "database from other columns so they can never be inconsistent. They are needed for the GIN full-text "
     "index and the EXCLUDE constraints."),
]
for head, txt in steps:
    p = para('')
    run(p, head + ' ', bold=True)
    rich(p, txt)
table(['Relationship', 'Mapped to (foreign key)', 'ON DELETE'], [
    ['TEACHES / ATTENDS', 'sessions.offering_user_id / requesting_user_id → users', 'RESTRICT'],
    ['TOPIC_OF', 'sessions.skill_id → skills', 'RESTRICT'],
    ['LISTS / OF_SKILL', 'user_skills.user_id → users, user_skills.skill_id → skills', 'CASCADE'],
    ['BELONGS_TO', 'skills.category_id → categories', 'RESTRICT'],
    ['CLASSIFIED_AS', 'resource_listings.category_id → categories', 'SET NULL'],
    ['OWNS', 'resource_listings.owner_id → users', 'CASCADE'],
    ['FOR_ITEM / REQUESTS', 'resource_borrow_requests.resource_id / borrower_id', 'CASCADE / RESTRICT'],
    ['WRITES / RECEIVES', 'reviews.reviewer_id / reviewee_id → users', 'RESTRICT'],
    ['HAS_REVIEW', 'reviews.session_id → sessions', 'CASCADE'],
    ['NOTIFIES / CONCERNS', 'notifications.user_id / related_session_id', 'CASCADE'],
    ['HOLDS / SETTLES', 'credit_transactions.user_id / session_id', 'CASCADE / SET NULL'],
    ['EMBEDS (x2)', 'skill_embeddings.user_skill_id, resource_embeddings.resource_id (PK = FK)', 'CASCADE'],
], [1.6, 3.6, 1.4], 'Relationships mapped to foreign keys (19 foreign keys in total)', size=9)

section('5.2 Complete Diagram of Relational Mapping')
para("Figure 5.1 shows the resulting twelve relations. Primary keys are underlined and each arrow runs from a "
     "foreign key to the primary key it references.")
landscape_start()
figure(os.path.join(A, 'relational_schema.png'), 'Relational schema after mapping (12 relations, 19 foreign keys)', width=10, max_h=6.85)
portrait_start()
section('5.3 Schema Description and Normalisation')
first_heading_without_break()
doc.paragraphs[-1].paragraph_format.space_before = Pt(0)
table(['Relation', 'Purpose', 'Important constraints'], [
    ['users', 'Accounts, roles and the cached credit balance', 'email UNIQUE + format CHECK + UNIQUE lower(email); role IN (...); credits_balance >= 0; password must be a bcrypt hash'],
    ['categories', 'Top-level subject areas', 'category_name UNIQUE'],
    ['skills', 'Skill catalogue', 'UNIQUE(skill_name, category_id); FK RESTRICT'],
    ['user_skills', 'A user offering or wanting a skill', 'UNIQUE(user_id, skill_id); level IN (4 values); generated search_vector + GIN index'],
    ['sessions', 'Booked lessons between a tutor and a learner', 'tutor <> learner; duration 15–240; status IN (...); 2 EXCLUDE constraints on session_period'],
    ['reviews', 'Ratings after completed sessions', 'rating 1–5; reviewer <> reviewee; UNIQUE(session_id, reviewer_id)'],
    ['credit_transactions', 'Append-only credit ledger', "type IN ('earned','spent','bonus','refund')"],
    ['resource_listings', 'Items students lend', 'condition and availability_status IN (...); title not blank'],
    ['resource_borrow_requests', 'Loan requests and approvals', 'end >= start; at most 30 days; EXCLUDE on borrow_period for approved loans'],
    ['notifications', 'In-app messages written by triggers', 'partial index on unread rows'],
    ['skill_embeddings', '384-d vector per skill listing', 'PK = FK CASCADE; unit-length CHECK; HNSW index'],
    ['resource_embeddings', '384-d vector per item', 'PK = FK CASCADE; unit-length CHECK; HNSW index'],
], [1.55, 2.0, 3.05], 'Schema description (data dictionary summary)', size=9)
para("All relations are in Third Normal Form: every non-key attribute depends on the whole key and nothing but "
     "the key (for example, the category of a skill is stored once in skills, not repeated in every listing). "
     "The one deliberate denormalisation is `users.credits_balance`, a cached total kept for speed. It is changed "
     "only by triggers in the same transaction as the ledger insert, and the view `credit_reconciliation_view` "
     "proves that it always equals the sum of the ledger (drift = 0).")

# =====================================================================
# CHAPTER 6: DDL
# =====================================================================
chapter('DDL Statements')
para("The schema is created by four SQL files run in order by `npm run db:setup`: `01_schema.sql` (tables, keys, "
     "constraints, indexes, views, triggers), `02_migrations.sql` (ALTER and DROP), `03_features.sql` (procedure, "
     "functions, triggers, views) and `04_vector.sql` (pgvector layer).")
section('6.1 Statements with Screenshots of the Table Creation')
code("""CREATE EXTENSION IF NOT EXISTS btree_gist;
DROP TABLE IF EXISTS notifications, resource_borrow_requests, resource_listings,
    credit_transactions, reviews, sessions, user_skills, skills, categories, users CASCADE;

CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student','staff','admin')),
    department      VARCHAR(100),
    credits_balance NUMERIC(10,2) NOT NULL DEFAULT 20.00 CHECK (credits_balance >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
    session_id          SERIAL PRIMARY KEY,
    offering_user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    requesting_user_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    skill_id            INT NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
    scheduled_time      TIMESTAMP NOT NULL,
    duration_minutes    INT NOT NULL CHECK (duration_minutes > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','completed','cancelled')),
    credits_charged     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
    location            VARCHAR(150),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (offering_user_id <> requesting_user_id),
    session_period      tsrange GENERATED ALWAYS AS (
                            tsrange(scheduled_time,
                                    scheduled_time + make_interval(mins => duration_minutes))
                        ) STORED,
    -- no tutor and no learner can be in two overlapping live sessions
    EXCLUDE USING gist (offering_user_id   WITH =, session_period WITH &&) WHERE (status <> 'cancelled'),
    EXCLUDE USING gist (requesting_user_id WITH =, session_period WITH &&) WHERE (status <> 'cancelled')
);

CREATE TABLE resource_borrow_requests (
    request_id        SERIAL PRIMARY KEY,
    resource_id       INT NOT NULL REFERENCES resource_listings(resource_id) ON DELETE CASCADE,
    borrower_id       INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    request_date      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','returned')),
    return_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (end_date >= start_date),
    borrow_period     daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
    EXCLUDE USING gist (resource_id WITH =, borrow_period WITH &&) WHERE (status = 'approved')
);""")
para("The remaining tables (categories, skills, user_skills, reviews, credit_transactions, resource_listings, "
     "notifications) follow the same pattern; the complete script is `db/01_schema.sql`.")
figure(SHOT('ddl_01_create'), 'Running db/01_schema.sql on an empty database', max_h=7.6)
figure(SHOT('ddl_03_dt'), 'Tables in the database (\\dt)', width=4.6)
figure(SHOT('ddl_04_users'), 'Structure of USERS with its constraints and triggers (\\d users)')
figure(SHOT('ddl_05_sessions'), 'Structure of SESSIONS: generated tsrange column and EXCLUDE constraints')
figure(SHOT('ddl_06_borrow'), 'Structure of RESOURCE_BORROW_REQUESTS')

section('6.2 ALTER and DROP Statements')
code("""ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(300);
ALTER TABLE users ADD CONSTRAINT chk_users_email_format
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$');
ALTER TABLE users ADD CONSTRAINT chk_users_password_is_hash
    CHECK (password_hash LIKE '$2%' AND char_length(password_hash) = 60);
ALTER TABLE sessions ADD CONSTRAINT chk_session_duration_max
    CHECK (duration_minutes BETWEEN 15 AND 240);
ALTER TABLE resource_borrow_requests ADD CONSTRAINT chk_borrow_max_30_days
    CHECK (end_date - start_date <= 30);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));
ALTER TABLE sessions ALTER COLUMN location SET DEFAULT 'Library Study Room';
DROP INDEX IF EXISTS idx_userskills_user;     -- redundant: UNIQUE(user_id, skill_id) leads with user_id
DROP INDEX IF EXISTS idx_notifications_user;
CREATE INDEX idx_notifications_user_recent
    ON notifications (user_id, created_at DESC) WHERE NOT is_read;""")
figure(SHOT('ddl_02_migrations'), 'Running the ALTER / DROP migrations (db/02_migrations.sql)', width=4.6)

section('6.3 Indexes and Views')
code("""CREATE INDEX idx_userskills_search   ON user_skills USING GIN (search_vector);
CREATE INDEX idx_userskills_offering ON user_skills(skill_id, proficiency_level) WHERE is_offering;
CREATE INDEX idx_sessions_schedule   ON sessions(scheduled_time) WHERE status IN ('pending','confirmed');
CREATE INDEX idx_credit_tx_user      ON credit_transactions(user_id, created_at);

CREATE VIEW credit_reconciliation_view AS
SELECT u.user_id, u.full_name, u.credits_balance,
       COALESCE(SUM(ct.amount), 0)                     AS ledger_balance,
       u.credits_balance - COALESCE(SUM(ct.amount), 0) AS drift
FROM users u
LEFT JOIN credit_transactions ct ON ct.user_id = u.user_id
GROUP BY u.user_id, u.full_name, u.credits_balance;""")
table(['Object', 'Count', 'Examples'], [
    ['Tables', '12', '10 relational + 2 vector tables'],
    ['Foreign keys', '19', 'with RESTRICT, CASCADE and SET NULL delete rules'],
    ['CHECK constraints', '24', 'email format, bcrypt hash, rating 1–5, balance >= 0, unit-length vectors'],
    ['EXCLUDE constraints', '3', 'tutor overlap, learner overlap, item loan overlap'],
    ['Indexes', '37', 'B-tree, partial, expression (lower(email)), GIN full-text, GiST, HNSW'],
    ['Views', '5', 'available_skills_view, credit_reconciliation_view, tutor_leaderboard_view, skill_demand_view, embedding_coverage_view'],
    ['Triggers', '13', 'settlement, state machine, clash check, validation, notifications, embedding staleness'],
    ['Procedures and functions', '22', 'sp_book_session, fn_hybrid_skill_search, fn_perfect_swaps, ...'],
], [1.8, 0.7, 4.1], 'Database objects created (counted from the system catalogue)')

# =====================================================================
# CHAPTER 7: DML
# =====================================================================
chapter('DML Statements')
para("Demo data is loaded by `scripts/seed.mjs`: 18 users, 11 categories, 32 skills, 49 skill listings, 57 sessions, "
     "49 reviews, 16 items and 23 borrow requests, plus the ledger and notification rows written by triggers. "
     "Session times are generated relative to the current date so that the demo always has past, today's and "
     "future bookings.")
section('7.1 Statements with Screenshots of the Tables with Inserted Values')
para("Figure 7.1 shows INSERT statements run in psql. Note that inserting a user automatically wrote a 20-credit "
     "`bonus` row into the ledger: that is the trigger `trg_record_opening_grant`, which keeps the balance and the "
     "ledger equal from the first moment.")
figure(SHOT('dml_01_insert'), 'INSERT statements (category, skill, user and skill listing)')
figure(SHOT('dml_02_users'), 'USERS table with inserted values')
figure(SHOT('dml_03_catalogue'), 'CATEGORIES and SKILLS tables')
figure(SHOT('dml_04_user_skills'), 'USER_SKILLS (skill listings) table')
figure(SHOT('dml_05_sessions'), 'SESSIONS table')
figure(SHOT('dml_06_reviews_ledger'), 'REVIEWS and CREDIT_TRANSACTIONS tables')
figure(SHOT('dml_07_resources'), 'RESOURCE_LISTINGS and RESOURCE_BORROW_REQUESTS tables')
figure(SHOT('dml_08_notifications'), 'NOTIFICATIONS table (rows written by triggers)')

# =====================================================================
# CHAPTER 8: QUERIES
# =====================================================================
chapter('Queries')
para("The following queries were run in psql on the demo data. The same queries (and more) are available in the "
     "application under Admin → DB Lab → Important queries, and in `db/05_important_queries.sql`.")
section('8.1 Simple Query with GROUP BY, Aggregate')
para("Busiest categories: completed sessions are joined to their skill and category, grouped by category and "
     "aggregated with COUNT, SUM and AVG. HAVING keeps only categories with at least three completed sessions "
     "(WHERE filters rows before grouping; HAVING filters groups after aggregation).")
figure(SHOT('q_01_groupby'), 'GROUP BY with COUNT, SUM, AVG and HAVING', width=5.2)
section('8.2 Update Operation')
para("The first UPDATE changes a user's profile. The second confirms a pending session; this fires "
     "`trg_session_state_machine` (checks that pending → confirmed is legal) and `trg_notify_session`, which "
     "inserted the notification shown by the third query in the same transaction.")
figure(SHOT('q_02_update'), 'UPDATE operations and the notification written by a trigger')
section('8.3 Delete Operation')
para("The first DELETE removes a user's old read notifications. The second deletes the skill inserted in "
     "Chapter 7. The third is refused: skills still reference the category Music, and the foreign key "
     "`skills_category_id_fkey` is ON DELETE RESTRICT, so the database protects the catalogue.")
figure(SHOT('q_03_delete'), 'DELETE operations, including one blocked by a foreign key')
section('8.4 Correlated Query')
para("A correlated subquery refers to the row of the outer query and is evaluated once per outer row. The first "
     "query computes, for every user who offers a skill, the number of sessions they taught and their average "
     "rating. The second uses NOT EXISTS to find learners who want a skill but have never completed a session.")
figure(SHOT('q_04_correlated'), 'Correlated subqueries with EXISTS and NOT EXISTS')
section('8.5 Nested Query')
para("The first query nests three levels of IN / = subqueries to find everyone who teaches a skill in the Music "
     "category. The second compares each tutor's average rating with the overall average returned by an inner "
     "query, inside HAVING.")
figure(SHOT('q_05_nested'), 'Nested queries')
section('8.6 Join, View and Window Functions')
para("The leaderboard view ranks tutors with RANK() over completed sessions and ratings. The second query computes "
     "a running balance with SUM() OVER (ORDER BY ...), which is what the Credits page shows.")
figure(SHOT('q_06_join_window'), 'Leaderboard view (RANK) and running balance (SUM OVER)')

# =====================================================================
# CHAPTER 9: PROCEDURES, FUNCTIONS, TRIGGERS
# =====================================================================
chapter('Stored Procedures, Functions and Triggers')
section('9.1 Stored Procedures or Functions')
table(['Routine', 'Kind', 'Purpose'], [
    ['sp_book_session', 'Procedure', 'Books a session: checks the tutor offers the skill, locks both users, checks available credits, inserts'],
    ['fn_available_credits', 'Function', 'Balance minus credits reserved by open bookings'],
    ['fn_perfect_swaps', 'Function', 'Users who teach what I want and want what I teach (4-way self-join)'],
    ['fn_semantic_skill_search', 'Function', 'k-NN over skill embeddings with <=>'],
    ['fn_hybrid_skill_search', 'Function', 'Vector + full-text ranking fused with Reciprocal Rank Fusion'],
    ['fn_recommend_tutors', 'Function', 'LATERAL k-NN: closest offered listings for each wanted skill'],
    ['fn_semantic_resource_search', 'Function', 'k-NN over item embeddings'],
    ['fn_search_skills', 'Function', 'Full-text search with ts_rank'],
    ['fn_current_actor', 'Function', 'Reads the acting user id set by the application for triggers'],
], [1.9, 0.9, 3.8], 'Stored procedure and functions', size=9)
para("The booking procedure is shown below. It locks the two participants in a fixed order (lowest user_id "
     "first), so it can never deadlock with the settlement trigger, which uses the same order.")
code("""CREATE OR REPLACE PROCEDURE sp_book_session(
    p_offering_user INT, p_requesting_user INT, p_skill_id INT, p_scheduled_time TIMESTAMP,
    p_duration INT, p_credits NUMERIC, p_location VARCHAR DEFAULT NULL,
    INOUT p_session_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE v_available NUMERIC(10,2); v_active BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM user_skills us JOIN users u ON u.user_id = us.user_id
                   WHERE us.user_id = p_offering_user AND us.skill_id = p_skill_id
                     AND us.is_offering AND u.is_active) THEN
        RAISE EXCEPTION 'User % does not offer skill % (or the account is inactive)',
            p_offering_user, p_skill_id USING ERRCODE = 'check_violation';
    END IF;
    -- lock both participants, lowest user_id first (same order as the settlement trigger)
    PERFORM 1 FROM users WHERE user_id = LEAST(p_offering_user, p_requesting_user)    FOR UPDATE;
    PERFORM 1 FROM users WHERE user_id = GREATEST(p_offering_user, p_requesting_user) FOR UPDATE;
    SELECT is_active INTO v_active FROM users WHERE user_id = p_requesting_user;
    IF NOT v_active THEN
        RAISE EXCEPTION 'Account % is deactivated', p_requesting_user USING ERRCODE = 'check_violation';
    END IF;
    v_available := fn_available_credits(p_requesting_user);
    IF v_available < p_credits THEN
        RAISE EXCEPTION 'Insufficient available credits: you have % free (after open bookings) but this session costs %',
            v_available, p_credits USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO sessions (offering_user_id, requesting_user_id, skill_id, scheduled_time,
                          duration_minutes, credits_charged, location)
    VALUES (p_offering_user, p_requesting_user, p_skill_id, p_scheduled_time, p_duration, p_credits,
            COALESCE(NULLIF(btrim(p_location), ''), 'Library Study Room'))
    RETURNING session_id INTO p_session_id;
END; $$;""", size=8)
figure(SHOT('p_01_routines'), 'Procedures and functions in the database')
figure(SHOT('p_02_procedure'), 'Calling sp_book_session: a valid booking, a rejected over-booking and fn_perfect_swaps')

section('9.2 Triggers')
table(['Trigger', 'Table', 'Timing / event', 'What it does'], [
    ['trg_validate_session', 'sessions', 'BEFORE INSERT/UPDATE', 'No bookings in the past; price frozen after completion'],
    ['trg_session_state_machine', 'sessions', 'BEFORE INSERT/UPDATE', 'Only legal status changes; cannot complete before the session starts'],
    ['trg_check_cross_role_clash', 'sessions', 'BEFORE INSERT/UPDATE', 'A person cannot teach and learn at the same time'],
    ['trg_session_completed', 'sessions', 'AFTER UPDATE', 'Moves credits atomically and writes two ledger rows (or refunds)'],
    ['trg_notify_session', 'sessions', 'AFTER INSERT/UPDATE', 'Notifies the other participant'],
    ['trg_validate_review', 'reviews', 'BEFORE INSERT', 'Reviewer took part, session completed, reviewee is the other person'],
    ['trg_notify_review', 'reviews', 'AFTER INSERT', 'Notifies the reviewed user'],
    ['trg_record_opening_grant', 'users', 'AFTER INSERT', 'Records the 20-credit opening bonus in the ledger'],
    ['trg_validate_borrow', 'resource_borrow_requests', 'BEFORE INSERT/UPDATE', 'No borrowing your own item, no past dates, legal status changes'],
    ['trg_sync_resource_availability', 'resource_borrow_requests', 'AFTER INSERT/UPDATE', 'Keeps the item status (available / borrowed) in step'],
    ['trg_notify_borrow', 'resource_borrow_requests', 'AFTER INSERT/UPDATE', 'Notifies owner and borrower'],
    ['trg_invalidate_skill_embedding', 'user_skills', 'AFTER UPDATE', 'Deletes the stale vector when the description changes'],
    ['trg_invalidate_resource_embedding', 'resource_listings', 'AFTER UPDATE', 'Deletes the stale vector when the item text changes'],
], [1.95, 1.3, 1.25, 2.1], 'Triggers', size=8.5)
para("The credit settlement trigger is the most important one. It fires when a session becomes completed (or a "
     "completed session is cancelled), locks both users in user_id order and updates both balances in a single "
     "statement, then writes the matching ledger rows. Because it runs inside the same transaction as the status "
     "change, either everything happens or nothing does.")
code("""CREATE OR REPLACE FUNCTION fn_apply_session_credits() RETURNS TRIGGER AS $$
DECLARE v_balance NUMERIC(10,2); v_sign INT;
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN v_sign := 1;   -- settle
    ELSIF OLD.status = 'completed' AND NEW.status <> 'completed' THEN v_sign := -1; -- refund
    ELSE RETURN NEW; END IF;
    IF NEW.credits_charged = 0 THEN RETURN NEW; END IF;
    -- deterministic lock order prevents deadlocks between concurrent completions
    PERFORM 1 FROM users WHERE user_id = LEAST(NEW.offering_user_id, NEW.requesting_user_id) FOR NO KEY UPDATE;
    PERFORM 1 FROM users WHERE user_id = GREATEST(NEW.offering_user_id, NEW.requesting_user_id) FOR NO KEY UPDATE;
    SELECT credits_balance INTO v_balance FROM users
     WHERE user_id = CASE WHEN v_sign = 1 THEN NEW.requesting_user_id ELSE NEW.offering_user_id END;
    IF v_balance < NEW.credits_charged THEN
        RAISE EXCEPTION 'Insufficient credits: balance % is less than the % required for session %',
            v_balance, NEW.credits_charged, NEW.session_id USING ERRCODE = 'check_violation';
    END IF;
    UPDATE users SET credits_balance = credits_balance
           + CASE WHEN user_id = NEW.offering_user_id THEN v_sign * NEW.credits_charged
                  ELSE -v_sign * NEW.credits_charged END
     WHERE user_id IN (NEW.offering_user_id, NEW.requesting_user_id);
    INSERT INTO credit_transactions (user_id, session_id, amount, transaction_type)
    VALUES (NEW.requesting_user_id, NEW.session_id, -v_sign * NEW.credits_charged,
            CASE WHEN v_sign = 1 THEN 'spent' ELSE 'refund' END),
           (NEW.offering_user_id, NEW.session_id, v_sign * NEW.credits_charged,
            CASE WHEN v_sign = 1 THEN 'earned' ELSE 'refund' END);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_completed AFTER UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION fn_apply_session_credits();""", size=8)
figure(SHOT('t_01_triggers'), 'Triggers in the database')
figure(SHOT('t_02_trigger_rejects'), 'Triggers and constraints rejecting invalid data')
figure(SHOT('t_03_settlement'), 'Completing a session: credits move, ledger rows are written, total drift stays 0')

section('9.3 Transactions')
para("Operations that touch several rows run inside one transaction in the API layer through `withTransaction()` "
     "in `lib/db.mjs` (Figure 11.2): BEGIN, the statements, then COMMIT, or ROLLBACK on any error. Examples:")
bullets([
    "**Booking:** `CALL sp_book_session(...)` inside a transaction; the procedure's row locks and the EXCLUDE "
    "constraints make concurrent bookings safe.",
    "**Approving a loan:** lock the item row with `SELECT ... FOR UPDATE`, approve the request, reject every "
    "overlapping pending request, COMMIT. The UI reports how many requests were auto-rejected.",
    "**Granting bonus credits (admin):** update the balance, insert the ledger row and insert a notification, "
    "all or nothing.",
    "**Completing a session:** the status update and the settlement trigger form one atomic unit.",
])

# =====================================================================
# CHAPTER 10: VECTOR DATABASE
# =====================================================================
chapter('Vector Database Commands (pgvector)')
section('10.1 Vector Data Model and Retrieval Strategy')
table(['Question', 'Answer'], [
    ['What is embedded?', 'Every skill listing as the text "<skill> (<category>), <level> level: <description>" and every item as "<title> (<category>): <description>". The exact text is stored in source_text.'],
    ['Embedding model', 'sentence-transformers all-MiniLM-L6-v2 (ONNX, 8-bit quantised) run locally with Transformers.js; 384 dimensions; mean pooling; L2-normalised. No API key, works offline, data never leaves the server.'],
    ['How vectors are stored', 'pgvector columns vector(384) in skill_embeddings and resource_embeddings; one row per listing; PK = FK to the listing with ON DELETE CASCADE; metadata model_name and embedded_at.'],
    ['Index', 'HNSW (vector_cosine_ops) on both tables: approximate nearest-neighbour graph, no training step, handles inserts well.'],
    ['Similarity metric', 'Cosine distance with the <=> operator; similarity = 1 − distance.'],
    ['Retrieval', 'The query text is embedded with the same model, then ORDER BY embedding <=> query LIMIT k, joined with available_skills_view for name, rating and filters. Hybrid mode fuses vector and full-text ranks with RRF: score = Σ 1 / (60 + rank).'],
    ['Consistency', 'A CHECK rejects vectors that are not unit length; a trigger deletes the vector when the text changes and the API re-embeds it; CASCADE removes vectors with their listing.'],
], [1.5, 5.1], 'Vector database design (requirement 8)', size=9.5)

section('10.2 Creating the Vector Store')
code("""CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE skill_embeddings (
    user_skill_id INT PRIMARY KEY REFERENCES user_skills(user_skill_id) ON DELETE CASCADE,
    embedding     vector(384)  NOT NULL,
    source_text   TEXT         NOT NULL,
    model_name    VARCHAR(100) NOT NULL DEFAULT 'Xenova/all-MiniLM-L6-v2',
    embedded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_skill_embedding_normalised CHECK (abs(vector_norm(embedding) - 1) < 0.01)
);
-- resource_embeddings has the same shape, keyed by resource_id

CREATE INDEX idx_skill_embeddings_hnsw    ON skill_embeddings    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_resource_embeddings_hnsw ON resource_embeddings USING hnsw (embedding vector_cosine_ops);

-- inserting / updating a vector (done by lib/embeddings.mjs)
INSERT INTO skill_embeddings (user_skill_id, embedding, source_text, model_name)
VALUES ($1, $2::vector, $3, $4)
ON CONFLICT (user_skill_id) DO UPDATE
   SET embedding = EXCLUDED.embedding, source_text = EXCLUDED.source_text,
       model_name = EXCLUDED.model_name, embedded_at = CURRENT_TIMESTAMP;""")
figure(SHOT('v_01_extension'), 'pgvector extension and the skill_embeddings table')
figure(SHOT('v_02_vectors'), 'Stored 384-dimensional unit vectors and embedding coverage')

section('10.3 Similarity Search (k-Nearest Neighbours)')
code("""CREATE OR REPLACE FUNCTION fn_semantic_skill_search(p_embedding vector(384), p_limit INT DEFAULT 10)
RETURNS TABLE (user_skill_id INT, similarity NUMERIC) AS $$
    SELECT se.user_skill_id,
           ROUND((1 - (se.embedding <=> p_embedding))::numeric, 4) AS similarity
    FROM skill_embeddings se
    JOIN user_skills us ON us.user_skill_id = se.user_skill_id
    WHERE us.is_offering
    ORDER BY se.embedding <=> p_embedding     -- served by the HNSW index
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;""")
para("Figure 10.3 finds the five listings closest in meaning to Ishita's Statistics listing. The nearest "
     "listings are data and programming subjects (Python, Machine Learning, SQL & Databases): they are found by "
     "the meaning of their descriptions, although none of them is called Statistics.")
figure(SHOT('v_03_knn'), 'k-NN search with the <=> cosine distance operator')

section('10.4 Hybrid Search with Reciprocal Rank Fusion')
code("""CREATE OR REPLACE FUNCTION fn_hybrid_skill_search(p_query TEXT, p_embedding vector(384),
                                                  p_limit INT DEFAULT 10, p_k INT DEFAULT 60)
RETURNS TABLE (user_skill_id INT, semantic_rank BIGINT, keyword_rank BIGINT,
               similarity NUMERIC, rrf_score NUMERIC) AS $$
    WITH sem AS (SELECT n.user_skill_id, n.similarity,
                        ROW_NUMBER() OVER (ORDER BY n.similarity DESC) AS rnk
                 FROM fn_semantic_skill_search(p_embedding, 50) n),
         kw  AS (SELECT us.user_skill_id,
                        ROW_NUMBER() OVER (ORDER BY ts_rank(us.search_vector,
                                           websearch_to_tsquery('english', p_query)) DESC) AS rnk
                 FROM user_skills us
                 WHERE us.is_offering AND us.search_vector @@ websearch_to_tsquery('english', p_query))
    SELECT COALESCE(sem.user_skill_id, kw.user_skill_id), sem.rnk, kw.rnk, sem.similarity,
           ROUND((COALESCE(1.0 / (p_k + sem.rnk), 0) + COALESCE(1.0 / (p_k + kw.rnk), 0))::numeric, 5)
    FROM sem FULL OUTER JOIN kw ON kw.user_skill_id = sem.user_skill_id
    ORDER BY 5 DESC LIMIT p_limit;
$$ LANGUAGE sql STABLE;""", size=8)
para("Figure 10.4 runs the three search modes from Node.js for the query “sing indian classical music”. Keyword "
     "search finds nothing because no listing contains those words; semantic and hybrid search both rank Diya "
     "Patel's Carnatic Vocals listing first. This is the reason the vector database is part of the design.")
figure(SHOT('v_06_search_demo'), 'Keyword vs semantic vs hybrid search for the same query')

section('10.5 Semantic Recommendations')
para("`fn_recommend_tutors` uses a LATERAL join: for each skill the user wants, a correlated k-NN subquery finds "
     "the closest listings other active users offer.")
figure(SHOT('v_04_recommend'), 'Semantic tutor recommendations for Priya')
section('10.6 Proof that the HNSW Index is Used')
figure(SHOT('v_05_explain'), 'EXPLAIN shows an Index Scan using idx_skill_embeddings_hnsw', width=5.6)
para("On the small demo data set PostgreSQL may prefer a sequential scan, so `enable_seqscan` is turned off to "
     "show the plan the index produces on larger data.", size=11)

# =====================================================================
# CHAPTER 11: FRONT END
# =====================================================================
chapter('Front End Development')
section('11.1 Next.js Project Tree Structure')
para("The project uses the Next.js App Router. Pages live in `app/` (the `(app)` route group holds the pages that "
     "need a login), the REST API lives in `app/api/` as Route Handlers (one folder per resource, `route.js` per "
     "endpoint), shared server code lives in `lib/` and all SQL lives in `db/`. `node_modules/`, `.next/` and the "
     "model files are omitted.")
tree_lines = open(os.path.join(A, 'code', 'project_tree.txt')).read().rstrip('\n').split('\n')
split = next(i for i, l in enumerate(tree_lines) if l.startswith('├── components/'))
left, right = tree_lines[:split], tree_lines[split:]
t = doc.add_table(rows=1, cols=2)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
borders(t, 'BFBFBF')
set_widths(t, [3.3, 3.3])
for cell, lines in zip(t.rows[0].cells, (left, right)):
    shade(cell, 'F7F7F7')
    p = cell.paragraphs[0]
    for i, line in enumerate(lines):
        if i:
            p = cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        run(p, line, size=7.5, font='DejaVu Sans Mono')
num = caption_text('fig')
c = doc.add_paragraph()
c.alignment = WD_ALIGN_PARAGRAPH.CENTER
c.paragraph_format.space_before = Pt(6)
run(c, f'Figure {num}: ', bold=True, size=10)
run(c, 'Next.js project tree', italic=True, size=10)
FIGS.append((f'Figure {num}:', num, 'Next.js project tree'))

section('11.2 Database–Application Integration')
para("Every page fetches JSON from a Route Handler. Each handler is wrapped by `route()` (authentication, role "
     "check, error mapping), uses parameterised SQL through `lib/db.mjs` and turns PostgreSQL errors into "
     "friendly messages that still show the SQLSTATE and constraint name. The database URL and JWT secret come "
     "only from environment variables (`.env.local`, git-ignored).")
table(['Endpoint', 'Method', 'Roles', 'Database work'], [
    ['/api/auth/register, /login', 'POST', 'public', 'INSERT user (bcrypt hash), opening-grant trigger; verify hash'],
    ['/api/skills/search', 'GET', 'any user', 'Full-text, fn_semantic_skill_search or fn_hybrid_skill_search'],
    ['/api/my-skills', 'GET / POST / PATCH / DELETE', 'any user', 'user_skills + upsert embedding'],
    ['/api/sessions', 'GET / POST', 'any user', 'JOIN query; CALL sp_book_session in a transaction'],
    ['/api/sessions/[id]', 'PATCH', 'participants', 'Status change → state machine and settlement triggers'],
    ['/api/reviews', 'POST', 'participants', 'INSERT review → validation and notification triggers'],
    ['/api/credits', 'GET', 'any user', 'Ledger with SUM() OVER running balance; reconciliation view'],
    ['/api/resources, /api/borrow/[id]', 'GET / POST / PATCH', 'any user', 'Items, requests; approve = SELECT FOR UPDATE transaction'],
    ['/api/admin/analytics', 'GET', 'admin, staff', 'GROUP BY / HAVING, views, RANK()'],
    ['/api/admin/users, /catalog', 'GET / PATCH / POST', 'admin (staff read)', 'Roles, activation, bonus credits (transaction), catalogue'],
    ['/api/admin/db-lab', 'POST', 'admin (staff tests)', 'Integrity suite, showcase queries, read-only SQL console'],
], [1.9, 1.25, 1.05, 2.4], 'Main API endpoints', size=8.5)

section('11.3 Sample Screenshots of Application Code')
figure(CODE('code_01_transaction'), 'lib/db.mjs: withTransaction() (BEGIN / COMMIT / ROLLBACK)')
figure(CODE('code_02_booking_api'), 'app/api/sessions/route.js: booking through the stored procedure')
figure(CODE('code_03_search_api'), 'app/api/skills/search/route.js: embedding the query text')
figure(CODE('code_03b_search_api'), 'app/api/skills/search/route.js: semantic and hybrid SQL')
figure(CODE('code_04_embeddings'), 'lib/embeddings.mjs: local MiniLM model, normalised vectors', width=5.6)
figure(CODE('code_05_roles'), 'lib/api.js: authentication and role-based authorisation for every API route')
figure(CODE('code_06_middleware'), 'middleware.js: page-level guard for logged-in and admin pages')

section('11.4 Sample Screenshots of the Demo')
for n, cap in [
    ('01_landing', 'Landing page'),
    ('02_login', 'Login page with demo accounts'),
    ('03_dashboard', 'Student dashboard: credits, upcoming sessions, perfect swaps and recommendations'),
    ('04_search_hybrid', 'Hybrid search: “sing indian classical music” finds Carnatic Vocals'),
    ('05_search_keyword', 'Keyword search for the same query finds nothing'),
    ('06_book_modal', 'Booking a session'),
    ('21_clash_error', 'Booking rejected by the cross-role clash trigger'),
    ('22_exclusion_error', 'Booking rejected by the EXCLUDE constraint (SQLSTATE 23P01 shown)'),
    ('08_sessions', 'Sessions page: confirm, complete, cancel and review'),
    ('12_credits', 'Credits page: running balance and reconciliation check'),
    ('10_resources', 'Resource lending library with semantic item search'),
    ('23_approve_transaction', 'Approving a loan auto-rejects overlapping requests in the same transaction'),
    ('14_admin_analytics', 'Admin analytics'),
    ('15_admin_users', 'Admin user management (roles, activation, bonus credits)'),
    ('19_dblab_explain', 'DB Lab: important queries with EXPLAIN ANALYZE'),
    ('24_readonly_console', 'DB Lab SQL console runs in a READ ONLY transaction'),
]:
    figure(APP(n), cap, max_h=7.2)
figure(APP('20_mobile_dashboard'), 'Responsive layout on a phone', width=2.6)

# =====================================================================
# CHAPTER 12: TESTING
# =====================================================================
chapter('Testing Results')
section('12.1 Database Integrity Suite (24 tests)')
para("`npm run db:test` (also the “Run all tests” button in DB Lab) attacks the database directly. Each test runs "
     "inside a transaction that is rolled back, so the data never changes. 19 tests try to store invalid data and "
     "must be rejected; 5 tests perform valid operations and check their side effects.")
table(['ID', 'Test', 'Expected', 'Result'], [
    ['A–F', 'Self-review, stranger review, review before completion, booking in the past, double-booking a tutor, unaffordable booking', 'Rejected', 'PASS'],
    ['G, S', 'Over-booking beyond available credits; teaching and learning at the same time', 'Rejected', 'PASS'],
    ['H, I', 'Illegal status jump cancelled → completed; completing before the session starts', 'Rejected', 'PASS'],
    ['J, K', 'Owner borrows own item; one item lent twice for overlapping dates', 'Rejected', 'PASS'],
    ['L–O', 'Invalid e-mail, plain-text password, duplicate e-mail by case, rating outside 1–5', 'Rejected', 'PASS'],
    ['P–R', 'Negative balance, deleting a used category, corrupt (non-unit) vector', 'Rejected', 'PASS'],
    ['V1–V5', 'Valid booking notifies tutor; completion moves credits (drift 0); refund on cancel; loan marks item borrowed; edit invalidates stale vector', 'Accepted', 'PASS'],
], [0.6, 4.0, 0.9, 0.7], 'Database integrity tests (24/24 pass)', size=9)
figure(SHOT('test_01_db'), 'npm run db:test: 24 / 24 tests pass', max_h=8.2)
section('12.2 End-to-End API Tests (51 checks)')
para("`npm run test:api` drives the running application over HTTP like a browser: authentication and roles, "
     "registration validation, search modes, booking rules, the session life cycle with credit settlement, reviews, "
     "listings and embeddings, resource lending and admin functions. It finishes by checking that the ledger "
     "drift is still zero after all operations.")
figure(SHOT('test_02_api'), 'npm run test:api: 51 passed, 0 failed')
figure(APP('17_dblab_tests'), 'The same integrity suite run from the DB Lab page', max_h=7.6)

# =====================================================================
# CHAPTER 13: EVALUATION RUBRICS
# =====================================================================
chapter('Evaluation Rubrics Completion Status')
section('13.1 Project Requirements')
D = 'Completed'
table(['#', 'Requirement', 'Status', 'Evidence'], [
    ['1', 'Unique title; real-world problem; not simple CRUD', D, 'Ch. 1–2: matching, credit economy, scheduling integrity, semantic search'],
    ['2', 'Two-member team, both on database and application', D, 'Section 13.3; Git history'],
    ['3', 'SQL + vector database (Option 2)', D, 'PostgreSQL 16 + pgvector (Ch. 3, 6–10)'],
    ['4', 'ER diagram, relational schema, keys, relationships, constraints; vector data model', D, 'Ch. 4, 5, 10.1'],
    ['5', 'DDL: CREATE, ALTER, DROP, PK/FK, constraints, indexes, views', D, 'Ch. 6 (12 tables, 19 FKs, 24 CHECK, 3 EXCLUDE, 37 indexes, 5 views)'],
    ['6', 'DML: INSERT, UPDATE, DELETE, SELECT with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries', D, 'Ch. 7, 8'],
    ['7', 'At least four advanced features', D, 'Transactions, views, procedure/functions, 13 triggers, indexing, full-text search, vector similarity search (Ch. 6, 9, 10)'],
    ['8', 'Vector embeddings and similarity search, explained', D, 'Ch. 10 (what, model, storage, metric, retrieval)'],
    ['9', 'Functional Next.js web interface with forms, tables, search, filters, dashboards', D, 'Section 11.4'],
    ['10', 'Backend/API layer; no hard-coded credentials; environment variables', D, 'Section 11.2; .env.example; lib/db.mjs'],
    ['11', 'Authentication and at least two roles', D, 'Student, staff, admin; Figures 11.7–11.8'],
    ['12', 'Validation and integrity at database level', D, 'CHECK, UNIQUE, FK, EXCLUDE, triggers; Ch. 12 tests'],
    ['13', 'Security: no plain-text passwords or credentials', D, 'bcrypt + DB CHECK on hash format; httpOnly JWT; parameterised SQL; read-only console'],
    ['14', 'Documentation (problem, objectives, scope, requirements, ER, schema, justification, data dictionary, implementation, queries, architecture, screenshots, tests, conclusion)', D, 'This report; README.md; DEMO_GUIDE.md'],
    ['15', 'Git/GitHub with individual commits and README', D, 'GitHub repository (link at the end of the report)'],
    ['16', 'Demonstration of all required items', D, 'Demonstrated in the evaluation; DEMO_GUIDE.md script'],
    ['17', 'Original design and implementation', D, 'Own schema, logic, tests and UI'],
    ['18', 'Level 3: beyond CRUD, justified choice of SQL and vector DB', D, 'Sections 2.2, 3.2, 3.3, 10.4'],
], [0.35, 2.75, 0.9, 2.6], 'Completion status against the project requirements', size=8.5)

section('13.2 Report Format Checklist')
table(['#', 'Required item', 'Where in this report'], [
    ['1', 'Title', 'Cover page'],
    ['2', "Students' SRN and name", 'Cover page, certificate, declaration'],
    ['3', 'Abstract', 'Abstract'],
    ['4', 'Tech stack', 'Chapter 3'],
    ['5', 'SQL database commands', 'Chapters 6, 7, 8 and 9'],
    ['6', 'NoSQL / vector database commands', 'Chapter 10'],
    ['7', 'Next.js project tree structure', 'Section 11.1'],
    ['8', 'Sample screenshots of application code and demo', 'Sections 11.3 and 11.4'],
    ['9', 'Evaluation rubrics completion status', 'Chapter 13'],
], [0.35, 3.0, 3.25], 'Report format checklist')

section('13.3 Individual Contributions')
table(['Area', 'Harsh Mannan (PES2UG24CS183)', 'Chirag Arun Yadwad (PES2UG24CS136)'], [
    ['Relational design', 'Schema, constraints, Week 4 defect audit', 'ER diagram, data dictionary'],
    ['Database logic', 'Credit settlement trigger and deadlock fix, reconciliation view, booking procedure, state machine, cross-role clash check', 'Borrow validation, notification triggers, leaderboard and demand views, matchmaking function'],
    ['Vector database', 'Query embedding in the search API', 'pgvector tables, HNSW indexes, embedding pipeline, semantic / hybrid / recommendation functions'],
    ['Transactions', 'Booking and bonus-grant transactions', 'Loan-approval transaction'],
    ['Application', 'Auth, roles, API layer; dashboard, sessions, credits pages', 'Search, my-skills, resources pages; analytics, users, catalogue, DB Lab'],
    ['Testing and docs', 'API test suite, README, demo script', 'Integrity test suite, important queries, report, screenshots'],
], [1.3, 2.65, 2.65], 'Individual contributions', size=9)

# =====================================================================
# CHAPTER 14: CONCLUSION
# =====================================================================
chapter('Conclusion and Future Enhancements')
section('14.1 Conclusion')
para("SkillSwap Campus shows how the choice of database follows from the nature of the data. The relational "
     "part of the system carries money-like credits, bookings and loans, and PostgreSQL enforces every rule "
     "itself: keys and CHECK constraints for single values, EXCLUDE constraints for overlapping time ranges, "
     "triggers for rules that span rows and tables, a stored procedure for booking, and transactions with a "
     "fixed lock order for the credit economy. The vector part handles free-text descriptions, where meaning "
     "matters more than exact words, and pgvector lets both parts be queried and kept consistent together. The "
     "Next.js application exposes all of this through a role-aware interface, and 24 database tests and 51 API "
     "checks show that invalid data is rejected and that the credit ledger always balances.", indent=True)
section('14.2 Future Enhancements')
bullets([
    "Campus single sign-on and e-mail or push notifications.",
    "A multilingual embedding model so descriptions in Kannada or Hindi can be searched.",
    "pgvector iterative index scans for heavily filtered nearest-neighbour queries on large data.",
    "Recurring sessions, waiting lists and a staff moderation queue for reviews and listings.",
    "Materialised views for analytics as the data grows.",
])

# =====================================================================
# REFERENCES, GITHUB, APPENDIX
# =====================================================================
chapter('References', numbered=False)
refs = [
    "R. Elmasri and S. B. Navathe, Fundamentals of Database Systems, 7th ed., Pearson, 2016.",
    "PostgreSQL Global Development Group, PostgreSQL 16 Documentation, https://www.postgresql.org/docs/16/",
    "pgvector: Open-source vector similarity search for Postgres, https://github.com/pgvector/pgvector",
    "N. Reimers and I. Gurevych, “Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks,” EMNLP, 2019.",
    "W. Wang et al., “MiniLM: Deep Self-Attention Distillation for Task-Agnostic Compression of Pre-Trained Transformers,” NeurIPS, 2020.",
    "Y. A. Malkov and D. A. Yashunin, “Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs,” IEEE TPAMI, 2018.",
    "G. V. Cormack, C. L. A. Clarke and S. Buettcher, “Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods,” SIGIR, 2009.",
    "Vercel, Next.js Documentation (App Router, Route Handlers), https://nextjs.org/docs",
    "Hugging Face, Transformers.js Documentation, https://huggingface.co/docs/transformers.js",
    "node-postgres Documentation, https://node-postgres.com",
]
for i, r_ in enumerate(refs, 1):
    p = para(f'[{i}] {r_}', align=WD_ALIGN_PARAGRAPH.LEFT, after=4)
    p.paragraph_format.left_indent = Inches(0.4)
    p.paragraph_format.first_line_indent = Inches(-0.4)
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(24)
run(p, 'GitHub Link: ', bold=True, size=18)
gh = run(p, GITHUB, size=12)
gh.font.highlight_color = 7  # yellow: replace with the real repository URL

chapter('Appendix A: Definitions, Acronyms and Abbreviations', key='APPENDIX', numbered=False)
table(['Term', 'Meaning'], [
    ['ACID', 'Atomicity, Consistency, Isolation, Durability: the guarantees of a database transaction'],
    ['API', 'Application Programming Interface; here the Next.js Route Handlers under app/api'],
    ['bcrypt', 'Slow, salted password-hashing function'],
    ['CTE', 'Common Table Expression (WITH ... AS)'],
    ['DDL / DML', 'Data Definition Language / Data Manipulation Language'],
    ['Embedding', 'A vector of numbers that represents the meaning of a text'],
    ['ER', 'Entity–Relationship (model or diagram)'],
    ['EXCLUDE constraint', 'PostgreSQL constraint that forbids two rows whose values conflict under given operators, e.g. overlapping time ranges'],
    ['FK / PK', 'Foreign key / primary key'],
    ['GIN / GiST', 'Generalised Inverted Index / Generalised Search Tree (PostgreSQL index types)'],
    ['HNSW', 'Hierarchical Navigable Small World: graph index for approximate nearest-neighbour search'],
    ['JWT', 'JSON Web Token: signed token identifying the logged-in user'],
    ['k-NN', 'k nearest neighbours: the k vectors closest to a query vector'],
    ['ONNX', 'Open Neural Network Exchange: portable model format run by Transformers.js'],
    ['pgvector', 'PostgreSQL extension adding the vector type, distance operators and vector indexes'],
    ['PL/pgSQL', 'PostgreSQL procedural language for functions, procedures and triggers'],
    ['RRF', 'Reciprocal Rank Fusion: combines ranked lists with score = Σ 1 / (k + rank)'],
    ['SQLSTATE', 'Five-character standard error code, e.g. 23P01 exclusion_violation'],
    ['3NF', 'Third Normal Form'],
], [1.6, 5.0], None, size=10)

# =====================================================================
# Page numbers in the footer (no number on the cover page)
# =====================================================================
for i, s in enumerate(doc.sections):
    if i == 0:
        s.different_first_page_header_footer = True
    f = s.footer
    f.is_linked_to_previous = i != 0
    if i == 0:
        p = f.paragraphs[0] if f.paragraphs else f.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r_ in list(p.runs):
            r_._r.getparent().remove(r_._r)
        r1 = p.add_run()
        for tag, attr in (('w:fldChar', 'begin'), ('w:instrText', None), ('w:fldChar', 'end')):
            e = OxmlElement(tag)
            if attr:
                e.set(qn('w:fldCharType'), attr)
            else:
                e.set(qn('xml:space'), 'preserve')
                e.text = 'PAGE'
            r1._r.append(e)
        r1.font.name, r1.font.size = FONT, Pt(10)

# =====================================================================
# TOC, list of tables, list of figures
# =====================================================================


def fill_list(tbl, entries, widths=None):
    rows = tbl.rows
    template_row = copy.deepcopy(rows[1]._tr)
    for r_ in rows[1:]:
        tbl._tbl.remove(r_._tr)
    for e in entries:
        tr = copy.deepcopy(template_row)
        tbl._tbl.append(tr)
    for r_, e in zip(tbl.rows[1:], entries):
        for cell, val in zip(r_.cells, e):
            set_cell(cell, val)
            for p in cell.paragraphs:
                pPr = p._p.pPr
                if pPr is not None:
                    for np_ in pPr.findall(qn('w:numPr')):
                        pPr.remove(np_)
                    ind = pPr.find(qn('w:ind'))
                    if ind is not None:
                        pPr.remove(ind)


toc_tbl, lot_tbl, lof_tbl = doc.tables[5], doc.tables[6], doc.tables[7]
toc_entries = []
for key, num, title, text in TOC:
    toc_entries.append([num, title, str(PAGES.get(text, ''))])
fill_list(toc_tbl, toc_entries)
fill_list(lot_tbl, [[n, t, str(PAGES.get(k, ''))] for k, n, t in TABS])
fill_list(lof_tbl, [[n, t, str(PAGES.get(k, ''))] for k, n, t in FIGS])
for tbl in (toc_tbl, lot_tbl, lof_tbl):
    for r_ in tbl.rows[1:]:
        for ci, cell in enumerate(r_.cells):
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT if ci == 1 else WD_ALIGN_PARAGRAPH.CENTER
                for rr in p.runs:
                    rr.font.size = Pt(10)
                    rr.font.name = FONT

doc.save(OUT)
json.dump({'toc': [t[3] for t in TOC], 'figs': [f[0] for f in FIGS], 'tabs': [t[0] for t in TABS]},
          open(OUT + '.keys.json', 'w'), indent=1)
print('saved', OUT, len(TOC), 'chapters', len(FIGS), 'figures', len(TABS), 'tables')
