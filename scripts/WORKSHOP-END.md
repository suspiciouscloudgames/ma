# Administrator workshop shutdown

The GitHub Pages gallery has a small power symbol (⏻). Each use requires a
fresh administrator password, independently of the other controls' saved login.
Use desktop Chrome and choose a local folder. Folder access must be granted by
the operator; a web page cannot silently choose an arbitrary computer folder.

The password check closes new submissions. Cancelling after this point preserves
cloud data but leaves submissions paused. The normal display/question controls
can reopen the next workshop.

The archive contains the complete Play of Traces PNG and SVG, every photo and
thumbnail, questions, answers, saved coordinates, state, a SHA-256 manifest, and
(only after cleanup verification) completed.json. Every saved file is read back
and verified before cloud finalization. PNGs larger than safe canvas dimensions
are reduced without cropping; the SVG retains full detail.

Apply supabase/workshop-end.sql before deploying the client. It installs upload
guards and password-protected begin/finalize RPCs. Finalization compares every
database row and storage object under table locks before deleting database rows.
Storage files are then removed through the Storage API and emptiness is checked.
An interrupted cleanup can be retried; keep the FIRST complete backup even if a
later attempt archives fewer remaining items. No cloud-only rollback is promised.

Verification: pnpm test. The local fixture supports MA_ARCHIVE_TEST=1 and
/__test/archive-check for full-page rendering and actual File System Access
write/readback tests with simulated cloud finalization only. Production data is
never used by that fixture. A browser-private filesystem test also exercises the
same writer when the native folder picker cannot be operated.
