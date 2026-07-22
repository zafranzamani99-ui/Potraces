// ─── Build-phase feature flags ──────────────────────────────────────────────
// CLOUD BACKUP is deliberately LOCKED during the beta phase so tester data never
// reaches the production Supabase project (avoids polluting prod + the ongoing
// region migration). Fail-closed: backup stays OFF unless explicitly unlocked.
//
// TO UNLOCK AT LAUNCH: set EXPO_PUBLIC_CLOUD_BACKUP=1 in the production EAS
// environment (and in your local .env when you want to test backup). Nothing
// else about the backup flow changes — the normal paid-tier gate takes over.
export const CLOUD_BACKUP_ENABLED = process.env.EXPO_PUBLIC_CLOUD_BACKUP === '1';
