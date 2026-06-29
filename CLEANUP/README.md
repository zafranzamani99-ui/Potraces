# vibe-cleanup-mobile

An agent skill that turns an AI-generated ("vibe-coded") mobile app into something shippable. It runs a four-layer review — code quality, security, performance, cross-platform parity — and reports findings rated CRITICAL, HIGH, or MEDIUM with incorrect-and-correct code, keeping blocking issues separate from optional polish. Covers React Native, Expo, and native Swift/Kotlin.

## What is inside

```
vibe-cleanup-mobile/
├── SKILL.md                      # the workflow the agent follows
├── README.md                     # this file
├── references/
│   ├── code-quality.md           # code smells, refactoring, config, dependencies
│   ├── security.md               # secrets, storage, transport, auth, validation
│   ├── performance.md            # lists, re-renders, JS thread, Hermes, images
│   ├── android-performance.md    # Android deep-dive: cold start, app size, jank
│   ├── platform-parity.md        # permissions, push, safe areas, store rules
│   ├── native.md                 # Swift/Kotlin equivalents of all four layers
│   └── agent-lineup.md           # orchestrator + specialist subagents, run order
└── scripts/
    ├── find-stubs.sh             # finds stubbed backends, mocks, TODOs
    ├── android-perf-scan.sh      # checks R8/shrink, baseline profile, startup, jank
    └── check-touch-targets.sh    # flags undersized tap targets
```

The agent reads `SKILL.md` when your request matches, then opens a reference file only when it reaches that layer. This keeps the context small while the depth stays available.

## Install

**Claude Code (all your projects):**
```bash
cp -r vibe-cleanup-mobile ~/.claude/skills/
```

**Claude Code (one project, shared with your team via git):**
```bash
cp -r vibe-cleanup-mobile .claude/skills/
```

**Claude Desktop / claude.ai:** the `.skill` file installs directly through the Skills settings — upload it there.

**Cursor or Windsurf:** these read rules rather than skills. Paste the contents of `SKILL.md` (and the reference files you want) into the project's "Rules for AI" / custom instructions.

**Codex or other agents that read `.codex/skills`:**
```bash
cp -r vibe-cleanup-mobile ~/.codex/skills/
```

Make the scripts executable after copying:
```bash
chmod +x ~/.claude/skills/vibe-cleanup-mobile/scripts/*.sh
```

## Use it

You do not call the skill by name. Open your codebase in the agent and ask in plain language. Any of these will trigger it:

- "Clean up this app and get it ready to ship."
- "Review my React Native app for production."
- "Why is my app slow on Android?"
- "Audit this for security before I put it on the App Store."
- "Fix this vibe-coded app."

The agent establishes context first (platforms, stack, whether the backend is real), runs the bundled scripts, then works through the four layers in order and reports back.

## The four layers, in order

The order is deliberate. Each layer assumes the one before it is done — securing unreadable code, or speeding up incorrect code, makes a mess.

1. **Code quality** — make it understandable. Split god components, kill dead code, name things, centralise config.
2. **Security** — stop it leaking. Get secrets out of the bundle, tokens into secure storage, add error handling so failures do not crash.
3. **Performance** — make it fast on a real mid-range phone. Fix list rendering, cut re-renders, keep work off the JS thread.
4. **Parity** — make it behave the same on iOS and Android. Safe areas, permissions, push, back button, store requirements.

## A note on the scripts

`find-stubs.sh`, `android-perf-scan.sh`, and `check-touch-targets.sh` are read-only greps that catch what humans skim past. They produce candidates, not verdicts — the agent (and you) confirm each hit. Read any shell command before running it, and prefer version-pinned tooling over piping remote scripts into a shell.

## Android: the agent lineup and the skills behind it

For a big Android job — install fast, load fast, smooth on every screen — run this as a lineup of subagents rather than one session: a lead that plans and integrates, plus specialists for investigation, startup, app size, jank, correctness, and verification. `references/agent-lineup.md` has the full roster, the run order, the "find the exact bug" loop, and example `.claude/agents/*.md` definitions.

Point the specialists at these existing Android agent skills (read each before trusting it):

- **android/skills** — Google's official Android skills (R8 analysis, AGP 9, Navigation 3, edge-to-edge, Play Billing).
- **R8 Analyzer** (Google, inside android/skills) — audits R8/ProGuard keep rules for redundant and over-broad entries. The app-size specialist's main tool.
- **Drjacky/claude-android-ninja** — Macrobenchmark, Baseline Profiles, Perfetto, Play Vitals, Compose recomposition, App Startup, StrictMode, R8 mapping de-obfuscation. Powers the investigator and startup specialist.
- **skydoves/compose-performance-skills** — Compose stability, recomposition, lazy layouts, Baseline Profiles, R8. The jank specialist's tool for Compose.
- **rcosteira79/android-skills** — debugging: Logcat, ADB, ANR traces, R8 stack-trace decoding, Perfetto, memory leaks, Gradle failures. Backs the investigator.
- **skydoves/android-testing-skills** — Compose UI, AndroidX Test, JVM, ADB. Backs the verifier.

Install a community skill the same way as this one — copy its folder into `~/.claude/skills/` or `.claude/skills/`, or add it through its marketplace if it publishes one.
