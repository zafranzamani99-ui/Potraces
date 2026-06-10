# -*- coding: utf-8 -*-
"""Feature spec: Account & Multi-Device Sync — built from the 9-agent audit synthesis.
Run: python gen_account_sync.py   (reads c:\\tmp\\sync_synthesis.json)"""
import os, json, html
import _docgen as dg

DATA = json.load(open(r'c:\tmp\sync_synthesis.json', encoding='utf-8'))
ISSUES = DATA.get('masterIssues', [])
OQ = DATA.get('openQuestions', [])
PHASES = DATA.get('phasedPlan', [])


def clean(s):
    if not s:
        return ''
    s = html.unescape(str(s))
    repl = {
        '—': ' - ', '–': '-', '→': ' -> ', '←': ' <- ',
        '‘': "'", '’': "'", '“': '"', '”': '"',
        '�': '-', '…': '...', ' ': ' ', '•': '-', '≥': '>=',
        '≤': '<=', '×': 'x',
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    # strip any remaining non-latin-ish control/odd chars
    return ''.join(ch for ch in s if ch == '\n' or 32 <= ord(ch) < 0x2500)


SEV = {
    'critical': (dg.TERRA_TINT, dg.TERRA),
    'high':     (dg.GOLD_TINT, dg.GOLD),
    'medium':   (dg.SKY_TINT, dg.SKY),
    'low':      (dg.ZEBRA, dg.MUTED),
}
ORDER = ['critical', 'high', 'medium', 'low']
by_sev = {s: [x for x in ISSUES if x.get('severity') == s] for s in ORDER}

d = dg.FeatureDoc(
    kicker="POTRACES · FEATURE SPEC · MULTI-AGENT AUDIT",
    title="Account & Multi-Device Sync",
    subtitle="What it takes to let one account work on another device - safely",
    meta="June 2026 - synthesised from a 9-agent research + cross-critique workflow (5 researchers w/ internet + code, 3 critics, 1 synthesiser)",
)

# EXEC SUMMARY
d.h("Executive summary - read this first")
d.callout("This audit found issues that are NOT just future-feature gaps - several CRITICAL bugs "
          "are LIVE in the current cloud-sync code (personalSync.ts) and can DELETE or DUPLICATE "
          "real money records today, for anyone who turns on Cloud Sync on a second device. These "
          "must be fixed (Phase 0) BEFORE personal multi-device sign-in is promoted to users.",
          kind="manual")
crit = len(by_sev['critical']); high = len(by_sev['high'])
med = len(by_sev['medium']); low = len(by_sev['low'])
d.p(f"The workflow produced **{len(ISSUES)} issues**: **{crit} critical**, **{high} high**, "
    f"{med} medium, {low} low - plus **{len(OQ)} open questions** for you to decide and a "
    f"**{len(PHASES)}-phase build plan**. Researchers combined internet best-practice research "
    "with reading the actual Potraces code; critics then cross-examined the findings "
    "(completeness / adversarial / code-grounding). One proposed 'fix' (content-hash dedup) was "
    "caught by the red-team as itself data-destroying and removed.")
d.p("The three things to internalise:", before=2)
d.bullet("**The current sync is not multi-device-safe yet** - set-difference deletes, whole-row "
         "overwrites, and first-sign-in duplication can each lose or double money.")
d.bullet("**Account boundaries aren't enforced** - on a shared phone, one account's data can leak "
         "into another's. This must land before any inline sign-in.")
d.bullet("**Most of the plumbing exists** (Apple/Google auth, per-user sync, tombstones) - the work "
         "is correctness + coverage + a calm sign-in UX, not a new backend.")

d.legend([("CRITICAL", dg.TERRA_TINT, dg.TERRA),
          ("HIGH", dg.GOLD_TINT, dg.GOLD),
          ("MEDIUM", dg.SKY_TINT, dg.SKY),
          ("LOW", dg.ZEBRA, dg.MUTED)])

# OVERVIEW TABLE
d.h("1.  All issues at a glance")
rows = []
n = 0
for s in ORDER:
    for x in by_sev[s]:
        n += 1
        fill, tc = SEV[s]
        rows.append([(str(n), fill, tc), (s.upper(), fill, tc), clean(x.get('area', '')),
                     clean(x.get('title', ''))])
d.table(["#", "Severity", "Area", "Issue"], rows, widths=[0.4, 0.9, 1.2, 5.1], size=8.8)

# DETAIL — critical + high full, medium/low brief
def render_issue(n, x, brief=False):
    s = x.get('severity', 'low')
    fill, tc = SEV.get(s, (dg.ZEBRA, dg.MUTED))
    d.h2(f"{n}. {clean(x.get('title',''))}", color=tc, size=11.5)
    tagline = f"{s.upper()}  ·  {clean(x.get('area',''))}"
    if x.get('potracesSpecific'):
        tagline += "  ·  confirmed in Potraces code"
    d.p(tagline, size=8.5, color=tc, after=3)
    if not brief:
        d.p(clean(x.get('description', '')), size=9.8, after=4)
    if x.get('whyItMatters') and not brief:
        d.p(f"**Why it matters:** {clean(x.get('whyItMatters',''))}", size=9.8, after=3)
    d.p(f"**Fix:** {clean(x.get('recommendation',''))}", size=9.8, after=3)
    srcs = [clean(s2) for s2 in (x.get('sources') or [])][:4]
    if srcs:
        d.p("Sources: " + "  |  ".join(srcs), size=8, color=dg.MUTED, italic=True, after=6)

num = 0
d.h("2.  Critical issues (fix before promoting sync)")
for x in by_sev['critical']:
    num += 1
    render_issue(num, x)

d.h("3.  High-severity issues")
for x in by_sev['high']:
    num += 1
    render_issue(num, x)

if by_sev['medium'] or by_sev['low']:
    d.h("4.  Medium & low issues")
    for x in by_sev['medium'] + by_sev['low']:
        num += 1
        render_issue(num, x, brief=True)

# OPEN QUESTIONS
if OQ:
    d.h("5.  Open questions - your call")
    d.p("These need a founder decision before/while building. The recommended default is noted "
        "where the audit had one.", italic=True, color=dg.MUTED, size=9.5)
    for i, q in enumerate(OQ):
        d.bullet(clean(q), size=9.8)

# PHASED PLAN
if PHASES:
    d.h("6.  Phased build plan")
    for ph in PHASES:
        d.h2(clean(ph.get('phase', '')), color=dg.OLIVE, size=11.5)
        if ph.get('goal'):
            d.p(clean(ph.get('goal', '')), size=9.5, italic=True, color=dg.MUTED, after=3)
        for it in ph.get('items', []):
            d.bullet(clean(it), size=9.8)

d.rule()
d.p("Methodology: 9-agent workflow (run wf_cf6ca2b8-068). 5 domain researchers (conflict "
    "resolution, Supabase auth/storage, codebase coverage, account lifecycle/security, "
    "multi-device merge UX) each combined WebSearch best-practice research with reading the real "
    "code; 3 critics cross-examined (completeness, adversarial red-team, code-grounding); 1 "
    "synthesiser deduped + prioritised. Full per-agent reports + source URLs are in the workflow "
    "transcript. NOTE: one research agent failed to return structured output, but its domain "
    "(conflict resolution) was independently covered by the adversarial + grounding critics.",
    size=8.5, color=dg.MUTED, italic=True)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "05-Account-and-Multi-Device-Sync.docx")
d.save(out)
print("WROTE:", out, "|", len(ISSUES), "issues")
