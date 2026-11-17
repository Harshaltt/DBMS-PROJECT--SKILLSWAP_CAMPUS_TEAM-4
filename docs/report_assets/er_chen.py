"""Chen-notation ER diagram for SkillSwap Campus (textbook style, black & white).
Rectangles = entities, double rectangle = weak entity, diamonds = relationships,
double diamond = identifying relationship, ellipses = attributes, underlined =
key attribute, dashed ellipse = derived attribute, double line = total
participation, 1 / N = cardinality ratio.
Run:  python3 er_chen.py  -> er_diagram_chen.png / .pdf
"""
import math
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Polygon, Rectangle

W, H = 16.6, 12.0
FONT = 'DejaVu Sans'
FS_ATTR, FS_ENT, FS_REL = 8.6, 9.6, 8.2

shapes = {}   # name -> dict(kind, x, y, w, h, label, ...)
edges = []    # (a, b, total, card)


def ent(key, label, x, y, weak=False):
    w = 0.095 * len(label) + 0.42
    shapes[key] = dict(kind='ent', x=x, y=y, w=w, h=0.40, label=label, weak=weak)


def rel(key, label, x, y, ident=False):
    w = 0.082 * len(label) + 0.62
    shapes[key] = dict(kind='rel', x=x, y=y, w=w, h=0.52, label=label, ident=ident)


def att(owner, label, x, y, key=False, derived=False):
    k = f'{owner}.{label}'
    w = 0.074 * len(label) + 0.34
    shapes[k] = dict(kind='att', x=x, y=y, w=w, h=0.33, label=label, key=key, derived=derived)
    edges.append((owner, k, False, None))


def link(r, e, card, total=False):
    edges.append((r, e, total, card))


# ---------------- entities & relationships (hand placed) ----------------
ent('USER', 'USER', 6.6, 5.6)
ent('SESSION', 'SESSION', 11.8, 5.6)
ent('LISTING', 'SKILL_LISTING', 6.6, 8.6)
ent('SKILL', 'SKILL', 11.8, 8.6)
ent('CATEGORY', 'CATEGORY', 3.0, 10.75)
ent('RESOURCE', 'RESOURCE', 3.0, 8.0)
ent('SEMB', 'SKILL_EMBEDDING', 9.75, 7.25, weak=True)
ent('REMB', 'RESOURCE_EMBEDDING', 1.55, 5.55, weak=True)
ent('BORROW', 'BORROW_REQUEST', 3.55, 2.2)
ent('REVIEW', 'REVIEW', 9.45, 3.85)
ent('NOTIF', 'NOTIFICATION', 9.2, 2.35)
ent('CT', 'CREDIT_TRANSACTION', 9.2, 0.95)

rel('TEACHES', 'TEACHES', 9.2, 6.08)
rel('ATTENDS', 'ATTENDS', 9.2, 5.12)
rel('LISTS', 'LISTS', 6.6, 7.1)
rel('OF_SKILL', 'OF_SKILL', 9.2, 8.6)
rel('TOPIC_OF', 'TOPIC_OF', 11.8, 7.1)
rel('BELONGS', 'BELONGS_TO', 9.0, 10.6)
rel('CLASSIFIED', 'CLASSIFIED_AS', 3.0, 9.38)
rel('EMBEDS_S', 'EMBEDS', 8.0, 7.55, ident=True)
rel('EMBEDS_R', 'EMBEDS', 2.25, 6.75, ident=True)
rel('OWNS', 'OWNS', 4.8, 6.8)
rel('FOR_ITEM', 'FOR_ITEM', 3.35, 4.6)
rel('REQUESTS', 'REQUESTS', 5.6, 3.05)
rel('WRITES', 'WRITES', 8.1, 4.62)
rel('RECEIVES', 'RECEIVES', 8.0, 3.72)
rel('HAS_REVIEW', 'HAS_REVIEW', 10.65, 4.55)
rel('NOTIFIES', 'NOTIFIES', 7.25, 2.75)
rel('CONCERNS', 'CONCERNS', 11.5, 3.0)
rel('HOLDS', 'HOLDS', 6.3, 1.6)
rel('SETTLES', 'SETTLES', 12.45, 1.7)

