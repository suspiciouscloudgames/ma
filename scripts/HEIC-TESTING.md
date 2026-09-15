# HEIC / Live Photo still-image processing

Live Photos are uploaded as a still JPEG, not as a motion/video asset.
The browser's native image decoder is tried first (Safari 17+ supports HEIC).
If native decoding fails and HEIF is detected by MIME, extension, or file header,
heic-to 1.5.2 (libheif 1.22.2) is loaded on demand. No external conversion service
receives the participant's photo. Conversion is serialized and cached per File;
canvas backing buffers are released after encoding.

The queue persists compressed JPEG and thumbnail blobs before uploading, not
the large original. A failed conversion or local save leaves the form's File in
memory for retry. Closing the page before that save finishes can still lose the
unsubmitted selection. Previously queued original files are migrated on retry.

## Automated regression tests

Run `pnpm test:workshop`. Includes native-first decoding, missing HEIF metadata,
48 MP dimension reduction (mock decoder), serial/cached conversion, corrupt-file
retry, compressed persistence, quota failure, legacy queued photos, lost
acknowledgement, and duplicate prevention. Unit tests do not emulate iOS.

## Real browser test (local only)

Download the public sample from
https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic
to a temporary local file. Run:

```
MA_HEIC_SAMPLE=/absolute/path/example.heic node scripts/workshop-fixture-server.mjs
```

Open http://127.0.0.1:4277/__test/heic-check and click Run HEIC tests.
The harness bundles the actual application processing and outbox modules and
replaces the Supabase origin with localhost. No production data is written.
It checks HEIC with/without type and extension, native JPEG with HEIC label,
corrupt input, compressed IndexedDB storage, upload failure and lost-ack retry.

Chrome result on 2026-09-15: PASS. HEIC 718114 bytes -> JPEG 353655 bytes,
thumbnail 69558 bytes, 1280x854. This is a public HEIC sample, NOT the affected
participant's Live Photo. Physical iPhone photo-picker/iCloud behavior and the
participant's original file have not been verified.

Sources:
- https://webkit.org/blog/14445/webkit-features-in-safari-17-0/
- https://github.com/hoppergee/heic-to

heic-to is LGPL-3.0; its unmodified source and license are available in the npm
package and upstream repository. A license copy is served under
`/ma/licenses/heic-to-LGPL-3.0.txt`.
