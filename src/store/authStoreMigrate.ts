/**
 * Pure zustand-persist migration from the flat v1 auth state to the two-slot v2
 * shape. Kept import-free so tsx can unit-test it.
 */
export function migrateAuthV1toV2(persisted: any) {
  const flat = persisted ?? {};
  return {
    business: {
      isAuthenticated: !!flat.isAuthenticated,
      isVerified: !!flat.isVerified,
      phone: flat.phone ?? null,
      userId: flat.userId ?? null,
      provider: flat.provider ?? null,
    },
    personal: {
      isAuthenticated: false,
      phone: null,
      userId: null,
      provider: null,
    },
  };
}
