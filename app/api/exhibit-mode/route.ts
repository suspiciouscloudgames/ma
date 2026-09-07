import { put } from "@vercel/blob";
import { currentExhibitStateRecord } from "@/app/server/public-write";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await currentExhibitStateRecord(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { displayMode?: "none" | "photos" | "play"; questionsEnabled?: boolean; locale?: "ko" | "ja"; adminKey?: string };
  const validDisplay = body.displayMode === undefined || ["none", "photos", "play"].includes(body.displayMode);
  const validQuestions = body.questionsEnabled === undefined || typeof body.questionsEnabled === "boolean";
  const validLocale = body.locale === undefined || body.locale === "ko" || body.locale === "ja";
  if (!validDisplay || !validQuestions || !validLocale || (body.displayMode === undefined && body.questionsEnabled === undefined && body.locale === undefined)) {
    return Response.json({ error: "invalid mode" }, { status: 400 });
  }
  if (!process.env.ADMIN_EDIT_KEY || body.adminKey !== process.env.ADMIN_EDIT_KEY) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const current = await currentExhibitStateRecord();
  const next = {
    displayMode: body.displayMode ?? current.displayMode,
    questionsEnabled: body.questionsEnabled ?? current.questionsEnabled,
    locale: body.locale ?? current.locale,
  };
  const version = Math.max(Date.now(), current.version + 1);
  const stored = JSON.stringify({ ...next, version });
  await put("settings/exhibit-mode-current.json", stored, {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
  await put(`settings/exhibit-modes/${version}-${crypto.randomUUID()}.json`, stored, {
    access: "public", addRandomSuffix: false, contentType: "application/json",
  });
  // Do not prune here. Blob listings are eventually consistent, so deleting
  // snapshots immediately after a write can race with concurrent display
  // changes and remove the state that was just selected. These tiny records
  // are deliberately retained; any maintenance cleanup must run outside a
  // live mode-change request.
  return Response.json({ ...next, version });
}
