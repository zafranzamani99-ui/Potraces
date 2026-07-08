// Beta signup + per-signup welcome email. Wraps the existing `waitlist_signup`
// RPC (referral + dedup + validation all live there, untouched) and — ONLY on a
// brand-new EMAIL signup — sends a Resend welcome email with the two beta
// download links, then returns the links so the site can also show them
// on-screen (spam-folder insurance).
//
// Why an edge function and not a public "email this address" endpoint: the email
// only ever fires for an address that just successfully joined the waitlist, so
// this can't be turned into an open spam relay. An hourly cap is an extra
// email-bomb backstop. It does no MORE than the anon RPC the site already calls.
//
// Public (verify_jwt=false). Reuses the Resend secrets already set for
// waitlist-blast: RESEND_API_KEY + RESEND_FROM. Download links come from the
// BETA_IOS_URL / BETA_ANDROID_URL secrets (unset → "coming soon" state).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('RESEND_FROM') ?? 'Potraces <onboarding@resend.dev>';
const IOS_URL = (Deno.env.get('BETA_IOS_URL') ?? '').trim();
const ANDROID_URL = (Deno.env.get('BETA_ANDROID_URL') ?? '').trim();
const SITE = 'https://jejakbaki.my';
const BETA_URL = `${SITE}/beta.html`;
const WELCOME_CAP_PER_HOUR = 300; // email-bomb backstop

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SUBJECT = "You're in — welcome to the Potraces beta";

const btn = (href: string, label: string, bg: string) =>
  `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:12px;margin:6px 8px 6px 0;">${label}</a>`;

function downloadBlockHtml(): string {
  const have = IOS_URL || ANDROID_URL;
  if (!have) {
    return `<p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:20px 0 0;">
      Your download links are being put in place right now — we'll drop them straight
      into this inbox in the next day or two. Hang tight 🙌</p>`;
  }
  const buttons =
    (IOS_URL ? btn(IOS_URL, '📱 Install on iPhone', '#4F5104') : '') +
    (ANDROID_URL ? btn(ANDROID_URL, '🤖 Install on Android', '#786148') : '');
  const tips: string[] = [];
  if (IOS_URL) tips.push('iPhone: opens in the TestFlight app — tap Install.');
  if (ANDROID_URL) tips.push('Android: downloads an APK — allow "install from unknown sources" once.');
  return `<div style="margin:22px 0 4px;">${buttons}</div>
    <p style="font-size:13px;line-height:1.6;color:#8A8A80;margin:8px 0 0;">${tips.join('<br>')}</p>`;
}

function welcomeHtml(): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F9F9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B26;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:22px;font-weight:700;color:#4F5104;letter-spacing:-0.3px;">Welcome to Potraces 🎉</div>
      <p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:20px 0 0;">
        Hey — I'm Zafran, I built Potraces solo. Thanks for jumping on the beta of
        the calm little money app for Malaysia. Here's everything to get you started.
      </p>

      <div style="font-size:15px;font-weight:700;color:#4F5104;margin:28px 0 0;">Get the app</div>
      ${downloadBlockHtml()}

      <div style="font-size:15px;font-weight:700;color:#4F5104;margin:28px 0 0;">Try this first</div>
      <p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:8px 0 0;">
        <b>Quick Log</b> — double-tap the back of your iPhone to log an expense
        without even opening the app. Set it up in Settings → Money Setup → Quick Log.
      </p>

      <div style="font-size:15px;font-weight:700;color:#4F5104;margin:28px 0 0;">Found a bug? Got an idea?</div>
      <p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:8px 0 0;">
        Tell us right in the app, or at <a href="${BETA_URL}" style="color:#4F5104;">jejakbaki.my/beta</a> —
        that's also where you'll see <b>what's new and what we're fixing</b>. Your feedback
        genuinely shapes what ships next.
      </p>

      <p style="font-size:13px;line-height:1.6;color:#8A8A80;margin:28px 0 0;">
        It's a beta, so expect a few rough edges — your data is safe. You're getting this
        because you joined the Potraces beta at jejakbaki.my.
      </p>
      <p style="font-size:13px;color:#8A8A80;margin:8px 0 0;">— Zafran · Potraces · jejakbaki.my</p>
    </div>
  </body>
</html>`;
}

function welcomeText(): string {
  const dl = (IOS_URL || ANDROID_URL)
    ? [
        'Get the app:',
        IOS_URL ? `  iPhone (TestFlight): ${IOS_URL}` : '',
        ANDROID_URL ? `  Android (APK): ${ANDROID_URL}` : '',
      ].filter(Boolean).join('\n')
    : "Your download links are being put in place right now — we'll email them to this inbox in the next day or two.";
  return [
    'Welcome to Potraces',
    '',
    "Hey — I'm Zafran, I built Potraces solo. Thanks for joining the beta of the",
    'calm little money app for Malaysia.',
    '',
    dl,
    '',
    'Try this first: Quick Log — double-tap the back of your iPhone to log an',
    'expense without opening the app (Settings > Money Setup > Quick Log).',
    '',
    `Found a bug or got an idea? Tell us in the app, or at ${BETA_URL} — that's`,
    "also where you'll see what's new and what we're fixing.",
    '',
    "It's a beta, so expect a few rough edges — your data is safe.",
    '— Zafran · Potraces · jejakbaki.my',
  ].join('\n');
}

async function sendWelcome(to: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: SUBJECT, html: welcomeHtml(), text: welcomeText() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ message: 'method' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > 2048) return json({ message: 'too-large' }, 413);

  let p: any;
  try { p = await req.json(); } catch { return json({ message: 'bad-json' }, 400); }

  const contact = typeof p.p_contact === 'string' ? p.p_contact.trim() : '';
  const kind = p.p_kind === 'phone' ? 'phone' : 'email';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The REAL signup — the existing RPC owns referral codes, dedup and validation
  // (raises consent_required / invalid_contact, which the site maps to messages).
  const { data, error } = await admin.rpc('waitlist_signup', {
    p_contact: contact,
    p_kind: kind,
    p_source: typeof p.p_source === 'string' ? p.p_source : null,
    p_ref: typeof p.p_ref === 'string' ? p.p_ref : null,
    p_consent: p.p_consent === true,
  });
  if (error) return json({ message: error.message }, 400);

  const result = (data ?? {}) as { referral_code?: string | null; position?: number | null; already?: boolean };

  // Welcome email: new EMAIL signups only, best-effort, never blocks the response,
  // hourly-capped as an email-bomb backstop.
  if (kind === 'email' && !result.already && contact) {
    try {
      const since = new Date(Date.now() - 3_600_000).toISOString();
      const { count } = await admin.from('waitlist')
        .select('id', { count: 'exact', head: true }).gte('welcomed_at', since);
      if ((count ?? 0) < WELCOME_CAP_PER_HOUR) {
        const ok = await sendWelcome(contact);
        if (ok) {
          await admin.from('waitlist').update({ welcomed_at: new Date().toISOString() })
            .eq('contact', contact).is('welcomed_at', null);
        }
      }
    } catch (e) {
      console.log('[beta-signup] welcome email skipped:', String(e));
    }
  }

  return json({ ...result, ios: IOS_URL, android: ANDROID_URL });
});
