---
name: vibe-cleanup-mobile
description: Clean up and review AI-generated or "vibe-coded" mobile apps so they are safe, fast, and ready for the App Store and Play Store. Use this whenever the user asks to clean up, refactor, review, audit, harden, or speed up a mobile codebase, says things like "make this production-ready", "why is my app slow", or "fix this vibe-coded app", or shares a mobile project (React Native, Expo, native Swift/iOS, or Kotlin/Android). Runs a layered review of code quality, security, performance, and cross-platform parity, reporting findings rated CRITICAL, HIGH, or MEDIUM with incorrect-and-correct snippets and blocking issues kept separate from suggestions. Also use it for Android performance work — install fast, load fast, smooth on every screen — and to pinpoint the exact file and line behind a slowdown by checking the codebase, optionally splitting a large job across a lineup of specialist subagents. Apply even when the user does not say "skill" or "cleanup" explicitly.
license: MIT
---

# Vibe cleanup for mobile

Take an AI-generated mobile app that looks finished and make it actually shippable. Vibe-coded apps run in the demo and fall over under real users: hardcoded secrets, no error handling, lists that re-render the whole screen, backends that are stubbed out. This skill finds those problems and fixes them in a fixed order, so the fixes do not fight each other.

## Core rule: fix in layers, never all at once

Run the review in this order. Each layer assumes the previous one is done. Fixing security before the code is readable, or performance before it is correct, produces a tangle that nobody can review.

1. Code quality and maintainability — make the code understandable.
2. Security and reliability — stop it leaking secrets and crashing.
3. Performance — make it fast on real devices, not just the simulator.
4. Cross-platform parity — make it behave the same on iOS and Android.

Do not skip ahead. If the user only wants one layer ("just make it faster"), say which earlier layers you are skipping and why that carries risk, then do the layer they asked for.

## Scale to a lineup for a big job

A full cleanup is too much context for one agent to hold well. For anything beyond a small fix, split the work across a lineup: a lead that plans and integrates, plus specialist subagents that each own one bounded job (investigation, startup, app size, jank, correctness, verification). The lead routes and writes the report; the specialists run in their own context and hand back findings with file and line. See `references/agent-lineup.md` for the roster, the real installable skills that power each role, the run order, and how to create the subagents in Claude Code. For a one-line bug, skip the lineup — a single session is faster.

## Step 1: Establish context before touching anything

Ask or detect these. The answers change almost every recommendation that follows.

- What does the app do, and which platforms ship? (iOS only, Android only, both)
- What is the stack? React Native (bare), Expo, native Swift/SwiftUI, native Kotlin/Compose, or a mix.
- For React Native: is Hermes on? Is the New Architecture (Fabric) enabled? What navigation library?
- Is there a real backend, or are API calls stubbed/mocked? (This is the most common hidden gap — see Step 2.)
- Where is the app in its life? Prototype, in TestFlight/internal testing, or already live.

If the codebase is in the workspace, read `package.json` / `Podfile` / `build.gradle` and the entry file before asking, so you only ask what you cannot see.

## Step 2: Run the deterministic checks first

Before reading code by hand, run the bundled scripts. They are fast and catch the things humans skim past.

- `scripts/find-stubs.sh <project-dir>` — finds stubbed endpoints, mocked data, `TODO`/`FIXME`, and `throw new Error("not implemented")`. AI tools often stub or skip backends, so an app can look complete while talking to nothing. Surface every stub as a blocking issue until the user confirms it is intentional.
- `scripts/android-perf-scan.sh <project-dir>` — for Android, checks the Gradle config for R8 minification and resource shrinking turned off, a missing Baseline Profile, heavy startup init, non-recycling lists, and main-thread blocking. Heuristic, not a profiler — confirm each hit with a trace.
- `scripts/check-touch-targets.sh <src-dir>` — flags tap targets below the platform minimum (44pt on iOS, 48dp on Android). Undersized targets fail App Store review and real-world use.

Report what the scripts find before you start the manual review. Treat their shell commands as local developer operations: read them before running, and do not pipe remote scripts into a shell.

## Step 3: Run the layered review

For each layer, read the matching reference file, apply its checklist to the codebase, and collect findings. Read each reference only when you reach that layer — they are detailed and there is no reason to load all of them up front.

