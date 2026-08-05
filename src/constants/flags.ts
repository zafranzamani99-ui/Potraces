// ─── Build-phase feature flags ──────────────────────────────────────────────
// CLOUD BACKUP is deliberately LOCKED during the beta phase so tester data never
// reaches the production Supabase project (avoids polluting prod + the ongoing
// region migration). Fail-closed: backup stays OFF unless explicitly unlocked.
//
// TO UNLOCK AT LAUNCH: set EXPO_PUBLIC_CLOUD_BACKUP=1 in the production EAS
// environment (and in your local .env when you want to test backup). Nothing
// else about the backup flow changes — the normal paid-tier gate takes over.
export const CLOUD_BACKUP_ENABLED = process.env.EXPO_PUBLIC_CLOUD_BACKUP === '1';

// INCREMENTAL SYNC (Stage 2: dirty-only push) — also deliberately OFF by
// default. Pull stays full either way (Stage 3 is separate); with this on, push
// upserts only dirty-tracked rows instead of re-stamping the user's entire
// history every cycle. Fail-closed like the beta lock above: flip via
// EXPO_PUBLIC_SYNC_INCREMENTAL=1 for internal testing first (rollout order in
// docs/INCREMENTAL_SYNC_PLAN.md — internal → % of users → all).
export const PERSONAL_SYNC_INCREMENTAL = process.env.EXPO_PUBLIC_SYNC_INCREMENTAL === '1';
