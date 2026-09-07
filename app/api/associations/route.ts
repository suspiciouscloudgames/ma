import { list, put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const PREFIX = "associations/";

export type Association = {
  id: string;
  photoKey: string;
  text: string;
  keywords: string[];
  createdAt: string;
  editTokenHash?: string;
};

const STOP_WORDS = new Set([
  "그리고", "그러나", "하지만", "그래서", "나는", "내가", "우리", "이것", "저것", "그것",
  "있는", "없는", "하는", "했던", "같은", "대한", "위한", "에서", "으로", "에게", "한테",
]);
const PARTICLES = ["으로부터", "에게서", "에서는", "으로", "에서", "에게", "한테", "처럼", "보다", "까지", "부터", "이나", "거나", "라고", "하고", "과", "와", "을", "를", "이", "가", "은", "는", "의", "에", "도", "만"];

function extractKeywords(text: string) {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const particle = PARTICLES.find((ending) => word.length > ending.length + 1 && word.endsWith(ending));
      return particle ? word.slice(0, -particle.length) : word;
    })
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 10);
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicAssociation(association: Association) {
  const { editTokenHash: _editTokenHash, ...visible } = association;
  void _editTokenHash;
  return visible;
}

export async function GET() {
  const result = await list({ prefix: PREFIX, limit: 1000 });
  const associations = await Promise.all(
    result.blobs.map(async (blob) => {
      try {
        const response = await fetch(blob.url, { cache: "no-store" });
        return (await response.json()) as Association;
      } catch {
        return null;
      }
    }),
  );
  return Response.json(
    { associations: associations.filter((item): item is Association => Boolean(item)).map(publicAssociation) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as { photoKey?: string; text?: string };
  const photoKey = body.photoKey?.trim();
  const text = body.text?.trim();
  if (!photoKey?.startsWith("photos/") || !text || text.length > 300) {
    return Response.json({ error: "invalid association" }, { status: 400 });
  }

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const editToken = crypto.randomUUID() + crypto.randomUUID();
  const association: Association = {
    id,
    photoKey,
    text,
    keywords: extractKeywords(text),
    createdAt: new Date().toISOString(),
    editTokenHash: await hashToken(editToken),
  };
  await put(`${PREFIX}${id}.json`, JSON.stringify(association), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return Response.json({ association: publicAssociation(association), editToken });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; text?: string; editToken?: string; adminKey?: string };
  const id = body.id?.trim();
  const text = body.text?.trim();
  const editToken = body.editToken?.trim();
  const isAdmin = Boolean(process.env.ADMIN_EDIT_KEY) && body.adminKey === process.env.ADMIN_EDIT_KEY;
  if (!id || !text || text.length > 300 || (!editToken && !isAdmin)) {
    return Response.json({ error: "invalid edit" }, { status: 400 });
  }
  const pathname = `${PREFIX}${id}.json`;
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === pathname);
  if (!blob) return Response.json({ error: "not found" }, { status: 404 });

  const current = (await (await fetch(blob.url, { cache: "no-store" })).json()) as Association;
  if (!isAdmin) {
    if (!current.editTokenHash || current.editTokenHash !== await hashToken(editToken!)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }
  const updated: Association = { ...current, text, keywords: extractKeywords(text) };
  await put(pathname, JSON.stringify(updated), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return Response.json({ association: publicAssociation(updated) });
}
