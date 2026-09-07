import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps workshop uploads displayable and lightweight", async () => {
  const [processor, uploadRoute, photosRoute, gallery, respond] = await Promise.all([
    source("app/photo-processing.ts"), source("app/api/upload/route.ts"), source("app/api/photos/route.ts"),
    source("app/gallery/page.tsx"), source("app/respond/page.tsx"),
  ]);
  assert.match(processor, /heic2any/);
  assert.match(processor, /2200/);
  assert.match(processor, /\.82/);
  assert.match(processor, /640/);
  assert.match(uploadRoute, /allowedContentTypes:\s*\["image\/jpeg"\]/);
  assert.match(uploadRoute, /thumbnails\//);
  assert.match(photosRoute, /thumbnailUrl/);
  assert.match(gallery, /loading="lazy"/);
  assert.match(respond, /photo\.thumbnailUrl/);
});

test("protects destructive photo operations", async () => {
  const route = await source("app/api/photos/route.ts");
  const checks = route.match(/body\.adminKey !== process\.env\.ADMIN_EDIT_KEY/g) ?? [];
  assert.ok(checks.length >= 2, "PATCH and DELETE must both require the admin key");
  assert.match(route, /await del\(\[key, thumbnailKey\]\)/);
});

test("separates shared-Wi-Fi participants and makes submissions idempotent", async () => {
  const [participant, questions, responses, retry] = await Promise.all([
    source("app/participant-id.ts"), source("app/api/questions/route.ts"),
    source("app/api/question-responses/route.ts"), source("app/retry-fetch.ts"),
  ]);
  assert.match(participant, /crypto\.randomUUID/);
  assert.match(participant, /catch/);
  assert.match(questions, /participantId/);
  assert.match(questions, /submissionId/);
  assert.match(responses, /participantId/);
  assert.match(responses, /submissionId/);
  assert.doesNotMatch(questions, /questions closed/);
  assert.doesNotMatch(responses, /responses closed/);
  assert.match(retry, /attempt < 2/);
});

test("uses an in-app QR and preserves Korean-only workshop mode", async () => {
  const [gallery, flags] = await Promise.all([source("app/gallery/page.tsx"), source("app/exhibit-features.ts")]);
  assert.match(gallery, /QRCodeSVG/);
  assert.doesNotMatch(gallery, /api\.qrserver\.com/);
  assert.match(flags, /JAPANESE_LOCALE_ENABLED = false/);
});

test("does not prune exhibit state inside a live mode change", async () => {
  const [route, state] = await Promise.all([
    source("app/api/exhibit-mode/route.ts"), source("app/server/public-write.ts"),
  ]);
  assert.doesNotMatch(route, /await del/);
  assert.doesNotMatch(route, /snapshots\.sort/);
  assert.match(route, /settings\/exhibit-mode-current\.json/);
  assert.match(state, /get\(currentPath, \{ access: "public", useCache: false \}\)/);
});
