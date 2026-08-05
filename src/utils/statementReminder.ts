// Pure date math for the monthly statement reminder — kept RN-free so the
// tsx unit test (scripts/test-statement-reminder.ts) can import it, same
// convention as importDedup.ts. The scheduler lives in
// src/services/statementReminders.ts and re-exports this.

/** 10:00 local on the 1st of NEXT month — always in the future. */
export function nextStatementReminderDate(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 10, 0, 0, 0);
}