# relationship participation: link(rel, entity, cardinality, total)
link('TEACHES', 'USER', '1'); link('TEACHES', 'SESSION', 'N', True)
link('ATTENDS', 'USER', '1'); link('ATTENDS', 'SESSION', 'N', True)
link('LISTS', 'USER', '1'); link('LISTS', 'LISTING', 'N', True)
link('OF_SKILL', 'SKILL', '1'); link('OF_SKILL', 'LISTING', 'N', True)
link('TOPIC_OF', 'SKILL', '1'); link('TOPIC_OF', 'SESSION', 'N', True)
link('BELONGS', 'CATEGORY', '1'); link('BELONGS', 'SKILL', 'N', True)
link('CLASSIFIED', 'CATEGORY', '1'); link('CLASSIFIED', 'RESOURCE', 'N')
link('EMBEDS_S', 'LISTING', '1'); link('EMBEDS_S', 'SEMB', '1', True)
link('EMBEDS_R', 'RESOURCE', '1'); link('EMBEDS_R', 'REMB', '1', True)
link('OWNS', 'USER', '1'); link('OWNS', 'RESOURCE', 'N', True)
link('FOR_ITEM', 'RESOURCE', '1'); link('FOR_ITEM', 'BORROW', 'N', True)
link('REQUESTS', 'USER', '1'); link('REQUESTS', 'BORROW', 'N', True)
link('WRITES', 'USER', '1'); link('WRITES', 'REVIEW', 'N', True)
link('RECEIVES', 'USER', '1'); link('RECEIVES', 'REVIEW', 'N', True)
link('HAS_REVIEW', 'SESSION', '1'); link('HAS_REVIEW', 'REVIEW', 'N', True)
link('NOTIFIES', 'USER', '1'); link('NOTIFIES', 'NOTIF', 'N', True)
link('CONCERNS', 'SESSION', '1'); link('CONCERNS', 'NOTIF', 'N')
link('HOLDS', 'USER', '1'); link('HOLDS', 'CT', 'N', True)
link('SETTLES', 'SESSION', '1'); link('SETTLES', 'CT', 'N')

# ---------------- attributes ----------------
# CATEGORY
att('CATEGORY', 'category_id', 1.25, 11.2, key=True)
att('CATEGORY', 'category_name', 1.25, 10.3)
# SKILL
att('SKILL', 'skill_id', 13.25, 9.05, key=True)
att('SKILL', 'skill_name', 13.35, 8.35)
# SKILL_LISTING
att('LISTING', 'user_skill_id', 5.35, 9.45, key=True)
att('LISTING', 'proficiency_level', 6.6, 9.9)
att('LISTING', 'description', 7.9, 9.45)
att('LISTING', 'is_offering', 5.15, 8.85)
att('LISTING', 'search_vector', 8.3, 8.22, derived=True)
# SKILL_EMBEDDING (weak)
att('SEMB', 'embedding', 10.95, 7.8)
att('SEMB', 'source_text', 10.75, 6.62)
att('SEMB', 'model_name', 9.1, 6.62)
att('SEMB', 'embedded_at', 9.75, 7.95)
# REVIEW
att('REVIEW', 'review_id', 8.4, 3.13, key=True)
att('REVIEW', 'rating', 9.45, 3.1)
att('REVIEW', 'comment', 10.35, 3.13)
att('REVIEW', 'created_at', 10.7, 3.62)
# NOTIFICATION
att('NOTIF', 'notification_id', 7.85, 1.72, key=True)
att('NOTIF', 'message', 9.1, 1.72)
att('NOTIF', 'is_read', 10.05, 1.72)
att('NOTIF', 'created_at', 10.8, 2.05)
# CREDIT_TRANSACTION
att('CT', 'transaction_id', 7.4, 0.35, key=True)
att('CT', 'amount', 8.65, 0.32)
att('CT', 'transaction_type', 10.0, 0.32)
att('CT', 'created_at', 11.0, 0.85)
# RESOURCE
att('RESOURCE', 'resource_id', 1.2, 9.0, key=True)
att('RESOURCE', 'title', 0.75, 8.47)
att('RESOURCE', 'description', 0.85, 7.95)
att('RESOURCE', 'created_at', 0.95, 7.42)
att('RESOURCE', 'condition', 4.3, 8.45)
att('RESOURCE', 'availability_status', 4.75, 7.62)
# RESOURCE_EMBEDDING (weak)
att('REMB', 'embedding', 0.7, 4.9)
att('REMB', 'source_text', 1.2, 4.33)
att('REMB', 'model_name', 0.72, 6.3)
att('REMB', 'embedded_at', 2.45, 3.98)
# BORROW_REQUEST (7)
att('BORROW', 'request_id', 1.15, 2.95, key=True)
att('BORROW', 'request_date', 0.95, 2.35)
att('BORROW', 'start_date', 1.1, 1.75)
att('BORROW', 'end_date', 2.05, 1.25)
att('BORROW', 'status', 3.5, 1.15)
att('BORROW', 'return_confirmed', 4.65, 1.3)
att('BORROW', 'borrow_period', 2.3, 0.6, derived=True)
# ---------------- geometry helpers ----------------
def bbox(s, pad=0.0):
    return (s['x'] - s['w'] / 2 - pad, s['y'] - s['h'] / 2 - pad,
            s['x'] + s['w'] / 2 + pad, s['y'] + s['h'] / 2 + pad)


