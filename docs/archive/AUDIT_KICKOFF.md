# Potraces — 4-agent audit kickoff

Paste the prompt below into Claude Code from the project root. It tells Claude Code to dispatch all four sub-agents (defined in `.claude/agents/`), run them in the right order, then merge the output into a unified backlog.

The four agents auto-register because they live in `.claude/agents/`. You do not need to define them again.

---

## The kickoff prompt — paste this into Claude Code

```
I have four audit sub-agents defined in .claude/agents/:

1. scalability-auditor
2. navigation-speed-auditor
3. design-consistency-auditor
4. first-time-engagement-auditor

Run all four agents to audit the Potraces codebase. Each agent already has its full instructions and output path in its frontmatter. Do not edit them.

Run them in this order so later agents can reference earlier IDs:

Step 1 — Create the audit folder if it doesn't exist:
  mkdir audit (relative to project root)

Step 2 — Run scalability-auditor. Wait for it to write audit/SCALABILITY.md before continuing.

Step 3 — Run navigation-speed-auditor. Wait for it to write audit/NAVIGATION_SPEED.md.

Step 4 — Run design-consistency-auditor. Wait for it to write audit/DESIGN_CONSISTENCY.md.

Step 5 — Run first-time-engagement-auditor. Wait for it to write audit/FIRST_TIME_ENGAGEMENT.md.

Step 6 — After all four reports exist, read all four and produce a unified backlog at audit/BACKLOG.md with this structure:

  # Potraces — Unified Audit Backlog
  Date: <today>

  ## All Critical findings (sorted by domain)
  Table: ID | Domain | File:lines | Finding | Effort
  Include items from all four reports and from the existing AUDIT.md and WCAG_AUDIT.md.

  ## All High findings
  Same table format.

  ## Top 10 quick wins (under 4 hours each)
  Pick the highest-value short tasks across all four reports.

  ## Domain tallies
  Table showing Critical/High/Medium/Low counts per domain (Scalability, Navigation, Design, First-Run, plus the existing Security from AUDIT.md, Logic from AUDIT.md, UX from AUDIT.md, WCAG).

  ## Recommended sprint plan
  3 sprints. Each sprint: 5-8 items pulled from Critical and High. Justify the picks.

Rules for the orchestration:
- Do not let any agent skip its required reading.
- Each agent must produce findings cited to file:line.
- After each agent finishes, briefly summarize its tally line (Critical/High/Medium/Low) before launching the next.
- If any agent says it cannot find a file mentioned in its instructions, do not invent — flag the missing file in that agent's report and continue.
- Do not edit AUDIT.md or WCAG_AUDIT.md. They are inputs only.
```

---

## What happens after you paste

Claude Code reads the four agent definitions, runs them sequentially using the Task tool, and each agent independently reads the codebase and writes its report. Then Claude Code merges all four into `audit/BACKLOG.md`.

Total time: roughly 10-25 minutes depending on how thorough each agent is.

You'll end up with five new files:

```
audit/
├── SCALABILITY.md
├── NAVIGATION_SPEED.md
├── DESIGN_CONSISTENCY.md
├── FIRST_TIME_ENGAGEMENT.md
└── BACKLOG.md      ← the merged sprint plan
```

---

## If something goes wrong

**Claude Code says it can't find the agents.** Make sure you're running it from `C:\Project\Potraces` (the project root). The agents are at `.claude/agents/` relative to that.

**An agent finishes too fast with shallow output.** Open that agent's `.md` file in `.claude/agents/`, find the "Required reading" section, and add a line at the top: `Read every file in the required reading list before producing any findings. Cite at least 15 specific file:line references.`

**An agent duplicates AUDIT.md findings anyway.** The instructions tell each one not to. If it happens, follow up in chat: "The scalability auditor duplicated SEC-C1 from AUDIT.md. Re-read its rules and produce only NEW findings."

**You want to re-run just one agent.** Tell Claude Code: "Re-run the navigation-speed-auditor only and overwrite audit/NAVIGATION_SPEED.md." It will pick up the existing agent definition.

---

## A note on the `.claude` folder being committed

`.claude/agents/*.md` are now part of your repo. If you don't want these audit agents tracked in git, add this to `.gitignore`:

```
.claude/agents/
```

If you DO want them tracked (so future contributors run the same audits), leave them in. They're plain markdown — safe to commit.
