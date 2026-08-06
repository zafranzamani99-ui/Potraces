/**
 * Pure-logic tests for the Share & Earn Pro reward/abuse rules
 * (src/utils/shareRewardRules.ts — no RN/Supabase imports, so tsx runs it).
 * Run: npm run test:sharereward
 */
import {
  SHARE_PLATFORMS,
  PLATFORM_HOSTS,
  SHARE_REWARD_DAYS,
  SHARE_REWARD_CAP_PER_YEAR,
  SHARE_MIN_ACCOUNT_AGE_DAYS,
  LIKE_TIER_MONTH,
  LIKE_TIER_YEAR,
  tierForLikes,
  capReached,
  accountOldEnough,
  validatePostUrl,
} from '../src/utils/shareRewardRules';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };
const okKey = (platform: (typeof SHARE_PLATFORMS)[number], url: string) => {
  const v = validatePostUrl(platform, url);
  return v.ok ? v.urlKey : `ERR:${v.reason}`;
};

// ── platform table sanity ──
check('six platforms, spec order', SHARE_PLATFORMS.join(',') === 'instagram,red,reddit,facebook,x,threads');
check('every platform has hosts', SHARE_PLATFORMS.every((p) => PLATFORM_HOSTS[p].length > 0));

// ── tier day values (spec: 30+ → 1 month, 100+ → 1 year, viral → forever) ──
check('month = 30d', SHARE_REWARD_DAYS.month === 30);
check('year = 365d', SHARE_REWARD_DAYS.year === 365);
check('forever = 3650d (ledger max is 3700)', SHARE_REWARD_DAYS.forever === 3650);
check('forever fits the ledger days<=3700 invariant', SHARE_REWARD_DAYS.forever <= 3700);
check('year cap mirrors the referral cap number (independent counter)', SHARE_REWARD_CAP_PER_YEAR === 12);
check('account-age gate = 7d', SHARE_MIN_ACCOUNT_AGE_DAYS === 7);

// ── tierForLikes (UI hint only — the reviewer picks the tier) ──
check('0 likes → no tier', tierForLikes(0) === null);
check(`${LIKE_TIER_MONTH - 1} likes → no tier`, tierForLikes(LIKE_TIER_MONTH - 1) === null);
check(`${LIKE_TIER_MONTH} likes → month`, tierForLikes(LIKE_TIER_MONTH) === 'month');
check(`${LIKE_TIER_YEAR - 1} likes → month`, tierForLikes(LIKE_TIER_YEAR - 1) === 'month');
check(`${LIKE_TIER_YEAR} likes → year`, tierForLikes(LIKE_TIER_YEAR) === 'year');
check('100k likes → year (forever is a human call, never automatic)', tierForLikes(100000) === 'year');
check('NaN likes → no tier', tierForLikes(NaN) === null);

// ── year cap ──
check('under cap → allowed', capReached(11) === false);
check('at cap → blocked', capReached(12) === true);
check('over cap → blocked', capReached(99) === true);
check('cap 0 disables the gate', capReached(99, 0) === false);

// ── account-age gate ──
const now = new Date('2026-08-06T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
check('6-day-old account → too new', accountOldEnough(daysAgo(6), now) === false);
check('7-day-old account → old enough', accountOldEnough(daysAgo(7), now) === true);
check('1-year-old account → old enough', accountOldEnough(daysAgo(365), now) === true);

// ── URL validation: happy paths per platform ──
check('instagram post', okKey('instagram', 'https://www.instagram.com/p/ABC123/') === 'instagram.com/p/ABC123');
check('instagram bare host gets https prepended', okKey('instagram', 'instagram.com/reel/xyz') === 'instagram.com/reel/xyz');
check('instagr.am short link', okKey('instagram', 'https://instagr.am/p/ABC123') === 'instagr.am/p/ABC123');
check('RED (xiaohongshu)', okKey('red', 'https://www.xiaohongshu.com/explore/66a1b2c3') === 'xiaohongshu.com/explore/66a1b2c3');
check('RED short link', okKey('red', 'https://xhslink.com/a/AbC12') === 'xhslink.com/a/AbC12');
check('reddit comments link', okKey('reddit', 'https://www.reddit.com/r/malaysia/comments/abc123/potraces/') === 'reddit.com/r/malaysia/comments/abc123/potraces');
check('redd.it short link', okKey('reddit', 'https://redd.it/abc123') === 'redd.it/abc123');
check('facebook post', okKey('facebook', 'https://www.facebook.com/user.name/posts/1234567890') === 'facebook.com/user.name/posts/1234567890');
check('x post', okKey('x', 'https://x.com/someone/status/1234567890123456789') === 'x.com/someone/status/1234567890123456789');
check('twitter.com still accepted for x', okKey('x', 'https://twitter.com/someone/status/123') === 'twitter.com/someone/status/123');
check('threads post', okKey('threads', 'https://www.threads.net/@someone/post/ABC123') === 'threads.net/@someone/post/ABC123');
check('subdomain of an allowed host', okKey('instagram', 'https://m.instagram.com/p/ABC123') === 'm.instagram.com/p/ABC123');

// ── normalization / dedupe keys ──
check('query + hash stripped from the key',
  okKey('instagram', 'https://www.instagram.com/p/ABC123/?igsh=abc&utm_source=share#frag') === 'instagram.com/p/ABC123');
check('trailing slash stripped from the key',
  okKey('x', 'https://x.com/a/status/1/') === 'x.com/a/status/1');
check('host lowercased + www canonicalized in the key',
  okKey('reddit', 'https://WWW.REDDIT.COM/r/Malaysia/comments/ABC') === 'reddit.com/r/Malaysia/comments/ABC');
check('same post, different share params/host form → same key (dedupe)',
  okKey('instagram', 'https://www.instagram.com/p/ABC123/?igsh=one') === okKey('instagram', 'instagram.com/p/ABC123?utm=two') );

// ── URL validation: rejections ──
check('empty → invalid_url', okKey('instagram', '   ') === 'ERR:invalid_url');
check('not a url → invalid_url', okKey('instagram', 'not a url at all') === 'ERR:invalid_url');
check('bare homepage is not a post → invalid_url', okKey('instagram', 'https://www.instagram.com/') === 'ERR:invalid_url');
check('root without slash → invalid_url', okKey('x', 'https://x.com') === 'ERR:invalid_url');
check('ftp scheme → invalid_url', okKey('x', 'ftp://x.com/a/status/1') === 'ERR:invalid_url');
check('overlong input → invalid_url', okKey('x', 'https://x.com/' + 'a'.repeat(2100)) === 'ERR:invalid_url');
check('facebook post submitted as instagram → wrong_platform', okKey('instagram', 'https://www.facebook.com/u/posts/1') === 'ERR:wrong_platform');
check('reddit post submitted as x → wrong_platform', okKey('x', 'https://www.reddit.com/r/a/comments/b') === 'ERR:wrong_platform');
check('evil lookalike host → wrong_platform', okKey('x', 'https://x.com.evil.com/a/status/1') === 'ERR:wrong_platform');
check('suffix host without dot boundary → wrong_platform', okKey('x', 'https://notx.com/a/status/1') === 'ERR:wrong_platform');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`share-reward rules OK (${passed} checks)`);
