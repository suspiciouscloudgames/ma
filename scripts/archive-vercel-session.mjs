import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { del, list } from "@vercel/blob";

const target = process.argv[2];
if (!target) throw new Error("Usage: node scripts/archive-vercel-session.mjs <backup-folder>");

const prefixes = [
  "photos/",
  "thumbnails/",
  "questions/",
  "question-responses/",
  "associations/",
  "paths/",
  "settings/gallery-order.json",
  "settings/gallery-layout.json",
  "settings/gallery-layouts/",
  "settings/question-layout.json",
  "settings/question-layouts/",
  "settings/response-layouts/",
];

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

const listed = (await Promise.all(prefixes.map(listAll))).flat();
const blobs = [...new Map(listed.map((blob) => [blob.pathname, blob])).values()];
await mkdir(target, { recursive: false });

const records = [];
for (const blob of blobs) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${blob.pathname}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = join("data", blob.pathname);
  await mkdir(join(target, dirname(file)), { recursive: true });
  await writeFile(join(target, file), bytes, { flag: "wx" });
  records.push({
    key: blob.pathname,
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    uploadedAt: blob.uploadedAt.toISOString(),
  });
}

const counts = Object.fromEntries(prefixes.map((prefix) => [prefix, blobs.filter((blob) => blob.pathname.startsWith(prefix)).length]));
const manifest = { count: records.length, downloadedAt: new Date().toISOString(), prefixes, counts, files: records };
await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });

for (const record of records) {
  const bytes = await readFile(join(target, record.file));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== record.bytes || digest !== record.sha256) throw new Error(`Verification failed: ${record.key}`);
}

for (let index = 0; index < blobs.length; index += 100) {
  await del(blobs.slice(index, index + 100).map((blob) => blob.pathname));
}

const remaining = (await Promise.all(prefixes.map(listAll))).flat();
if (remaining.length) throw new Error(`Cloud deletion verification failed: ${remaining.length} files remain`);
console.log(JSON.stringify({ backup: target, downloaded: records.length, verified: records.length, deleted: blobs.length, remaining: 0, counts }));