| Layer | Reference file | Covers |
|-------|---------------|--------|
| 1. Code quality | `references/code-quality.md` | code smells, refactoring, hardcoded config, dependency rot, linting |
| 2. Security | `references/security.md` | secrets in the bundle, insecure storage, input validation, auth, transport, dependency CVEs |
| 3. Performance | `references/performance.md` | list rendering, re-renders, JS-thread blocking, Hermes, startup time, bundle size |
| 4. Parity | `references/platform-parity.md` | permissions, push, safe areas, back button, keyboard, gestures, store requirements |

When the target is Android and the goal is speed — install fast, load fast, smooth on every screen — read `references/android-performance.md` for the Android layer. It is the deep version of the performance layer: cold start and Baseline Profiles, R8 full mode and app size, jank and Compose recomposition, each with the exact tool, command, and metric.

For native Swift or Kotlin code (not React Native), also read `references/native.md`, which maps the same four layers onto native idioms.

## Step 4: Find the exact bug, do not guess

"The app is slow" is not a finding. "The list janks" is not a finding. A finding names a file and a line and a measured cost. Trace every problem to its source before proposing a fix.

The loop:

1. Reproduce the slow moment on a real device — not the emulator, which hides real timing.
2. Record exactly that moment. On Android, use a Perfetto / system trace; for React Native, the React Native DevTools or Flipper profiler; on iOS, Xcode Instruments.
3. Find the long span on the main thread — the frame that missed budget, or the block before the first frame.
4. Read the method on that span and trace it to the file and line in the codebase.
5. That is the cause. Anything you have not traced to a line is a guess — label it as one or go find it.

Example of the standard you are holding to: not "probably the list," but "`PostRow` decodes a full-resolution bitmap on the scroll thread at `PostRow.kt:88`."

## Step 5: Fix incrementally and verify each fix

Do not apply a batch of changes and hope. Change one thing, confirm it builds, confirm it behaves, then move on. This isolates the cause when something breaks.

- After a performance fix, measure before and after with the same tool you used to find the bug. On Android, re-run the Macrobenchmark test for that journey and compare the numbers. Accept a fix only on a real measured improvement.
- After any change, build a release artifact to confirm it survives production settings, which differ from debug:
  - Android: `cd android && ./gradlew bundleRelease` (App Bundle) or `assembleRelease` (APK)
  - iOS: archive the scheme in Xcode, or `xcodebuild -scheme <scheme> archive`
- Prioritise findings rated CRITICAL and HIGH first. They give the most return and are the ones that block a ship.

## Output contract

Produce the review in this exact structure. Keep blocking issues visually separate from optional ones, so the user can tell what stops a ship from what is merely nice.

```
# <App name> cleanup review

## Summary
Two or three sentences: what state the codebase is in, and the single most
important thing to fix.

## Blocking issues (fix before shipping)
For each: a one-line title, the file/location, why it breaks in production,
and an incorrect/correct code snippet.

## High-impact improvements
Same format. Real wins, but the app can ship without them.

## Optional suggestions
Short list. Polish and preference.

## What I changed
A plain list of edits already applied, file by file.

## How to verify
The exact commands or profiler steps to confirm each fix worked.
```

Rate every finding `CRITICAL` (fix immediately — security hole, crash, or store rejection), `HIGH` (significant improvement), or `MEDIUM` (worthwhile). Give an incorrect/correct snippet for anything code-level — showing the fix is worth more than describing it.

## Two failures to watch for

These are the mistakes that make a cleanup worthless.

**Trusting the AI output, including your own.** The reason this work exists is that vibe code looks done but is not. Apply the same suspicion to the code you generate while fixing. Re-read your edits as if someone else wrote them, and run the build.

**Polishing a frontend that talks to nothing.** Step 2 exists because AI tools stub backends silently. Confirm the network layer is real before you spend time on the UI. A beautiful screen wired to a mock is not progress.

## When this is a native app, not React Native

Most of the performance and parity advice in the references assumes React Native, because that is where most vibe-coded mobile apps land. If the project is native Swift or Kotlin, the four layers still apply — read `references/native.md` for the idiomatic equivalents (Instruments instead of Flipper, `LazyColumn`/`List` instead of `FlashList`, Keychain/Keystore instead of secure-storage libraries) and ignore the React-specific patterns.
