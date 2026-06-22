import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Sends the ONE promised "we're live" launch email to everyone on the waitlist who
// joined by email — exactly once each. Email only: phone rows are never messaged here.
//
// Admin-gated: the caller must pass their own Supabase access token (from admin.html),
// which we verify with rpc('is_admin') before touching anything. Resend is the sender;
// its key lives ONLY as an edge-function secret, never in any site/ file.
//
// Idempotency: we only pick rows where notified_at is null, and we stamp notified_at=now()
// for each row we successfully send to — so re-running the blast can never double-message.
//
// Setup (operator):
//   supabase secrets set RESEND_API_KEY=...                    (from resend.com)
//   # verify the jejakbaki.my domain in Resend first (DNS records) — see FROM below
//   supabase functions deploy waitlist-blast

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// The sending identity. The jejakbaki.my domain MUST be verified in Resend
// (add the DKIM/SPF DNS records Resend gives you) or every send will be rejected.
const FROM = 'Potraces <hello@jejakbaki.my>';

const BATCH_SIZE = 20; // small batches + a short pause = friendlier to deliverability
const BATCH_DELAY_MS = 1000;
const PAGE_SIZE = 1000; // <= configured max_rows; one full page of un-notified rows per query

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SUBJECT = 'Potraces is live — thanks for waiting';

function launchHtml(): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F9F9F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2B2B26;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:22px;font-weight:700;color:#4F5104;letter-spacing:-0.3px;">Potraces is live</div>
      <p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:20px 0 0;">
        Hey — you joined the waitlist for Potraces, the calm little money app for Malaysia.
        It's ready, so here's the one launch message we promised you.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#3A3A33;margin:16px 0 0;">
        No spreadsheets, no judgment — just an easy way to see where your money goes,
        track what you keep, and stay on top of who owes who.
      </p>
      <div style="margin:28px 0;">
        <a href="https://jejakbaki.my"
           style="display:inline-block;background:#4F5104;color:#ffffff;text-decoration:none;
                  font-size:15px;font-weight:600;padding:13px 26px;border-radius:12px;">
          Try Potraces
        </a>
      </div>
      <p style="font-size:13px;line-height:1.6;color:#8A8A80;margin:24px 0 0;">
        You're getting this once because you asked us to tell you when we launched.
        That's it — no newsletter, no follow-ups.
      </p>
      <p style="font-size:13px;color:#8A8A80;margin:8px 0 0;">— The Potraces team · jejakbaki.my</p>
    </div>
  </body>
</html>`;
}

function launchText(): string {
  return [
    'Potraces is live',
    '',
    "Hey — you joined the waitlist for Potraces, the calm little money app for Malaysia.",
    "It's ready, so here's the one launch message we promised you.",
    '',
    'No spreadsheets, no judgment — just an easy way to see where your money goes,',
    'track what you keep, and stay on top of who owes who.',
    '',
    'Try it: https://jejakbaki.my',
    '',
    "You're getting this once because you asked us to tell you when we launched.",
    "That's it — no newsletter, no follow-ups.",
    '',
    '— The Potraces team · jejakbaki.my',
  ].join('\n');
}

type Row = { id: string; contact: string };

/** Send one launch email via Resend. Returns true only on a 2xx. */
async function sendOne(to: string): Promise<boolean> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: SUBJECT,
        html: launchHtml(),
        text: launchText(),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // (b) admin gate — verify the CALLER is an admin using their own token.
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
    if (adminErr || isAdmin !== true) return json({ error: 'Forbidden' }, 403);

    // (d) not configured → tell the admin, don't pretend we sent anything.
    if (!RESEND_API_KEY) return json({ configured: false, sent: 0 });

    // (c) service-role client reads the un-notified EMAIL rows (never phone).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let sent = 0;
    let failed = 0;

    // (c2) Drain the un-notified rows in pages. PostgREST caps each select at the
    // configured max_rows (1000), so we loop until a page comes back empty, sending
    // every page — a large list is fully sent in one invocation, not just the first 1000.
    while (true) {
      const { data: rows, error: selErr } = await admin
        .from('waitlist')
        .select('id, contact')
        .is('notified_at', null)
        .eq('kind', 'email')
        // (consent gate) PDPA: only email people who actually consented.
        .not('consent_at', 'is', null)
        .limit(PAGE_SIZE);
      if (selErr) return json({ error: selErr.message }, 500);

      const targets = (rows ?? []) as Row[];
      if (targets.length === 0) break; // fully drained

      let stampedThisPage = 0;

      // (e) send in small batches with a short pause between them.
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (row) => ({ row, ok: await sendOne(row.contact) })),
        );

        // (f) stamp notified_at only for the rows we actually sent.
        const sentIds = results.filter((r) => r.ok).map((r) => r.row.id);
        failed += results.length - sentIds.length;
        if (sentIds.length) {
          // (f2) Retry the idempotent stamp — only count rows as failed if the stamp
          // genuinely can't be persisted after retries. A flaky update must NOT mark
          // already-emailed rows as failed, or a re-run would double-send them.
          const nowIso = new Date().toISOString();
          let stamped = false;
          for (let attempt = 0; attempt < 3 && !stamped; attempt++) {
            const { error: updErr } = await admin
              .from('waitlist')
              .update({ notified_at: nowIso })
              .in('id', sentIds);
            if (!updErr) { stamped = true; break; }
            if (attempt < 2) await sleep(500);
          }
          if (stamped) {
            sent += sentIds.length;
            stampedThisPage += sentIds.length;
          } else {
            // We emailed these but could not stamp them after retries. They will be
            // re-selected next run -> double-send. Surface loudly rather than silently.
            failed += sentIds.length;
            console.error('waitlist-blast: sent but FAILED to stamp notified_at for ids', sentIds);
          }
        }

        if (i + BATCH_SIZE < targets.length) await sleep(BATCH_DELAY_MS);
      }

      // If a whole page produced zero newly-stamped rows (all sends/stamps failed),
      // those rows keep notified_at = null and would be re-fetched forever — stop
      // instead of spinning in an infinite loop.
      if (stampedThisPage === 0) break;
    }

    // (g)
    return json({ configured: true, sent, failed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
