/**
 * Pure helpers for reasoning about the business/personal account pair.
 * MUST stay free of React-Native / Supabase imports so tsx can load it.
 */

/** True only when both modes are signed into the SAME Supabase auth user. */
export function isSharedAccount(
  businessUserId: string | null,
  personalUserId: string | null,
): boolean {
  return !!businessUserId && !!personalUserId && businessUserId === personalUserId;
}
