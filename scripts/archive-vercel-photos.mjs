import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { del, list } from "@vercel/blob";

const label = process.argv[2];
if (!label) throw new Error("Usage: node scripts/archive-vercel-photos.mjs <backup-folder>");

async function listAll(prefix) {
  const blobs = []; let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}
const [blobs, thumbnails] = await Promise.all([listAll("photos/"), listAll("thumbnails/")]);

await mkdir(label, { recursive: false });
const photos = [];
for (const blob of blobs) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${blob.pathname}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = basename(blob.pathname);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(label, file), bytes, { flag: "wx" });
  photos.push({ key: blob.pathname, file, bytes: bytes.length, sha256, uploadedAt: blob.uploadedAt.toISOString() });
}
const thumbnailRecords = [];
if (thumbnails.length) await mkdir(join(label, "thumbnails"));
for (const blob of thumbnails) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Thumbnail download failed (${response.status}): ${blob.pathname}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = basename(blob.pathname);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(label, "thumbnails", file), bytes, { flag: "wx" });
  thumbnailRecords.push({ key: blob.pathname, file: `thumbnails/${file}`, bytes: bytes.length, sha256, uploadedAt: blob.uploadedAt.toISOString() });
}

const manifest = { count: photos.length, thumbnailCount: thumbnailRecords.length, downloadedAt: new Date().toISOString(), photos, thumbnails: thumbnailRecords };
await writeFile(join(label, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });

for (const photo of photos) {
  const bytes = await readFile(join(label, photo.file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== photo.bytes || digest !== photo.sha256) throw new Error(`Verification failed: ${photo.key}`);
}
for (const thumbnail of thumbnailRecords) {
  const bytes = await readFile(join(label, thumbnail.file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== thumbnail.bytes || digest !== thumbnail.sha256) throw new Error(`Verification failed: ${thumbnail.key}`);
}

for (let index = 0; index < blobs.length; index += 100) {
  await del(blobs.slice(index, index + 100).map((blob) => blob.pathname));
}
for (let index = 0; index < thumbnails.length; index += 100) {
  await del(thumbnails.slice(index, index + 100).map((blob) => blob.pathname));
}

const remaining = await list({ prefix: "photos/", limit: 1 });
const remainingThumbnails = await list({ prefix: "thumbnails/", limit: 1 });
if (remaining.blobs.length || remaining.hasMore || remainingThumbnails.blobs.length || remainingThumbnails.hasMore) throw new Error("Cloud deletion verification failed: photos remain");
console.log(JSON.stringify({ backup: label, downloaded: photos.length, verified: photos.length, remaining: 0 }));
