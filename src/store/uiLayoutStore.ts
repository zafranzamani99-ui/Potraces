import { create } from 'zustand';

// Transient (non-persisted) UI-layout measurements shared across the navigator
// tree. The floating tab bar (LiquidGlassNavBar) is position:absolute, so nothing
// in the layout flow knows its real height — it measures itself here so siblings
// like the Echo composer can seat themselves exactly above it instead of guessing.
interface UILayoutState {
  navBarHeight: number; // full floating tab-bar height, including its bottom safe-area padding
  setNavBarHeight: (h: number) => void;
}

export const useUILayoutStore = create<UILayoutState>((set) => ({
  navBarHeight: 0,
  // Ignore sub-pixel jitter so we don't churn subscribers on every re-layout.
  setNavBarHeight: (h) =>
    set((s) => (Math.abs(s.navBarHeight - h) > 0.5 ? { navBarHeight: h } : s)),
}));
