# Translation rollout — 2026-09-23

Not activated on GitHub Pages. Main remains 7d2cb5e (Drifting Play title).

Local implementation has passed 40 unit tests and Next production build. Real API diagnostic failed with HTTP 429 `credit_balance_exhausted`. User must enable/fund API billing before functional verification and rollout.

Production changes so far:
- User saved OPENAI_API_KEY in Supabase secrets. Never retrieve/print it.
- Only check_translation_admin(text) SQL RPC applied; callable by service_role only.
- translate-workshop edge endpoint currently contains a temporary admin-password-protected diagnostic, NOT the local queue implementation. It translates only the fixed sample `Bu fotoğraf sana hangi anıyı hatırlatıyor?` via gpt-4.1-mini and does not read/write workshop records. Diagnostic request POST JSON {diagnostic:true,admin_key:<existing admin password>} with public apikey. No arbitrary translation proxy.
- No translation schema/queue migration applied; no existing text/photo data altered.

Remaining after credit is available:
1. Rerun fixed diagnostic; verify English and Korean output.
2. Review/test SQL translations.sql, apply once (triggers are not idempotent), verify permission/lease/concurrency/archive closure protections.
3. Replace deployed diagnostic with supabase/functions/translate-workshop/index.ts. Verify endpoint public key configuration matches existing gateway, without weakening existing auth.
4. Test worker behavior, failures, concurrency, language detection, local browser layout/drag after translations and screenshots; add isolated fixture route. Current worker has one in-flight request per gallery and pauses when hidden/closed; consider three bounded requests for workshop latency.
5. Check pre-existing items before translating; no test data in production. Backups include translation columns through existing select-all snapshot.
6. Commit/push to main only after actual integration verification; check GitHub deployment and live assets. Close test browser tabs.

Important: original text never waits for translation; no pending/error notices on participant UI. En/ko render in small muted text only when both complete. Photos never go to the translator. Menu language/heading/buttons otherwise untouched. This remains the GitHub Pages project, not Vercel or Sites.
