import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabasePersonal } from './supabase';
import type { FeedbackType } from '../store/feedbackDraftStore';

// In-app "Report a bug / idea" submission → the shared `beta_feedback` table
// (the same table the web form + admin board use). Reports always go through the
// PERSONAL client: the Account sign-in screen only ever creates a personal
// session, and a business phone login carries a fake @potraces.app email we could
// never reply to.

const SCREENSHOTS_BUCKET = 'beta-screenshots';

/** No personal session — the caller routes the user to the Account sign-in
 *  screen and preserves the draft, then re-sends. */
export class NotSignedInError extends Error {
  constructor() {
    super('NOT_SIGNED_IN');
    this.name = 'NotSignedInError';
  }
}

export interface FeedbackInput {
  type: FeedbackType; // 'bug' | 'idea'
  body: string;
  screenshotUri?: string | null;
}

/**
 * Submit a report. Ordering matters: insert the ROW first (the valuable part),
 * then best-effort upload the optional screenshot and patch `screenshot_path`.
 * A failed/offline upload therefore loses neither the report nor leaves an
 * orphaned file. Throws `NotSignedInError` when there's no personal session;
 * re-throws any DB error (e.g. the rate-limit trigger) for the caller to surface.
 */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const { data: { session } } = await supabasePersonal.auth.getSession();
  if (!session) throw new NotSignedInError();
  const userId = session.user.id;

  // The `severity` column doubles as the type: 'idea' for ideas; bugs come in
  // unset so the founder assigns priority on the admin board (matches the web form).
  const severity = input.type === 'idea' ? 'idea' : null;

  const { data: inserted, error } = await supabasePersonal
    .from('beta_feedback')
    .insert({
      email: session.user.email ?? null, // real JWT email (RLS checks it) — never user-typed
      severity,
      body: input.body.trim(),
      app_version: Application.nativeApplicationVersion ?? 'unknown',
      user_agent: `${Platform.OS} ${Platform.Version}`.slice(0, 500),
    })
    .select('id')
    .single();
  if (error) throw error;

  // Optional screenshot — best effort, never fails an already-saved report.
  if (input.screenshotUri && inserted?.id) {
    try {
      const png = await manipulateAsync(input.screenshotUri, [{ resize: { width: 1080 } }], {
        format: SaveFormat.PNG,
      });
      const path = `${userId}/feedback-${Date.now()}.png`; // DB CHECK requires the <uid>/ prefix
      const formData = new FormData();
      formData.append('', { uri: png.uri, name: 'feedback.png', type: 'image/png' } as any);
      const { error: upErr } = await supabasePersonal.storage
        .from(SCREENSHOTS_BUCKET)
        .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
      if (!upErr) {
        await supabasePersonal
          .from('beta_feedback')
          .update({ screenshot_path: path })
          .eq('id', inserted.id);
      }
    } catch {
      // screenshot is a nice-to-have — the report is already saved
    }
  }
}
