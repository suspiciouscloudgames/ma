# Turkish translations — 2026-09-23

Hosting remains GitHub Pages (suspiciouscloudgames/ma) with the existing Supabase project.

## Deployed backend
- OPENAI_API_KEY stays only in Supabase secrets. Never retrieve/print it.
- translations.sql applied successfully: nullable English/Korean columns, private bounded job queue, service-role-only claim/finish/failure RPCs.
- translate-workshop edge source is functions/translate-workshop/index.ts. Fixed diagnostic samples require the existing admin password. No arbitrary text/image proxy.
- Original text remains unchanged. English then Korean appears only when both are complete.
- Public clients cannot supply translated columns. Leases prevent concurrent duplicate requests. Maximum three active leases; failed calls back off, capped at five attempts. Daily 1,000-call/500,000-source-character ceiling limits translation costs.
- While a shared gallery is visible and workshop is open, three browser workers wake the queue. If all galleries are hidden/closed, jobs wait for reopening. Uploads never wait for translation.
- Workshop closure freezes translation writes for safe archival. Translations are in the existing select-all JSON snapshot and screenshot. Queue rows cascade away with deleted originals.

## Verification
- Actual API: Turkish question, answer, ASCII Turkish, English/Korean skip, hostile instructions translated without following them; unauthorized diagnostic/cross-origin rejected.
- SQL migration tested in rolled-back transaction: permissions, concurrency ceiling, stale lease rejection, finish, retry delay, archive freeze. Then committed without synthetic rows.
- Later broader rollback test (translation-database.sql) blocked by safety review and NOT executed; do not run without explicit approval.
- Isolated local browser: English/Korean beneath originals at 11px, rgb(134,134,129); no card overlap; dragging translated r0 moves only r0.
- Empty production queue returned HTTP 200 processed:0; no synthetic records committed.
- Re-run pnpm test before deployment.

Future diagnostics: MA_TRANSLATION_ADMIN=<existing password> node scripts/check-translations.mjs. Six small paid calls on fixed synthetic text only, never photos. Provider delays/failures leave originals intact with no participant notices. Ambiguous or unusually long text may require review.
