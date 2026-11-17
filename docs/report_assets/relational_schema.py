"""Relational schema diagram (Elmasri/Navathe style): each relation is a row of
attribute cells, primary keys underlined, arrows from each foreign key to the
primary key it references."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch

FONT = 'DejaVu Sans'
FS = 8.4
REL = [
    ('USERS', ['user_id', 'full_name', 'email', 'password_hash', 'role', 'department', 'credits_balance',
               'is_active', 'created_at', 'last_login_at', 'bio'], ['user_id']),
    ('CATEGORIES', ['category_id', 'category_name'], ['category_id']),
    ('SKILLS', ['skill_id', 'skill_name', 'category_id'], ['skill_id']),
    ('USER_SKILLS', ['user_skill_id', 'user_id', 'skill_id', 'proficiency_level', 'description', 'is_offering',
                     'search_vector'], ['user_skill_id']),
    ('SKILL_EMBEDDINGS', ['user_skill_id', 'embedding', 'source_text', 'model_name', 'embedded_at'], ['user_skill_id']),
    ('SESSIONS', ['session_id', 'offering_user_id', 'requesting_user_id', 'skill_id', 'scheduled_time',
                  'duration_minutes', 'status', 'credits_charged', 'location', 'created_at', 'session_period'],
     ['session_id']),
    ('REVIEWS', ['review_id', 'session_id', 'reviewer_id', 'reviewee_id', 'rating', 'comment', 'created_at'],
     ['review_id']),
    ('CREDIT_TRANSACTIONS', ['transaction_id', 'user_id', 'session_id', 'amount', 'transaction_type', 'created_at'],
     ['transaction_id']),
    ('NOTIFICATIONS', ['notification_id', 'user_id', 'message', 'related_session_id', 'is_read', 'created_at'],
     ['notification_id']),
    ('RESOURCE_LISTINGS', ['resource_id', 'owner_id', 'title', 'description', 'category_id', 'condition',
                           'availability_status', 'created_at'], ['resource_id']),
    ('RESOURCE_EMBEDDINGS', ['resource_id', 'embedding', 'source_text', 'model_name', 'embedded_at'], ['resource_id']),
    ('RESOURCE_BORROW_REQUESTS', ['request_id', 'resource_id', 'borrower_id', 'request_date', 'start_date', 'end_date',
                                  'status', 'return_confirmed', 'borrow_period'], ['request_id']),
]
FK = [  # (relation, column, referenced relation)
    ('SKILLS', 'category_id', 'CATEGORIES'),
    ('USER_SKILLS', 'user_id', 'USERS'), ('USER_SKILLS', 'skill_id', 'SKILLS'),
    ('SKILL_EMBEDDINGS', 'user_skill_id', 'USER_SKILLS'),
    ('SESSIONS', 'offering_user_id', 'USERS'), ('SESSIONS', 'requesting_user_id', 'USERS'),
    ('SESSIONS', 'skill_id', 'SKILLS'),
    ('REVIEWS', 'session_id', 'SESSIONS'), ('REVIEWS', 'reviewer_id', 'USERS'), ('REVIEWS', 'reviewee_id', 'USERS'),
    ('CREDIT_TRANSACTIONS', 'user_id', 'USERS'), ('CREDIT_TRANSACTIONS', 'session_id', 'SESSIONS'),
    ('NOTIFICATIONS', 'user_id', 'USERS'), ('NOTIFICATIONS', 'related_session_id', 'SESSIONS'),
    ('RESOURCE_LISTINGS', 'owner_id', 'USERS'), ('RESOURCE_LISTINGS', 'category_id', 'CATEGORIES'),
    ('RESOURCE_EMBEDDINGS', 'resource_id', 'RESOURCE_LISTINGS'),
    ('RESOURCE_BORROW_REQUESTS', 'resource_id', 'RESOURCE_LISTINGS'),
    ('RESOURCE_BORROW_REQUESTS', 'borrower_id', 'USERS'),
]

CH = 0.30           # cell height
ROW = 0.93          # row pitch
LANES = len(FK)
LANE_W = 0.105
X0 = 0.35 + LANES * LANE_W + 0.25   # where relations start
cw = lambda t: 0.068 * len(t) + 0.22

width = X0 + max(sum(cw(c) for c in cols) for _, cols, _ in REL) + 0.3
height = len(REL) * ROW + 0.9
fig = plt.figure(figsize=(width, height))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, width); ax.set_ylim(0, height); ax.axis('off')

cells = {}   # (rel, col) -> (x0, x1, ybottom)
rowy = {}
for i, (name, cols, pk) in enumerate(REL):
    ytop = height - 0.75 - i * ROW
    yb = ytop - 0.18 - CH            # cell bottom
    rowy[name] = yb
    ax.text(X0, ytop - 0.06, name, fontsize=9, fontweight='bold', family=FONT, va='center')
    x = X0
    for c in cols:
        w = cw(c)
        ax.add_patch(Rectangle((x, yb), w, CH, fc='white', ec='black', lw=0.9, zorder=2))
        t = ax.text(x + w / 2, yb + CH / 2, c, ha='center', va='center', fontsize=FS, family=FONT, zorder=3)
        if c in pk:
            tw = 0.064 * len(c)
            ax.plot([x + w / 2 - tw / 2, x + w / 2 + tw / 2], [yb + 0.065, yb + 0.065], color='black', lw=0.8, zorder=3)
        cells[(name, c)] = (x, x + w, yb)
        x += w

# arrows: FK cell bottom -> down into the gap -> left to its lane -> up/down to the target row -> right into PK cell
order = sorted(range(len(FK)), key=lambda k: -abs(rowy[FK[k][0]] - rowy[FK[k][2]]))
gap_used = {}
for lane_idx, k in enumerate(order):
    rel, col, tgt = FK[k]
    fx0, fx1, fyb = cells[(rel, col)]
    pk = [c for (n, cols, pkl) in REL if n == tgt for c in pkl][0]
    tx0, tx1, tyb = cells[(tgt, pk)]
    lane_x = 0.35 + lane_idx * LANE_W
    # each arrow leaving a row uses its own height inside the gap below that row
    n = gap_used.get(rel, 0); gap_used[rel] = n + 1
    gy = fyb - 0.07 - n * 0.045
    sx = (fx0 + fx1) / 2
    # entry point on the target PK cell's left edge, staggered vertically
    m = gap_used.get(('in', tgt), 0); gap_used[('in', tgt)] = m + 1
    ty = tyb + CH / 2 + (m - 3) * 0.028
    ty = min(max(ty, tyb + 0.05), tyb + CH - 0.05)
    pts = [(sx, fyb), (sx, gy), (lane_x, gy), (lane_x, ty)]
    xs, ys = zip(*pts)
    ax.plot(xs, ys, color='black', lw=0.75, zorder=1)
    ax.add_patch(FancyArrowPatch((lane_x, ty), (tx0, ty), arrowstyle='-|>', mutation_scale=8, lw=0.75,
                                 color='black', zorder=4, shrinkA=0, shrinkB=0))
    ax.plot([sx], [fyb], marker='o', ms=2.2, color='black', zorder=4)

ax.text(0.35, height - 0.32, 'SkillSwap Campus — Relational Schema (ER-to-relational mapping)', fontsize=11.5,
        fontweight='bold', family=FONT, va='center')
ax.text(width - 0.3, height - 0.32, 'underlined = primary key     arrow = foreign key → referenced primary key',
        fontsize=8.5, family=FONT, va='center', ha='right')
fig.savefig('relational_schema.png', dpi=220, facecolor='white')
fig.savefig('relational_schema.pdf', facecolor='white')
print(round(width, 1), round(height, 1))
