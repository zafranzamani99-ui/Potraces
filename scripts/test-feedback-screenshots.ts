/**
 * Live probe for the beta_feedback screenshot bug.
 *
 * Replays the app's exact submit sequence against the LIVE Supabase project
 * with a throwaway account and reports which step fails:
 *   0a. anon REST: does the screenshot_paths column exist?   (parse error vs permission error)
 *   0b. anon storage: does the beta-screenshots bucket exist? ("Bucket not found" vs RLS error)
 *   1. insert beta_feedback row
 *   2. upload a tiny JPEG to beta-screenshots
 *   3. update the row's screenshot_paths (needs the column grant + CHECK)
 *   4. cleanup: delete file, delete row, delete the throwaway account itself
 *
 * Run: npx tsx scripts/test-feedback-screenshots.ts
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://jngmanwvhbpkpkeklfiv.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZ21hbnd2aGJwa3BrZWtsZml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDQxODYsImV4cCI6MjA5OTU4MDE4Nn0.T36knLFwrWBtd-h-37Q-dQrlMNdfk0jeSJOQP_ch5bE';

// Smallest valid JPEG (~134 bytes, 1x1 px).
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwA//9k=';

function jpegBlob(): Blob {
  return new Blob([Buffer.from(JPEG_B64, 'base64')], { type: 'image/jpeg' });
}

async function main() {
  console.log('── Step 0a: anon REST, does screenshot_paths exist?');
  {
    const res = await fetch(
      `${SB_URL}/rest/v1/beta_feedback?select=screenshot_paths&limit=0`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
    );
    const text = await res.text();
    console.log(`   ${res.status} ${text.slice(0, 300)}`);
    if (text.includes('screenshot_paths') && res.status === 400) {
      console.log('   ✗ COLUMN MISSING — multi-screenshot migration NOT applied');
    } else if (res.status === 401 || res.status === 403) {
      console.log('   ✓ column exists (permission error comes after parse, so the column resolved)');
    }
  }

  console.log('── Step 0b: anon storage upload, does beta-screenshots bucket exist?');
  {
    const form = new FormData();
    form.append('', jpegBlob(), 'probe.jpg');
    const res = await fetch(
      `${SB_URL}/storage/v1/object/beta-screenshots/anon-probe/never.jpg`,
      {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: form,
      },
    );
    const text = await res.text();
    console.log(`   ${res.status} ${text.slice(0, 300)}`);
    if (text.includes('Bucket not found')) {
      console.log('   ✗ BUCKET MISSING');
    } else {
      console.log('   ✓ bucket exists (upload blocked by auth/RLS as expected for anon)');
    }
  }

  console.log('── Step 1: throwaway signup');
  const email = `probe-${Date.now()}@potraces.app`;
  const password = `probe-${Math.random().toString(36).slice(2)}-Aa1`;
  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signUp, error: signUpErr } = await sb.auth.signUp({ email, password });
  if (signUpErr) {
    console.log(`   ✗ signup failed: ${signUpErr.message}`);
    return;
  }
  if (!signUp.session) {
    console.log('   ✗ no session returned (email confirmation is ON) — cannot run authenticated steps');
    return;
  }
  const userId = signUp.session.user.id;
  console.log(`   ✓ session as ${userId}`);

  let rowId: string | undefined;
  let uploadedPath: string | undefined;
  try {
    console.log('── Step 2: insert beta_feedback row');
    const { data: inserted, error: insErr } = await sb
      .from('beta_feedback')
      .insert({
        email,
        severity: null,
        body: 'screenshot upload probe (auto-deleted)',
        app_version: 'probe',
        user_agent: 'node-probe',
      })
      .select('id')
      .single();
    if (insErr) {
      console.log(`   ✗ insert failed: ${insErr.message} (${insErr.code ?? ''})`);
      return;
    }
    rowId = inserted.id;
    console.log(`   ✓ row ${rowId}`);

    console.log('── Step 3: upload JPEG to beta-screenshots (mirrors app upload)');
    uploadedPath = `${userId}/feedback-${Date.now()}-0.jpg`;
    const form = new FormData();
    form.append('', jpegBlob(), 'feedback.jpg');
    const { error: upErr } = await sb.storage
      .from('beta-screenshots')
      .upload(uploadedPath, form, { upsert: true, contentType: 'multipart/form-data' });
    if (upErr) {
      console.log(`   ✗ UPLOAD FAILED: ${upErr.message}`);
      console.log('   → this is likely the app bug: storage side rejects the upload');
    } else {
      console.log('   ✓ upload ok');
    }

    if (!upErr) {
      console.log('── Step 4: update row screenshot_paths (column grant + CHECK)');
      const { error: updErr } = await sb
        .from('beta_feedback')
        .update({ screenshot_paths: [uploadedPath] })
        .eq('id', rowId);
      if (updErr) {
        console.log(`   ✗ UPDATE FAILED: ${updErr.message} (${updErr.code ?? ''})`);
        console.log('   → this is likely the app bug: the path never lands on the row');
      } else {
        console.log('   ✓ update ok — server side fully healthy; bug is app/device specific');
      }
    }
  } finally {
    console.log('── Cleanup');
    if (uploadedPath) {
      const { error } = await sb.storage.from('beta-screenshots').remove([uploadedPath]);
      console.log(error ? `   file remove: ${error.message}` : '   file removed');
    }
    if (rowId) {
      const { error } = await sb.from('beta_feedback').delete().eq('id', rowId);
      console.log(error ? `   row delete: ${error.message}` : '   row deleted');
    }
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const res = await fetch(`${SB_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });
      console.log(res.ok ? '   throwaway account deleted' : `   account delete failed (${res.status}) — remove ${email} in the dashboard`);
    }
  }
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
