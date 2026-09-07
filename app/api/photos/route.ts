import { del, list, put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const ORDER_PATH = "settings/gallery-order.json";
const LAYOUT_PATH = "settings/gallery-layout.json";
const LAYOUT_PREFIX = "settings/gallery-layouts/";
type Layout = Record<string, { x: number; y: number; z: number; v?: number }>;

async function readOrder() {
  const result = await list({ prefix: ORDER_PATH, limit: 1 });
  const orderBlob = result.blobs.find((blob) => blob.pathname === ORDER_PATH);
  if (!orderBlob) return [] as string[];

  try {
    const response = await fetch(`${orderBlob.url}?v=${orderBlob.uploadedAt.getTime()}`, { cache: "no-store" });
    return (await response.json()) as string[];
  } catch {
    return [] as string[];
  }
}

async function writeOrder(keys: string[]) {
  await put(ORDER_PATH, JSON.stringify(keys), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readLayout() {
  const snapshots = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const latestSnapshot = snapshots.blobs.sort(
    (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
  )[0];
  const legacy = latestSnapshot ? null : await list({ prefix: LAYOUT_PATH, limit: 1 });
  const blob = latestSnapshot ?? legacy?.blobs.find((item) => item.pathname === LAYOUT_PATH);
  if (!blob) return {} as Layout;
  try {
    const response = await fetch(blob.url, { cache: "no-store" });
    return (await response.json()) as Layout;
  } catch {
    return {} as Layout;
  }
}

async function writeLayout(layout: Layout) {
  await put(`${LAYOUT_PREFIX}${Date.now()}.json`, JSON.stringify(layout), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/json",
  });
  const snapshots = await list({ prefix: LAYOUT_PREFIX, limit: 1000 });
  const old = snapshots.blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(20);
  if (old.length) await del(old.map((blob) => blob.pathname));
}

export async function GET() {
  const [result, thumbnailResult] = await Promise.all([
    list({ prefix: "photos/", limit: 1000 }),
    list({ prefix: "thumbnails/", limit: 1000 }),
  ]);
  const [order, layout] = await Promise.all([readOrder(), readLayout()]);
  const thumbnails = new Map(thumbnailResult.blobs.map((blob) => [blob.pathname.replace(/^thumbnails\//, ""), blob.url]));
  const orderIndex = new Map(order.map((key, index) => [key, index]));
  const photos = result.blobs
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .sort((a, b) => {
      const aIndex = orderIndex.get(a.pathname);
      const bIndex = orderIndex.get(b.pathname);
      if (aIndex === undefined && bIndex === undefined) return 0;
      if (aIndex === undefined) return -1;
      if (bIndex === undefined) return 1;
      return aIndex - bIndex;
    })
    .map((blob) => ({
      key: blob.pathname,
      url: blob.url,
      thumbnailUrl: thumbnails.get(blob.pathname.replace(/^photos\//, "")) ?? blob.url,
      uploadedAt: blob.uploadedAt.toISOString(),
    }));

  return Response.json({ photos, layout }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { keys?: string[]; layout?: Layout; layoutPatch?: Layout; adminKey?: string };
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (body.layoutPatch) {
    const valid = Object.entries(body.layoutPatch).every(([key, position]) =>
      key.startsWith("photos/") && [position.x, position.y, position.z].every(Number.isFinite),
    );
    if (!valid) return Response.json({ error: "invalid layout" }, { status: 400 });
    const currentLayout = await readLayout();
    await writeLayout({ ...currentLayout, ...body.layoutPatch });
    return Response.json({ ok: true });
  }
  if (body.layout) {
    const valid = Object.entries(body.layout).every(([key, position]) =>
      key.startsWith("photos/") && [position.x, position.y, position.z].every(Number.isFinite),
    );
    if (!valid) return Response.json({ error: "invalid layout" }, { status: 400 });
    await writeLayout(body.layout);
    return Response.json({ ok: true });
  }
  if (!Array.isArray(body.keys) || body.keys.some((key) => !key.startsWith("photos/"))) {
    return Response.json({ error: "invalid order" }, { status: 400 });
  }
  await writeOrder([...new Set(body.keys)]);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { key?: string; adminKey?: string };
  const key = body.key;
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!key?.startsWith("photos/")) {
    return Response.json({ error: "invalid photo" }, { status: 400 });
  }
  const thumbnailKey = key.replace(/^photos\//, "thumbnails/");
  await del([key, thumbnailKey]);
  const [order, layout] = await Promise.all([readOrder(), readLayout()]);
  delete layout[key];
  await Promise.all([writeOrder(order.filter((item) => item !== key)), writeLayout(layout)]);
  return Response.json({ ok: true });
}
