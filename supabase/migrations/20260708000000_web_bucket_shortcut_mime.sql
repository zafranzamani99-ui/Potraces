-- Allow the signed "Potraces Quick Log" Apple Shortcut file on the public web
-- bucket. SEC-H4 (20260417000000) locked this bucket to images to block
-- same-origin HTML/JS execution; application/x-apple-shortcut is an inert
-- signed binary (Safari downloads it, never renders), so the original threat
-- model is unchanged. Uploaded via:
--   npx supabase storage cp "shortcut/Potraces Quick Log.shortcut" \
--     ss:///web/PotracesQuickLog.shortcut --experimental \
--     --content-type application/x-apple-shortcut
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg', 'image/png', 'image/webp',
         'application/x-apple-shortcut'
       ]::text[]
 WHERE id = 'web';