def inside(s, px, py, shrink=0.02):
    dx, dy = px - s['x'], py - s['y']
    a, b = s['w'] / 2 - shrink, s['h'] / 2 - shrink
    if a <= 0 or b <= 0:
        return False
    if s['kind'] == 'att':
        return (dx / a) ** 2 + (dy / b) ** 2 < 1
    if s['kind'] == 'rel':
        return abs(dx) / a + abs(dy) / b < 1
    return abs(dx) < a and abs(dy) < b


def check():
    problems = []
    keys = list(shapes)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            A, B = shapes[a], shapes[b]
            # sample points of A's outline against B's interior (and vice versa)
            for S, T, n1, n2 in ((A, B, a, b), (B, A, b, a)):
                hit = False
                for k in range(48):
                    t = 2 * math.pi * k / 48
                    px = S['x'] + S['w'] / 2 * math.cos(t)
                    py = S['y'] + S['h'] / 2 * math.sin(t)
                    if inside(T, px, py, shrink=-0.03):
                        hit = True
                        break
                if hit:
                    problems.append(f'OVERLAP {n1} <-> {n2}')
                    break
    for (a, b, *_rest) in edges:
        A, B = shapes[a], shapes[b]
        for k, S in shapes.items():
            if k in (a, b):
                continue
            for t in [i / 60 for i in range(1, 60)]:
                px = A['x'] + (B['x'] - A['x']) * t
                py = A['y'] + (B['y'] - A['y']) * t
                if inside(S, px, py, shrink=-0.03) and not inside(A, px, py) and not inside(B, px, py):
                    problems.append(f'LINE {a}-{b} crosses {k}')
                    break
    for k, s in shapes.items():
        x0, y0, x1, y1 = bbox(s)
        if x0 < 0.05 or y0 < 0.05 or x1 > W - 0.05 or y1 > H - 0.05:
            problems.append(f'OUT OF FRAME {k}')
    return problems



# ---------------- automatic attribute placement ----------------
def _ell_hits_shape(cand, S, margin=0.05):
    for k in range(40):
        t = 2 * math.pi * k / 40
        px = cand['x'] + (cand['w'] / 2 + margin) * math.cos(t)
        py = cand['y'] + (cand['h'] / 2 + margin) * math.sin(t)
        if inside(S, px, py, shrink=-0.01):
            return True
    for k in range(40):
        t = 2 * math.pi * k / 40
        px = S['x'] + S['w'] / 2 * math.cos(t)
        py = S['y'] + S['h'] / 2 * math.sin(t)
        if inside(cand, px, py, shrink=-margin):
            return True
    return False


def _seg_hits(ax_, ay_, bx_, by_, S, skip_ends=(None, None)):
    for i in range(1, 80):
        t = i / 80
        px, py = ax_ + (bx_ - ax_) * t, ay_ + (by_ - ay_) * t
        if inside(S, px, py, shrink=-0.04):
            if skip_ends[0] is not None and inside(skip_ends[0], px, py):
                continue
            if skip_ends[1] is not None and inside(skip_ends[1], px, py):
                continue
            return True
    return False


def auto(owner, specs, ranges, rmin=1.2, rmax=3.0):
    """specs: list of (label, kwargs). Place each attribute around `owner`."""
    O = shapes[owner]
    for label, kw in specs:
        best = None
        r = rmin
        while r <= rmax and best is None:
            for lo, hi in ranges:
                a = lo
                while a <= hi:
                    x = O['x'] + r * math.cos(math.radians(a))
                    y = O['y'] + r * math.sin(math.radians(a))
                    w = 0.074 * len(label) + 0.34
                    cand = dict(kind='att', x=x, y=y, w=w, h=0.33)
                    ok = 0.1 < x - w / 2 and x + w / 2 < W - 0.1 and 0.1 < y - 0.17 and y + 0.17 < H - 0.5
                    if ok:
                        for k, S in shapes.items():
                            if _ell_hits_shape(cand, S):
                                ok = False
                                break
                    if ok:
                        for k, S in shapes.items():
                            if k == owner:
                                continue
                            if _seg_hits(O['x'], O['y'], x, y, S, (O, cand)):
                                ok = False
                                break
                    if ok:
                        for (ea, eb, *_r) in edges:
                            A, B = shapes[ea], shapes[eb]
                            if _seg_hits(A['x'], A['y'], B['x'], B['y'], cand, (A, B)):
                                ok = False
                                break
                    if ok:
                        best = (x, y)
                        break
                    a += 2
                if best:
                    break
            r += 0.1
        if best is None and ranges != [(0, 358)]:
            # second chance: anywhere around the entity, a bit further out
            auto(owner, [(label, kw)], [(0, 358)], rmin, rmax + 1.2)
            continue
        if best is None:
            print('could not place', owner, label)
            best = (O['x'], O['y'] - 2)
        att(owner, label, best[0], best[1], **kw)


