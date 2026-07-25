// Collectz screens — shared display helpers (dates, money, template fill).
// Kept tiny and pure so every Collectz screen formats values the same way.

import type { CollectzSocialKey } from '../../../services/collectzService';

// ── Organizer contact (socials + WhatsApp group) ──────────────────────────
/** Display order + canonical URL base per platform. Labels are brand names —
 *  identical in EN/BM (DuitNow QR precedent), so no i18n keys needed. */
export const SOCIAL_PLATFORMS: { key: CollectzSocialKey; label: string; icon: string; base: string }[] = [
  { key: 'ig', label: 'Instagram', icon: 'instagram', base: 'https://instagram.com/' },
  { key: 'x', label: 'X', icon: 'twitter', base: 'https://x.com/' },
  { key: 'threads', label: 'Threads', icon: 'at-sign', base: 'https://threads.net/@' },
  { key: 'fb', label: 'Facebook', icon: 'facebook', base: 'https://facebook.com/' },
  { key: 'telegram', label: 'Telegram', icon: 'send', base: 'https://t.me/' },
];

/** "@name" / "name" / full URL → canonical profile URL. Null when blank. */
export function normalizeSocial(key: CollectzSocialKey, raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '').trim();
  if (!handle) return null;
  const meta = SOCIAL_PLATFORMS.find((p) => p.key === key);
  return meta ? meta.base + handle : null;
}

/** Reverse for edit-prefill: canonical URL → the short handle for the input. */
export function socialHandleFromUrl(url: string | null | undefined): string {
  const v = (url ?? '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) return v;
  const seg = v.replace(/\/+$/, '').split('/').pop() ?? '';
  return seg.replace(/^@/, '');
}

/** Only real WhatsApp group invites pass — anything else is rejected quietly. */
export function isWhatsappGroupUrl(u: string): boolean {
  return /^https:\/\/chat\.whatsapp\.com\/\S+$/i.test(u.trim());
}

/** "20 Jul 2026" — same shape as the service's announcement date. */
export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
}

/** "9:30 PM". */
export function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** "20 Jul 2026, 9:30 PM" (null-safe parts). */
export function fmtDateTime(iso: string | null | undefined): string | null {
  const parts = [fmtDate(iso), fmtTime(iso)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Event window: "20 Jul 2026, 9:00 PM – 11:00 PM". Falls back to a single
 * start time (fmtDateTime) when there's no end. If the end lands on a later
 * calendar day (e.g. an 11 PM – 1 AM game), the end date is shown too so the
 * range never reads backwards.
 */
export function fmtEventRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string | null {
  const date = fmtDate(startIso);
  const startTime = fmtTime(startIso);
  const endTime = fmtTime(endIso);
  // No usable end → behave exactly like fmtDateTime(start).
  if (!endTime) return fmtDateTime(startIso);
  // No usable start but we have an end → just the end (defensive).
  if (!startTime) return [date, endTime].filter(Boolean).join(', ') || null;

  const s = new Date(startIso as string);
  const e = new Date(endIso as string);
  const sameDay =
    !isNaN(s.getTime()) &&
    !isNaN(e.getTime()) &&
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  if (sameDay) {
    const timePart = `${startTime} – ${endTime}`;
    return [date, timePart].filter(Boolean).join(', ');
  }
  // Crosses midnight (or spans days) — spell out both dates.
  const startPart = [date, startTime].filter(Boolean).join(', ');
  const endPart = [fmtDate(endIso), endTime].filter(Boolean).join(', ');
  return `${startPart} – ${endPart}`;
}

/** "RM 45.00". */
export function fmtMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Fill `{key}` placeholders in an i18n template. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), template);
}

/**
 * Display label for a 1-based team index: the custom name the organizer or a
 * participant set, else the caller-supplied fallback (already localised, e.g.
 * "Team 2"). Kept here so every screen labels teams identically.
 */
export function teamLabel(names: string[] | null | undefined, idx: number, fallback: string): string {
  const custom = names?.[idx - 1];
  return custom && custom.trim() ? custom.trim() : fallback;
}


// ── Player requirements (skill / age / gender / booking) ────────────────────
// One chip per SET requirement — screens render them in the hero card; unset
// fields produce nothing. Icon names are Feather glyphs.

type RequirementSession = {
  skill_level?: 'beginner' | 'intermediate' | 'advanced' | null;
  age_req?: 'below_18' | '18_above' | 'any' | null;
  gender_req?: 'male' | 'female' | 'any' | null;
  booking_status?: 'booked' | 'later' | null;
};

type RequirementStrings = {
  reqSkillBeginner: string;
  reqSkillIntermediate: string;
  reqSkillAdvanced: string;
  reqAgeBelow18: string;
  reqAge18Above: string;
  reqAgeAny: string;
  reqGenderMale: string;
  reqGenderFemale: string;
  reqGenderAny: string;
  reqBookingBooked: string;
  reqBookingLater: string;
};

export function requirementChips(
  t: { collectz: RequirementStrings },
  s: RequirementSession | null | undefined,
): { icon: string; label: string }[] {
  if (!s) return [];
  const items: { icon: string; label: string }[] = [];
  if (s.skill_level) {
    items.push({
      icon: 'zap',
      label: { beginner: t.collectz.reqSkillBeginner, intermediate: t.collectz.reqSkillIntermediate, advanced: t.collectz.reqSkillAdvanced }[s.skill_level],
    });
  }
  if (s.age_req) {
    items.push({
      icon: 'user',
      label: { below_18: t.collectz.reqAgeBelow18, '18_above': t.collectz.reqAge18Above, any: t.collectz.reqAgeAny }[s.age_req],
    });
  }
  if (s.gender_req) {
    items.push({
      icon: 'users',
      label: { male: t.collectz.reqGenderMale, female: t.collectz.reqGenderFemale, any: t.collectz.reqGenderAny }[s.gender_req],
    });
  }
  if (s.booking_status) {
    items.push({
      icon: 'bookmark',
      label: s.booking_status === 'booked' ? t.collectz.reqBookingBooked : t.collectz.reqBookingLater,
    });
  }
  return items;
}
