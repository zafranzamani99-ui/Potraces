// Cross-screen intent flag for the Calculator "What next?" hub.
//
// When a hub sub-action that lives on ANOTHER screen (Detailed split →
// DebtTracking, Put toward a goal → Goals) is CANCELLED, it sets this true and
// goBack()s. The Calculator reads it on focus and reopens the hub. A real SAVE
// leaves it false, so the hub stays closed (reopening it would show the same
// amount and invite a duplicate split/expense).
//
// A plain module-level flag (mirrors the openQuickAdd pattern) is used instead of
// navigation params so the return is a reliable goBack() that preserves the
// Calculator's in-progress value.
export const calcHub = { reopenOnReturn: false };