# ---------------- drawing ----------------
def draw(out):
    fig = plt.figure(figsize=(W, H))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.set_aspect('equal')
    ax.axis('off')
    lw = 1.0
    for a, b, total, card in edges:
        A, B = shapes[a], shapes[b]
        if total:
            dx, dy = B['x'] - A['x'], B['y'] - A['y']
            L = math.hypot(dx, dy)
            ox, oy = -dy / L * 0.028, dx / L * 0.028
            for sgn in (1, -1):
                ax.plot([A['x'] + sgn * ox, B['x'] + sgn * ox], [A['y'] + sgn * oy, B['y'] + sgn * oy],
                        color='black', lw=lw, zorder=1, solid_capstyle='butt')
        else:
            ax.plot([A['x'], B['x']], [A['y'], B['y']], color='black', lw=lw, zorder=1)
        if card:
            # label just outside the diamond, on the entity side
            dx, dy = B['x'] - A['x'], B['y'] - A['y']
            L = math.hypot(dx, dy)
            ux, uy = dx / L, dy / L
            # distance from diamond centre to its border along the line
            a_, b_ = A['w'] / 2, A['h'] / 2
            dist = 1 / (abs(ux) / a_ + abs(uy) / b_)
            px, py = A['x'] + ux * (dist + 0.16), A['y'] + uy * (dist + 0.16)
            nx, ny = -uy, ux
            px, py = px + nx * 0.13, py + ny * 0.13
            ax.text(px, py, card, ha='center', va='center', fontsize=9.5, fontweight='bold',
                    family=FONT, zorder=4,
                    bbox=dict(boxstyle='square,pad=0.05', fc='white', ec='none'))
    for k, s in shapes.items():
        x, y, w, h = s['x'], s['y'], s['w'], s['h']
        if s['kind'] == 'ent':
            ax.add_patch(Rectangle((x - w / 2, y - h / 2), w, h, fc='white', ec='black', lw=1.4, zorder=2))
            if s['weak']:
                ax.add_patch(Rectangle((x - w / 2 + 0.05, y - h / 2 + 0.05), w - 0.1, h - 0.1,
                                       fc='none', ec='black', lw=1.0, zorder=2))
            ax.text(x, y, s['label'], ha='center', va='center', fontsize=FS_ENT, fontweight='bold',
                    family=FONT, zorder=3)
        elif s['kind'] == 'rel':
            pts = [(x, y + h / 2), (x + w / 2, y), (x, y - h / 2), (x - w / 2, y)]
            ax.add_patch(Polygon(pts, closed=True, fc='white', ec='black', lw=1.2, zorder=2))
            if s['ident']:
                k2 = 0.075
                pts2 = [(x, y + h / 2 - k2), (x + w / 2 - k2 * 1.6, y), (x, y - h / 2 + k2),
                        (x - w / 2 + k2 * 1.6, y)]
                ax.add_patch(Polygon(pts2, closed=True, fc='none', ec='black', lw=1.0, zorder=2))
            ax.text(x, y, s['label'], ha='center', va='center', fontsize=FS_REL, family=FONT, zorder=3)
        else:
            ax.add_patch(Ellipse((x, y), w, h, fc='white', ec='black', lw=0.9, zorder=2,
                                 ls=(0, (3, 2)) if s['derived'] else '-'))
            t = ax.text(x, y, s['label'], ha='center', va='center', fontsize=FS_ATTR, family=FONT, zorder=3)
            if s['key']:
                fig.canvas.draw() if not hasattr(draw, '_r') else None
                draw._r = True
                r = fig.canvas.get_renderer()
                bb = t.get_window_extent(renderer=r).transformed(ax.transData.inverted())
                ax.plot([bb.x0, bb.x1], [bb.y0 + 0.012, bb.y0 + 0.012], color='black', lw=0.8, zorder=3)
    # legend
    lx, ly = 11.85, 11.62
    ax.text(lx, ly, 'Notation', fontsize=9.5, fontweight='bold', family=FONT, va='center')
    items = [
        ('rect', 'Entity'), ('wrect', 'Weak entity'), ('dia', 'Relationship'),
        ('ddia', 'Identifying relationship'), ('ell', 'Attribute'), ('key', 'Key attribute'),
        ('der', 'Derived attribute'), ('dbl', 'Total participation'), ('one', 'Cardinality (1 : N)'),
    ]
    for i, (kind, text) in enumerate(items):
        col, row = i // 5, i % 5
        x0 = lx + col * 2.25
        y0 = ly - 0.36 - row * 0.32
        cx = x0 + 0.3
        if kind in ('rect', 'wrect'):
            ax.add_patch(Rectangle((cx - 0.28, y0 - 0.1), 0.56, 0.2, fc='white', ec='black', lw=1.1))
            if kind == 'wrect':
                ax.add_patch(Rectangle((cx - 0.24, y0 - 0.065), 0.48, 0.13, fc='none', ec='black', lw=0.8))
        elif kind in ('dia', 'ddia'):
            ax.add_patch(Polygon([(cx, y0 + 0.13), (cx + 0.28, y0), (cx, y0 - 0.13), (cx - 0.28, y0)],
                                 fc='white', ec='black', lw=1.0))
            if kind == 'ddia':
                ax.add_patch(Polygon([(cx, y0 + 0.085), (cx + 0.2, y0), (cx, y0 - 0.085), (cx - 0.2, y0)],
                                     fc='none', ec='black', lw=0.8))
        elif kind in ('ell', 'key', 'der'):
            ax.add_patch(Ellipse((cx, y0), 0.56, 0.22, fc='white', ec='black', lw=0.9,
                                 ls=(0, (3, 2)) if kind == 'der' else '-'))
            if kind == 'key':
                ax.text(cx, y0, 'id', ha='center', va='center', fontsize=7, family=FONT)
                ax.plot([cx - 0.06, cx + 0.06], [y0 - 0.06, y0 - 0.06], color='black', lw=0.7)
        elif kind == 'dbl':
            for d in (0.028, -0.028):
                ax.plot([cx - 0.28, cx + 0.28], [y0 + d, y0 + d], color='black', lw=1.0)
        elif kind == 'one':
            ax.plot([cx - 0.28, cx + 0.28], [y0, y0], color='black', lw=1.0)
            ax.text(cx, y0 + 0.07, '1', ha='center', va='bottom', fontsize=8, fontweight='bold', family=FONT)
        ax.text(x0 + 0.7, y0, text, va='center', fontsize=8.2, family=FONT)
    ax.text(0.15, 11.78, 'SkillSwap Campus — ER Diagram (Chen notation)', fontsize=12,
            fontweight='bold', family=FONT, va='center')
    fig.savefig(out + '.png', dpi=220, facecolor='white')
    fig.savefig(out + '.pdf', facecolor='white')
    plt.close(fig)


