# Audit & Findings Index

Single dashboard for every audit/finding report. **One audit home: this `audit/` folder.**
When an auditor agent writes a new report, it adds one line here.

> How to read status: **🔴 open criticals** · **🟡 in progress / open highs** · **🟢 resolved / settled**
> `BACKLOG.md` is the merged single-source-of-truth backlog; `FIX_ORDER.md` is the sequenced plan.

## Backlog & sequencing
| Report | Owner agent | What it covers |
|---|---|---|
| [BACKLOG.md](BACKLOG.md) | ui-ux-designer | Unified merged backlog — single source of truth |
| [FIX_ORDER.md](FIX_ORDER.md) | ui-ux-designer | Sequenced fix plan derived from the backlog |
| [CONSOLIDATED_FINDINGS.md](CONSOLIDATED_FINDINGS.md) | production-readiness-auditor | Cross-stream rollup of all data/security findings |

## Design & UX
| Report | Owner agent | What it covers |
|---|---|---|
| [DESIGN_CONSISTENCY.md](DESIGN_CONSISTENCY.md) | design-consistency-auditor | Token discipline, component consistency across screens |
| [DESIGN_SETTLED.md](DESIGN_SETTLED.md) | design-consistency-auditor | Decisions locked in (don't re-litigate) |
| [FIRST_TIME_ENGAGEMENT.md](FIRST_TIME_ENGAGEMENT.md) | first-time-engagement-auditor | First-15-minutes new-user journey |
| [NAVIGATION_SPEED.md](NAVIGATION_SPEED.md) | navigation-speed-auditor | Tap counts, dead ends, perceived speed |

## Data, logic & production safety
| Report | Owner agent | What it covers |
|---|---|---|
| [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) | production-readiness-auditor | Ship blockers — top-level rollup |
| [DATA_INTEGRITY_AUDIT.md](DATA_INTEGRITY_AUDIT.md) | production-readiness-auditor | Money math, cascading deletes, sync conflicts |
| [BUSINESS_LOGIC_AUDIT.md](BUSINESS_LOGIC_AUDIT.md) | production-readiness-auditor | Wrong-number / paid-unpaid logic errors |
| [STATE_LIFECYCLE_AUDIT.md](STATE_LIFECYCLE_AUDIT.md) | production-readiness-auditor | State machine violations, lifecycle |
| [EDGE_CASES_AUDIT.md](EDGE_CASES_AUDIT.md) | production-readiness-auditor | Crashes, empty states, rapid taps, app-kill |
| [NUMBERS_CONSISTENCY_AUDIT.md](NUMBERS_CONSISTENCY_AUDIT.md) | production-readiness-auditor | Cross-store number consistency |
| [OFFLINE_RESILIENCE_AUDIT.md](OFFLINE_RESILIENCE_AUDIT.md) | production-readiness-auditor | Offline behavior, queue, reconnect |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | production-readiness-auditor | Auth bypass, RLS, data isolation |
| [EXTERNAL_SERVICES_AUDIT.md](EXTERNAL_SERVICES_AUDIT.md) | production-readiness-auditor | AI / Supabase trust boundaries |
| [WALLET_SPLIT_MAP.md](WALLET_SPLIT_MAP.md) | production-readiness-auditor | Wallet/split reconciliation map |

## Scalability
| Report | Owner agent | What it covers |
|---|---|---|
| [SCALABILITY.md](SCALABILITY.md) | scalability-auditor | Performance ceilings as data/users grow |

## Echo Voice Input
| Report | Owner agent | What it covers |
|---|---|---|
| [ECHO_VOICE_V1_PLAN.md](ECHO_VOICE_V1_PLAN.md) | lead architect | V1 voice-input build plan (3 phases) — fuses [ECHO_VOICE_FORENSICS.md](ECHO_VOICE_FORENSICS.md) (defects) + [ECHO_VOICE_RESEARCH.md](ECHO_VOICE_RESEARCH.md) (UX) |

## Store submission
| Report | Owner agent | What it covers |
|---|---|---|
| [STORE_COMPLIANCE_AUDIT.md](STORE_COMPLIANCE_AUDIT.md) | 5-agent compliance sweep | 🔴 App Store / Play submission blockers + risks (IAP, account deletion, entitlements, keys, permissions, privacy) — incl. 2026-06-17 resolution status |
| [STORE_DATA_DISCLOSURE.md](STORE_DATA_DISCLOSURE.md) | store-compliance | Copy-paste Apple Nutrition Label + Play Data Safety answers from real data flows |

## Lives elsewhere (linked, not moved)
- Root `AUDIT.md` — legacy top-level audit (referenced by production-readiness-auditor)
- Root `WCAG_AUDIT.md` / `WCAG_FIX_PLAN.md` — accessibility (color contrast, tap targets)
- Root `PLAN.md` — top-level roadmap
- [../docs/plans/](../docs/plans/) — active implementation plans
- [../docs/archive/](../docs/archive/) — superseded blueprints & outcomes
- [../docs/research/](../docs/research/) — research notes (dark mode, OCR, goal/receipt design)
