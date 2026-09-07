import { list, put } from "@vercel/blob";

export const dynamic = "force-dynamic";
const PREFIX = "paths/";

export type PhotoPath = {
  id: string;
  ownerId: string;
  color: string;
  photoKeys: string[];
  createdAt: string;
};

type OwnedAssociation = { photoKey: string; editTokenHash?: string };

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pathModeEnabled() {
  const result = await list({ prefix: "settings/path-mode.json", limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === "settings/path-mode.json");
  if (!blob) return false;
  try {
    return ((await (await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, { cache: "no-store" })).json()) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

export async function GET() {
  const result = await list({ prefix: PREFIX, limit: 1000 });
  const paths = await Promise.all(result.blobs.map(async (blob) => {
    try {
      return (await (await fetch(blob.url, { cache: "no-store" })).json()) as PhotoPath;
    } catch {
      return null;
    }
  }));
  return Response.json(
    { paths: paths.filter((item): item is PhotoPath => Boolean(item)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as { ownerId?: string; color?: string; photoKeys?: string[]; associationId?: string; editToken?: string };
  const photoKeys = [...new Set(body.photoKeys ?? [])];
  if (
    !body.ownerId ||
    !/^#[0-9a-f]{6}$/i.test(body.color ?? "") ||
    photoKeys.length < 2 ||
    photoKeys.length > 30 ||
    photoKeys.some((key) => !key.startsWith("photos/")) ||
    !body.associationId ||
    !body.editToken
  ) {
    return Response.json({ error: "invalid path" }, { status: 400 });
  }
  if (!await pathModeEnabled()) return Response.json({ error: "path mode closed" }, { status: 403 });
  const associationPath = `associations/${body.associationId}.json`;
  const associationList = await list({ prefix: associationPath, limit: 1 });
  const associationBlob = associationList.blobs.find((item) => item.pathname === associationPath);
  if (!associationBlob) return Response.json({ error: "forbidden" }, { status: 403 });
  const association = (await (await fetch(associationBlob.url, { cache: "no-store" })).json()) as OwnedAssociation;
  if (!association.editTokenHash || association.editTokenHash !== await hashToken(body.editToken) || !photoKeys.includes(association.photoKey)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const path: PhotoPath = {
    id,
    ownerId: body.ownerId,
    color: body.color!,
    photoKeys,
    createdAt: new Date().toISOString(),
  };
  await put(`${PREFIX}${id}.json`, JSON.stringify(path), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return Response.json({ path });
}
