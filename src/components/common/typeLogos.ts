// Brand-logo images for savings/investment instrument types, rendered by
// CategoryIcon via the 'logo/<key>' icon spec (same pattern as BANK_LOGOS for
// wallets). Keys match the canonical type ids in savings/investmentTypes.ts —
// that registry stays PURE (string specs only, tsx-testable); the image
// require()s live here on the native side.
// NOTE: file/folder names must stay URL-safe (no spaces, no '+') — Metro serves
// dev-client assets over HTTP and mangles those characters (image silently 404s
// and renders as a blank tile).
export const TYPE_LOGOS: Record<string, any> = {
  asb: require('../../../assets/savings-logo/asnb.jpeg'),
  tabung_haji: require('../../../assets/savings-logo/tabung-haji.jpg'),
  tng_plus: require('../../../assets/savings-logo/tng-goplus.png'),
  wahed: require('../../../assets/savings-logo/wahed.jpeg'),
};
