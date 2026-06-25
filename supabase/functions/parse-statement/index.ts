// @ts-nocheck
// Parse a bank statement PDF using Gemini multimodal.
// Input:  { pdfBase64: string, filename?: string }
// Output: { transactions: Array<{ date, amount, type, description, category? }> }
//
// Rate limit: 5 calls per user per UTC month.
// Auth: requires authenticated Supabase user (either anon or phone).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptPDF, isEncrypted } from 'npm:@pdfsmaller/pdf-decrypt@1.0.1';
import { decodeBase64, encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const MONTHLY_LIMIT = 5;

const EXTRACTION_PROMPT = `You are a Malaysian bank statement parser. Extract every transaction from this PDF statement.

Return ONLY valid JSON in this exact shape, no markdown fences, no prose:
{
  "currency": "MYR",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": <positive number>,
      "type": "income" | "expense",
      "description": "<merchant or transfer counterparty, cleaned>",
      "raw": "<original statement line, trimmed>",
      "suggested_category": "<one of: food, transport, groceries, bills, shopping, entertainment, health, transfer, salary, other>"
    }
  ]
}

Rules:
- Skip balance lines, opening/closing balance rows, and running-total rows. Only real transactions.
- amount is always POSITIVE. Use "type": "expense" for debits/withdrawals; "income" for credits/deposits.
- For transfers between own accounts, type is "expense" or "income" depending on which side the statement shows.
- description: clean up merchant names — strip POS IDs, transaction refs, dates embedded in the string.
- If you cannot parse a date, skip that row.
- Common MY banks: Maybank, CIMB, Public Bank, RHB, HL Bank, AmBank, Bank Islam, Bank Rakyat.
- If the PDF is clearly not a bank statement, return { "currency": "MYR", "transactions": [] }.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Invalid token' }, 401);
    }

    // Rate limit — cheap server-side count for current UTC month
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count } = await admin
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'parse_statement')
      .gte('created_at', monthStart.toISOString());

    if ((count ?? 0) >= MONTHLY_LIMIT) {
      return json({
        error: 'rate_limited',
        message: `You've reached the monthly import limit of ${MONTHLY_LIMIT} statements. Resets on the 1st.`,
        remaining: 0,
      }, 429);
    }

    const body = await req.json();
    const pdfBase64: string | undefined = body?.pdfBase64;
    const password: string | undefined =
      typeof body?.password === 'string' && body.password.length > 0 ? body.password : undefined;
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return json({ error: 'pdfBase64 required' }, 400);
    }
    // Reject obviously oversized payloads (> ~10MB of base64 → ~7.5MB PDF)
    if (pdfBase64.length > 14 * 1024 * 1024) {
      return json({ error: 'PDF too large — max 10MB' }, 413);
    }

    // ─── Decrypt password-protected statements before Gemini ──────────────────
    // MY banks (Maybank/CIMB/etc.) lock e-statements with the holder's IC; Gemini
    // returns 400 "document has no pages" on an encrypted PDF, so we strip the
    // /Encrypt layer first. Detection needs no password. The password is used
    // in-memory only — never logged, never persisted. A password_required /
    // password_wrong return happens BEFORE the Gemini call, so it consumes no
    // monthly quota (quota is only logged after a successful Gemini call below).
    let pdfData = pdfBase64;
    try {
      const rawBytes = decodeBase64(pdfBase64);
      const enc = await isEncrypted(rawBytes);
      if (enc.encrypted) {
        if (!password) {
          return json({ error: 'password_required' }, 422);
        }
        let decrypted: Uint8Array;
        try {
          decrypted = await decryptPDF(rawBytes, password);
        } catch {
          // Never log the caught error here — it could echo the password.
          return json({ error: 'password_wrong' }, 422);
        }
        pdfData = encodeBase64(decrypted);
      }
    } catch (e) {
      // base64/parse failure on the encryption probe — fall through and let Gemini
      // try the original bytes; if it can't read them we surface ai_failed below.
      console.error('[parse-statement] encryption probe failed:', (e as Error).message);
    }

    // Call Gemini 2.5 Flash with inline PDF data.
    // NOTE: gemini-2.0-flash was retired 2026-06-01 — that caused the prod 502s.
    // gemini-2.5-flash is GA but sunsets 2026-10-16; migrate to gemini-3.5-flash before then.
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfData } },
              { text: EXTRACTION_PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      // Log the upstream HTTP status so a future non-2xx is diagnosable from logs
      // (404 = dead model, 400 = unreadable/encrypted PDF, 403 = bad key, 429 = quota).
      console.error(`[parse-statement] gemini error ${geminiRes.status}:`, err);
      return json({ error: 'ai_failed', status: geminiRes.status, detail: err.slice(0, 500) }, 502);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: 'ai_invalid_json', sample: text.slice(0, 200) }, 502);
    }

    const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : [];

    // Log usage (non-blocking if table missing)
    try {
      await admin.from('ai_usage').insert({
        user_id: user.id,
        kind: 'parse_statement',
        metadata: { count: transactions.length, filename: body?.filename ?? null },
      });
    } catch (e) {
      console.warn('[parse-statement] usage log failed:', (e as Error).message);
    }

    return json({
      currency: parsed?.currency ?? 'MYR',
      transactions,
      remaining: Math.max(0, MONTHLY_LIMIT - ((count ?? 0) + 1)),
    }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
