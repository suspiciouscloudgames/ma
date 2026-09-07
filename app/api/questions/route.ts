import { del, list, put } from "@vercel/blob";
import { requestIsReasonable, withinRateLimit } from "@/app/server/public-write";

export const dynamic = "force-dynamic";

const PREFIX = "questions/";
const LAYOUT_PATH = "settings/question-layout.json";
const LAYOUT_PREFIX = "settings/question-layouts/";
type Position = { x: number; y: number; z: number };
type Question = { id: string; text: string; createdAt: string };

async function readQuestion(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return (await response.json()) as Question;
  } catch { /* Retry a transient Blob read once. */ }
  return null;
}

async function readLayout() {
  const snapshots = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const latest = snapshots.blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
  const legacy = latest ? null : await list({ prefix: LAYOUT_PATH, limit: 1 });
  const blob = latest ?? legacy?.blobs.find((item) => item.pathname === LAYOUT_PATH);
  if (!blob) return {} as Record<string, Position>;
  try {
    return (await (await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, { cache: "no-store" })).json()) as Record<string, Position>;
  } catch {
    return {} as Record<string, Position>;
  }
}

export async function GET() {
  const [result, layout] = await Promise.all([list({ prefix: PREFIX, limit: 1000 }), readLayout()]);
  const questions = (await Promise.all(result.blobs.map((blob) => readQuestion(blob.url))))
    .filter((item): item is Question => Boolean(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Response.json({ questions, layout }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!requestIsReasonable(request)) return Response.json({ error: "request too large" }, { status: 413 });
  const body = (await request.json()) as { text?: string; participantId?: string; submissionId?: string };
  if (!await withinRateLimit(request, "questions", body.participantId, 6)) return Response.json({ error: "too many requests" }, { status: 429 });
  const text = body.text?.trim();
  const id = body.submissionId?.trim();
  if (!text || text.length > 50_000 || !id || !/^[a-f0-9-]{36}$/i.test(id)) return Response.json({ error: "question required" }, { status: 400 });
  const existing = await list({ prefix: `${PREFIX}${id}.json`, limit: 1 });
  const existingBlob = existing.blobs.find((blob) => blob.pathname === `${PREFIX}${id}.json`);
  if (existingBlob) {
    const question = await readQuestion(existingBlob.url);
    if (question) return Response.json({ question, duplicate: true });
  }
  const question: Question = { id, text, createdAt: new Date().toISOString() };
  await put(`${PREFIX}${id}.json`, JSON.stringify(question), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
  return Response.json({ question });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { layoutPatch?: Record<string, Position>; adminKey?: string };
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const patch = body.layoutPatch;
  if (!patch || !Object.values(patch).every((item) => [item.x, item.y, item.z].every(Number.isFinite))) {
    return Response.json({ error: "invalid layout" }, { status: 400 });
  }
  const layout = { ...await readLayout(), ...patch };
  await put(`${LAYOUT_PREFIX}${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify(layout), {
    access: "public", addRandomSuffix: false, contentType: "application/json",
  });
  const snapshots = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const old = snapshots.blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(20);
  if (old.length) await del(old.map((blob) => blob.pathname));
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: string; adminKey?: string };
  const id = body.id?.trim();
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!id) return Response.json({ error: "invalid question" }, { status: 400 });
  const responseBlobs = await list({ prefix: "question-responses/", limit: 1000 });
  const linkedPaths = (await Promise.all(responseBlobs.blobs.map(async (blob) => {
    try {
      const data = (await (await fetch(blob.url, { cache: "no-store" })).json()) as { questionId?: string };
      return data.questionId === id ? blob.pathname : null;
    } catch { return null; }
  }))).filter((item): item is string => Boolean(item));
  await Promise.all([del(`${PREFIX}${id}.json`), ...linkedPaths.map((pathname) => del(pathname))]);
  return Response.json({ ok: true, deletedResponses: linkedPaths.length });
}