# ---- open up space left of USER: slide the centre/right part of the diagram ----
_LEFT = {'CATEGORY', 'RESOURCE', 'REMB', 'BORROW', 'CLASSIFIED', 'EMBEDS_R', 'FOR_ITEM'}
_HALF = {'OWNS', 'REQUESTS'}
for _k, _s in shapes.items():
    _owner = _k.split('.')[0]
    if _owner in _LEFT:
        continue
    _s['x'] += 0.5 if _owner in _HALF else 1.0

# ---- attributes placed automatically (after everything else is fixed) ----
auto('USER', [('user_id', dict(key=True)), ('full_name', {}), ('email', {}), ('password_hash', {}),
              ('department', {}), ('role', {}), ('credits_balance', {}), ('is_active', {}),
              ('created_at', {}), ('last_login_at', {}), ('bio', {})],
     [(95, 145), (150, 250), (15, 85), (286, 300)], rmin=1.7, rmax=3.8)
auto('SESSION', [('session_id', dict(key=True)), ('scheduled_time', {}), ('duration_minutes', {}),
                 ('status', {}), ('credits_charged', {}), ('location', {}), ('created_at', {}),
                 ('session_period', dict(derived=True))],
     [(-72, 76)], rmin=1.9, rmax=3.6)


if __name__ == '__main__':
    probs = check()
    print('\n'.join(probs) if probs else 'no problems')
    out = sys.argv[1] if len(sys.argv) > 1 else 'er_diagram_chen'
    draw(out)
