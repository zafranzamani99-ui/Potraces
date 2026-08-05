import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabasePersonal } from './supabase';
import type { FeedbackType } from '../store/feedbackDraftStore';

// In-app "Report a bug / idea" submission, into the shared `beta_feedback` table
// (the same table the web form + admin board use). Reports always go through the
// PERSONAL client: the Account sign-in screen only ever creates a personal
// session, and a business phone login carries a fake @potraces.app email we could
// never reply to.

const SCREENSHOTS_BUCKET = 'beta-screenshots';
const MAX_SCREENSHOTS = 3;

export type FeedbackStatus = 'new' | 'triaged' | 'fixed' | 'wontfix' | 'dup' | 'done';

export interface MyFeedbackReport {
  id: string;
  created_at: string;
  severity: string | null;
  body: string;
  status: FeedbackStatus;
}

/** No personal session, so the caller routes the user to the Account sign-in
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
  screenshotUris?: string[]; // up to 3, best-effort
}

/**
 * Submit a report. Ordering matters: insert the ROW first (the valuable part),
 * then best-effort upload the optional screenshots and patch screenshot_paths.
 * A failed/offline upload therefore loses neither the report nor leaves an
 * orphaned reference. Screenshots are compressed to JPEG and uploaded in parallel
 * so 3 images don't stack up serially. Throws NotSignedInError when there's no
 * personal session; re-throws any DB error (e.g. the rate-limit trigger).
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
      email: session.user.email ?? null, // real JWT email (RLS checks it), never user-typed
      severity,
      body: input.body.trim(),
      app_version: Application.nativeApplicationVersion ?? 'unknown',
      user_agent: `${Platform.OS} ${Platform.Version}`.slice(0, 500),
    })
    .select('id')
    .single();
  if (error) throw error;

  // Optional screenshots (up to 3), best effort, compressed and uploaded in
  // parallel. One failure doesn't lose the others or the already-saved report.
  const uris = (input.screenshotUris ?? []).slice(0, MAX_SCREENSHOTS);
  if (uris.length && inserted?.id) {
    const results = await Promise.all(
      uris.map(async (uri, i) => {
        try {
          const jpg = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
            format: SaveFormat.JPEG,
            compress: 0.7,
          });
          const path = `${userId}/feedback-${Date.now()}-${i}.jpg`; // DB CHECK needs <uid>/ prefix
          const formData = new FormData();
          formData.append('', { uri: jpg.uri, name: 'feedback.jpg', type: 'image/jpeg' } as any);
          const { error: upErr } = await supabasePersonal.storage
            .from(SCREENSHOTS_BUCKET)
            .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
          return upErr ? null : path;
        } catch {
          return null;
        }
      }),
    );
    const paths = results.filter((p): p is string => !!p);
    if (paths.length) {
      await supabasePersonal
        .from('beta_feedback')
        .update({ screenshot_paths: paths })
        .eq('id', inserted.id);
    }
  }
}

/**
 * The signed-in user's own reports (RLS scopes the query to their rows), newest
 * first, so they can track status. Throws NotSignedInError when signed out.
 */
export async function listMyFeedback(): Promise<MyFeedbackReport[]> {
  const { data: { session } } = await supabasePersonal.auth.getSession();
  if (!session) throw new NotSignedInError();
  const { data, error } = await supabasePersonal
    .from('beta_feedback')
    .select('id, created_at, severity, body, status')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyFeedbackReport[];
}
