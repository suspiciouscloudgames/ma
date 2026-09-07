import { del, list, put } from "@vercel/blob";
import { recordExists, requestIsReasonable, withinRateLimit } from "@/app/server/public-write";

export const dynamic = "force-dynamic";

const PREFIX = "question-responses/";
const LAYOUT_PREFIX = "settings/response-layouts/";
type QuestionResponse = { id: string; questionId: string; text: string; photoKey: string; createdAt: string };
type Position = { x: number; y: number; z: number };

async function readResponse(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return (await response.json()) as QuestionResponse;
  } catch { /* Retry a transient Blob read once. */ }
  return null;
}

async function readLayout() {
  const result = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const blob = result.blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
  if (!blob) return {} as Record<string, Position>;
  try { return (await (await fetch(blob.url, { cache: "no-store" })).json()) as Record<string, Position>; }
  catch { return {} as Record<string, Position>; }
}

async function pruneLayouts() {
  const snapshots = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const old = snapshots.blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(20);
  if (old.length) await del(old.map((blob) => blob.pathname));
}

export async function GET() {
  const [result, layout] = await Promise.all([list({ prefix: PREFIX, limit: 1000 }), readLayout()]);
  const responses = (await Promise.all(result.blobs.map((blob) => readResponse(blob.url))))
    .filter((item): item is QuestionResponse => Boolean(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Response.json({ responses, layout }, { headers: { "Cache-Control": "no-store" } });
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
  await pruneLayouts();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: string; adminKey?: string };
  const id = body.id?.trim();
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!id) return Response.json({ error: "invalid response" }, { status: 400 });
  await del(`${PREFIX}${id}.json`);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!requestIsReasonable(request)) return Response.json({ error: "request too large" }, { status: 413 });
  const body = (await request.json()) as { questionId?: string; text?: string; photoKey?: string; participantId?: string; submissionId?: string };
  if (!await withinRateLimit(request, "responses", body.participantId, 8)) return Response.json({ error: "too many requests" }, { status: 429 });
  const questionId = body.questionId?.trim();
  const text = body.text?.trim();
  const photoKey = body.photoKey?.trim();
  const id = body.submissionId?.trim();
  if (!questionId || !text || text.length > 50_000 || !photoKey?.startsWith("photos/") || !id || !/^[a-f0-9-]{36}$/i.test(id)) {
    return Response.json({ error: "invalid response" }, { status: 400 });
  }
  const [questionExists, photoExists] = await Promise.all([
    recordExists(`questions/${questionId}.json`), recordExists(photoKey),
  ]);
  if (!questionExists || !photoExists) return Response.json({ error: "reference not found" }, { status: 404 });
  const existing = await list({ prefix: `${PREFIX}${id}.json`, limit: 1 });
  const existingBlob = existing.blobs.find((blob) => blob.pathname === `${PREFIX}${id}.json`);
  if (existingBlob) {
    const stored = await readResponse(existingBlob.url);
    if (stored) return Response.json({ response: stored, duplicate: true });
  }
  const response: QuestionResponse = { id, questionId, text, photoKey, createdAt: new Date().toISOString() };
  await put(`${PREFIX}${id}.json`, JSON.stringify(response), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
  return Response.json({ response });
}
