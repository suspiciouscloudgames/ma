import { list, put } from "@vercel/blob";

export const dynamic = "force-dynamic";
const PATH = "settings/path-mode.json";

async function readMode() {
  const result = await list({ prefix: PATH, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === PATH);
  if (!blob) return false;
  try {
    const response = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, { cache: "no-store" });
    return ((await response.json()) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

export async function GET() {
  return Response.json({ enabled: await readMode() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { enabled?: boolean; adminKey?: string };
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (typeof body.enabled !== "boolean") return Response.json({ error: "invalid mode" }, { status: 400 });
  await put(PATH, JSON.stringify({ enabled: body.enabled }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return Response.json({ enabled: body.enabled });
}
