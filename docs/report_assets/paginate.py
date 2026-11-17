"""Find the page of every chapter heading, figure and table caption in the rendered PDF."""
import json, subprocess, sys
pdf, keys_file, out = sys.argv[1:4]
keys = json.load(open(keys_file))
n = int([l for l in subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout.split('\n') if l.startswith('Pages')][0].split()[1])
pages = []
for i in range(1, n + 1):
    t = subprocess.run(['pdftotext', '-f', str(i), '-l', str(i), pdf, '-'], capture_output=True, text=True).stdout
    pages.append([' '.join(l.split()) for l in t.split('\n')])
# skip front matter: start after the page that holds the last figure entry of the LIST OF FIGURES
start = next(i for i, p in enumerate(pages) if any(l == keys['toc'][0] for l in p))
res, missing = {}, []
for k in keys['toc']:
    pre = k[:22]
    hit = next((i + 1 for i in range(start, n) if any(l.startswith(pre) for l in pages[i])), None)
    (res.__setitem__(k, hit) if hit else missing.append(k))
for k in keys['figs'] + keys['tabs']:
    hit = next((i + 1 for i in range(start, n) if any(k in l for l in pages[i])), None)
    (res.__setitem__(k, hit) if hit else missing.append(k))
json.dump(res, open(out, 'w'), indent=1)
print('pages found', len(res), 'missing', missing)
