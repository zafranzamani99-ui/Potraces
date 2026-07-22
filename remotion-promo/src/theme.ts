// Potraces "Onyx" dark palette — pulled straight from src/constants/index.ts (CALM_DARK).
export const C = {
  background: '#121212', // Onyx
  surface: '#1E1E1E',
  accent: '#A4A843', // olive (AA-passing)
  gold: '#D9BD55',
  bronze: '#C9924A',
  deepOlive: '#9A9540',
  onAccent: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.62)',
  textMuted: 'rgba(255,255,255,0.40)',
};

// Light palette (v4 — CALM personal light mode from src/constants). ONE accent: olive.
export const L = {
  bg1: '#FFFFFF',
  bg2: '#EAEDE4', // soft warm off-white — bottom of the white gradient
  text: '#17170F', // near-black warm
  textSoft: '#6E6E63',
  textFaint: '#A6A69B',
  accent: '#4F5104', // olive — the single accent
  accentSoft: 'rgba(79,81,4,0.10)',
  card: '#FFFFFF',
  cardAlt: '#F5F6F1',
  line: 'rgba(23,23,15,0.09)',
  onAccent: '#FFFFFF',
  // soft floated-card shadow (light)
  shadow: '0 40px 80px rgba(35,38,20,0.13), 0 10px 26px rgba(35,38,20,0.07)',
};

// SF-Pro-ish system stack — reads "Apple" on macOS, no font dependency to install.
export const FONT =
  "-apple-system, 'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif";

// Neu-on-Onyx dual shadow: light top-left, dark bottom-right (raised soft).
export const NEU_RAISED =
  '-8px -8px 20px rgba(255,255,255,0.03), 10px 10px 26px rgba(0,0,0,0.55)';
