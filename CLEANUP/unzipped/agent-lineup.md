# The agent lineup

A cleanup this size is too much context for one agent to hold well. Split it into a lineup: a lead that plans and integrates, and specialist subagents that each own one bounded job, run in their own context, and hand back findings. This keeps the lead session fast and each specialist focused. For a one-line bug, skip all this — a single session is faster. Reach for the lineup when the work splits into separate responsibilities with different tools, which an Android performance pass does.

Contents:
- How the lineup works
- The roster
- Real skills that power each role
- The run order
- The "find the exact bug" loop
- How to create the subagents in Claude Code

## How the lineup works

Subagents are isolated Claude instances the lead session spawns. Each gets its own context window, its own tool permissions, and its own prompt. The lead owns planning and integration; the specialists handle scoped tasks and return a result. Current Claude Code can fan out many subagents in parallel in one session, and a separate grader can send a subagent back to revise until its output meets a rubric — use that to enforce that every performance fix comes back with a before/after number, not a claim.

The lead does not fix code directly. It routes, collects findings, removes duplicates, sequences the work, and writes the final report.

## The roster

**1. Lead (orchestrator).** The main session. Reads this skill, establishes context (build files, target screens, whether the backend is real), dispatches the specialists, integrates their findings, sequences fixes, and produces the report. Owns the output contract from `SKILL.md`.

**2. Investigator.** Read-mostly. Maps the repository, runs the bundled scripts (`scripts/android-perf-scan.sh`, `scripts/find-stubs.sh`), reproduces the slow moment on a real device, captures a Perfetto / system trace, and returns the exact file and line behind each problem. This is the agent that turns "the app is slow" into "`Application.onCreate` blocks 1.2s on a synchronous DB migration at `App.kt:34`."

**3. Startup specialist.** Owns cold start. Audits `Application.onCreate` and content-provider initialisers, moves work off the launch path with App Startup and lazy init, and sets up a Baseline Profile. Returns findings with file and line.

**4. App-size specialist.** Owns install size. Turns on R8 full mode and resource shrinking, audits the R8 keep rules for redundant and over-broad entries, moves the build to an App Bundle, and inspects the bundle to find and cut heavy dependencies.

**5. Jank specialist.** Owns smoothness, screen by screen. Finds main-thread work during frames, non-recycling lists, Compose recomposition storms, and overdraw, and returns the fix per screen with file and line.

**6. Correctness reviewer.** Checks that each proposed performance fix keeps behaviour the same and opens no security hole (it reads `references/security.md`). A faster app that drops data or leaks a token is not a win.

**7. Verifier.** Builds the release artifact, runs the Macrobenchmark tests, and compares the before and after numbers. Gates each fix: it must build, must pass tests, and must show a real measured improvement, or it goes back.

## Real skills that power each role

These are installable agent skills. Point each subagent at the ones that match its job. Read any third-party skill before trusting it, and prefer version-pinned tooling.

- **android/skills** — Google's official Android agent skills (R8 analysis, AGP 9 migration, Navigation 3, edge-to-edge, Play Billing). Authoritative baseline for the lead and every specialist.
- **R8 Analyzer** (built by Google, inside android/skills) — audits ProGuard/R8 keep rules, flags redundant and over-broad rules and rules libraries already provide, and on newer R8 produces quantitative impact metrics. The app-size specialist's main tool.
- **Drjacky/claude-android-ninja** — Macrobenchmark, Microbenchmark, Baseline Profiles, ProfileInstaller, system tracing, Perfetto, Android Performance Analyzer, Play Vitals, Compose recomposition (Strong Skipping), App Startup, StrictMode, plus debugging (LeakCanary, R8 mapping de-obfuscation). Powers the investigator and the startup specialist.
- **skydoves/compose-performance-skills** — Compose stability, recomposition, lazy layouts, modifiers, side effects, measurement, Baseline Profiles, R8. The jank specialist's main tool for Compose screens.
- **rcosteira79/android-skills** — debugging Android and KMP: Logcat, ADB, ANR traces, R8 stack-trace decoding, Perfetto investigation, memory leaks, Gradle build failures, Compose recomposition bugs. Backs the investigator.
- **skydoves/android-testing-skills** — Compose UI, AndroidX Test, JVM unit tests, and ADB-driven end-to-end. Backs the verifier.
- **android-reverse-engineering-skill** — decompiles a built APK, extracts endpoints, and traces call flows. Use it to confirm what actually shipped when the source and the binary disagree.

## The run order

1. **Lead** reads the request and this skill, establishes context, and writes the plan.
2. **Investigator** maps the repo, runs the scripts, reproduces and traces the slow path, and returns findings with file and line.
3. **Startup, app-size, and jank specialists** run in parallel, each scoped to its domain, each returning findings rated CRITICAL / HIGH / MEDIUM with an incorrect/correct fix and a location.
4. **Correctness reviewer** checks the proposed fixes do not change behaviour or open a hole.
5. **Lead** integrates: removes duplicates, sequences the work (build-level fixes — R8, resource shrinking, Baseline Profile — first, then per-screen jank fixes), and applies changes incrementally.
6. **Verifier** builds the release, runs Macrobenchmark before and after, and gates each fix. Anything without a measured improvement goes back to the specialist.
7. **Lead** writes the final report in the output contract.

## The "find the exact bug" loop

Run by the investigator and verifier together, per problem:

1. Reproduce the slow moment on a real device.
2. Trace exactly that moment with Perfetto / system trace.
3. Find the long span on the main thread — the missed frame, or the block before the first frame.
4. Read the method on that span; trace it to the file and line.
5. Hand the location and cause to the matching specialist for the fix.
6. Re-run the Macrobenchmark test; compare before and after; accept only on a real improvement.

Never report a cause you have not traced to a line. "Probably the list" is not a finding; "`PostRow` decodes a full-resolution bitmap on the scroll thread at `PostRow.kt:88`" is.

## How to create the subagents in Claude Code

Subagents are markdown files with frontmatter, in `.claude/agents/` (this project) or `~/.claude/agents/` (all your projects). Manage them with `/agents`. The lead delegates to them automatically based on their `description`. Scope each one's tools to what it needs — the investigator reads and traces, it does not need write access.

Example — the jank specialist:

```markdown
---
name: android-jank-specialist
description: Finds and fixes dropped-frame jank on Android screens — main-thread
  work during frames, non-recycling lists, Compose recomposition storms, overdraw.
  Use during an Android performance review when a screen stutters or scrolls badly.
tools: Read, Grep, Glob, Edit, Bash
model: inherit
---

You fix Android rendering jank, one screen at a time.

For each screen flagged as janky:
1. Confirm the cause from the trace the investigator captured — name the span
   and the file:line. Do not guess.
2. Apply the matching fix (see references/android-performance.md):
   move work off the main thread, switch to LazyColumn/LazyRow, stabilise
   Compose recomposition, or reduce overdraw.
3. Return an incorrect/correct snippet, the file:line, and an impact rating.
4. Hand the change to the verifier to confirm with a Macrobenchmark frame test.

Never replace a recycling list with a non-recycling one to fix a layout bug.
```

Create one file per role from the roster above, give each a tight `description` so the lead routes to it, and keep each prompt short and pointed. The lead session then runs the order above on its own.
