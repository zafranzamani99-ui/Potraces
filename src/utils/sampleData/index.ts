// ─── Sample data: public entry point ───────────────────────────────────
// Thin native wrapper. All the correctness-critical seeding lives in ./engine
// (settingsStore-free, so it is testable under tsx); the shared types, helpers
// and picker metadata live in ./core. This file exists only to bridge the two
// with the settings flag.
import { useSettingsStore } from '../../store/settingsStore';
import { seedPersona } from './engine';
import { DEFAULT_SAMPLE_BRACKET, type SampleBracket } from './core';

export {
  SAMPLE_PROFILES,
  DEFAULT_SAMPLE_BRACKET,
  daysAgo,
  startOfMonth,
  endOfMonth,
} from './core';
export type {
  SampleBracket,
  SampleProfileMeta,
  Persona,
  SeedContext,
  WalletSeed,
  TxSeed,
  ReceiptSeed,
  ContribSeed,
  SnapshotSeed,
} from './core';
export { seedPersona, isPersonalAccountEmpty, PERSONAS } from './engine';

/**
 * Seed a demo persona into the personal stores.
 *
 * Arms the "exploring with sample data" banner ONLY when the account was empty
 * beforehand. That banner's "clear & start fresh" empties ALL personal data, so
 * if a real user appends the sample set on top of their own data (Settings →
 * Load Sample Data appends, it never clears), arming it would hand them a
 * one-tap wipe of real records.
 */
export function loadSampleData(bracket: SampleBracket = DEFAULT_SAMPLE_BRACKET): void {
  const { wasEmpty } = seedPersona(bracket);
  if (wasEmpty) {
    useSettingsStore.getState().setSampleDataLoaded(true);
  }
}
