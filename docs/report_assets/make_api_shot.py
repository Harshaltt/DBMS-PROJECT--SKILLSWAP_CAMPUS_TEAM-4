"""Screenshot of the end-to-end API test output (run `node tests/api-smoke.mjs > api.txt` first).
Usage: python3 docs/report_assets/make_api_shot.py api.txt"""
import os, re, sys
from PIL import Image
src = open(os.path.join(os.path.dirname(__file__), 'make_shots.py')).read()
exec(src.split('# ------------------------------------------------------------------ ids used')[0])
text = re.sub(r'\x1b\[[0-9;]*m', '', open(sys.argv[1]).read()).rstrip('\n').split('\n')
text = [('PASS' + l[l.index('✓') + 1:]) if '✓' in l else l for l in text]
half = len(text) // 2
while text[half - 1].strip():  # split at a blank line between groups
    half += 1
a = render('test_02_api_a', 'Terminal — npm run test:api  (1/2)', [(['$ npm run test:api'], text[:half])])
b = render('test_02_api_b', 'Terminal — npm run test:api  (2/2)', [([], text[half:])])
A, B = (Image.open(os.path.join(OUT, n + '.png')) for n in (a, b))
img = Image.new('RGB', (A.width + B.width + 20, max(A.height, B.height)), 'white')
img.paste(A, (0, 0)); img.paste(B, (A.width + 20, 0))
img.save(os.path.join(OUT, 'test_02_api.png'))
os.remove(os.path.join(OUT, a + '.png')); os.remove(os.path.join(OUT, b + '.png'))
print(img.size)
