"""Editor-style screenshots of key source files + the project tree (for the report).

Run from the project root:  python3 docs/report_assets/make_code_shots.py
"""
import os
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pygments import highlight
from pygments.formatters import ImageFormatter
from pygments.lexers import get_lexer_by_name

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'report_assets' / 'code'
OUT.mkdir(parents=True, exist_ok=True)

BG = (30, 30, 36)
BAR = (44, 44, 52)
UI_FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)
CODE_FONT = 'DejaVu Sans Mono'


def lines_of(rel, start, end):
    text = (ROOT / rel).read_text().splitlines()
    return '\n'.join(text[start - 1:end]), start


def code_shot(name, rel, start, end, lang='javascript'):
    code, first = lines_of(rel, start, end)
    fmt = ImageFormatter(style='one-dark', font_name=CODE_FONT, font_size=22, line_numbers=True,
                         line_number_start=first, line_number_bg='#1e1e24', line_number_fg='#6b7280',
                         line_pad=6, image_pad=18)
    body = Image.open(BytesIO(highlight(code, get_lexer_by_name(lang), fmt))).convert('RGB')
    w = max(body.width, 900)
    img = Image.new('RGB', (w, body.height + 52), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 52], fill=BAR)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([18 + i * 30, 17, 36 + i * 30, 35], fill=c)
    d.text((120, 13), f'{rel}  (lines {start}-{end})', font=UI_FONT, fill=(210, 210, 215))
    img.paste(body, (0, 52))
    img.save(OUT / f'{name}.png')
    print(name, img.size)


code_shot('code_01_transaction', 'lib/db.mjs', 48, 72)
code_shot('code_02_booking_api', 'app/api/sessions/route.js', 29, 48)
code_shot('code_03_search_api', 'app/api/skills/search/route.js', 30, 46)
code_shot('code_03b_search_api', 'app/api/skills/search/route.js', 54, 78)
code_shot('code_04_embeddings', 'lib/embeddings.mjs', 1, 44)
code_shot('code_05_roles', 'lib/api.js', 9, 33)
code_shot('code_06_middleware', 'middleware.js', 1, 31)

# ------------------------------------------------------------------ project tree
SKIP = {'node_modules', '.next', '.git', 'out'}
COLLAPSE = {  # directory -> short note instead of listing its files
    'models': 'MiniLM ONNX model',
    'docs/screenshots': '24 app screenshots',
    'docs/report_assets': 'report images, scripts',
    'docs/week4': 'Week 4 files',
    'db/week4': 'Week 4 tests',
    'public': 'static files',
}
HIDE_FILES = {'.DS_Store', 'package-lock.json', '.env.local'}


def tree(path, prefix='', rel=''):
    entries = sorted([e for e in os.scandir(path) if e.name not in SKIP and e.name not in HIDE_FILES],
                     key=lambda e: (not e.is_dir(), e.name.lower()))
    out = []
    for i, e in enumerate(entries):
        last = i == len(entries) - 1
        branch = '└── ' if last else '├── '
        r = f'{rel}/{e.name}'.lstrip('/')
        if e.is_dir():
            kids = [k for k in os.scandir(e.path) if k.name not in HIDE_FILES]
            if r not in COLLAPSE and len(kids) == 1 and kids[0].is_file():
                out.append(f'{prefix}{branch}{e.name}/{kids[0].name}')
            elif r in COLLAPSE:
                out.append(f'{prefix}{branch}{e.name}/   # {COLLAPSE[r]}')
            else:
                out.append(f'{prefix}{branch}{e.name}/')
                out += tree(e.path, prefix + ('    ' if last else '│   '), r)
        else:
            out.append(f'{prefix}{branch}{e.name}')
    return out


lines = ['skillswap-campus/'] + tree(ROOT)
(OUT / 'project_tree.txt').write_text('\n'.join(lines) + '\n')
print('tree lines', len(lines))
