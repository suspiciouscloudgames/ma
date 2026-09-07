import { get, list, put } from "@vercel/blob";

export type ExhibitState = { displayMode: "none" | "photos" | "play"; questionsEnabled: boolean; locale: "ko" | "ja" };
export type VersionedExhibitState = ExhibitState & { version: number };

let lastKnownExhibitState: VersionedExhibitState | null = null;

function normalizedExhibitState(data: Partial<ExhibitState> & { mode?: string }, version: number): VersionedExhibitState {
  if (["none", "photos", "play"].includes(data.displayMode ?? "")) {
    return { displayMode: data.displayMode!, questionsEnabled: data.questionsEnabled === true, locale: data.locale === "ko" ? "ko" : "ja", version };
  }
  return {
    displayMode: data.mode === "photos" || data.mode === "play" ? data.mode : "none",
    questionsEnabled: data.mode === "questions",
    locale: data.locale === "ko" ? "ko" : "ja",
    version,
  };
}

export function requestIsReasonable(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  return !Number.isFinite(length) || length <= 100_000;
}

export async function currentExhibitStateRecord(): Promise<VersionedExhibitState> {
  const currentPath = "settings/exhibit-mode-current.json";
  try {
    const current = await get(currentPath, { access: "public", useCache: false });
    if (current?.statusCode === 200) {
      const data = (await new Response(current.stream).json()) as Partial<ExhibitState> & { mode?: string; version?: number };
      const state = normalizedExhibitState(data, Number(data.version) || current.blob.uploadedAt.getTime());
      lastKnownExhibitState = state;
      return state;
    }
  } catch {
    // Fall through to snapshots while migrating older deployments.
  }
  const blobs = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "settings/exhibit-modes/", limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const versionOf = (pathname: string) => Number(pathname.split("/").pop()?.split("-")[0]) || 0;
  const sorted = blobs.sort((a, b) => versionOf(b.pathname) - versionOf(a.pathname));
  const legacyPath = "settings/exhibit-mode.json";
  const legacy = sorted.length ? null : await list({ prefix: legacyPath, limit: 1 });
  const candidates = sorted.length ? sorted.slice(0, 5) : legacy?.blobs.filter((item) => item.pathname === legacyPath) ?? [];
  if (!candidates.length) return lastKnownExhibitState ?? { displayMode: "none", questionsEnabled: false, locale: "ja", version: 0 };
  for (const blob of candidates) try {
    const version = sorted.length ? versionOf(blob.pathname) : blob.uploadedAt.getTime();
    const response = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, { cache: "no-store" });
    if (!response.ok) continue;
    const data = (await response.json()) as Partial<ExhibitState> & { mode?: string };
    const state = normalizedExhibitState(data, version);
    lastKnownExhibitState = state;
    return state;
  } catch { continue; }
  return lastKnownExhibitState ?? { displayMode: "none", questionsEnabled: false, locale: "ja", version: 0 };
}

export async function currentExhibitState(): Promise<ExhibitState> {
  const { version: _version, ...state } = await currentExhibitStateRecord();
  void _version;
  return state;
}

export async function recordExists(pathname: string) {
  const result = await list({ prefix: pathname, limit: 1 });
  return result.blobs.some((item) => item.pathname === pathname);
}

export async function withinRateLimit(request: Request, action: string, participant: string | undefined, maximum = 8) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const validParticipant = participant && /^[a-f0-9-]{36}$/i.test(participant) ? participant : null;
  const identity = validParticipant ? `participant:${validParticipant}` : `ip:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
  const secret = process.env.ADMIN_EDIT_KEY || "public-gallery";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${identity}`));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  const minute = Math.floor(Date.now() / 60_000);
  const pathname = `rate-limits/${action}/${minute}-${key}.json`;
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === pathname);
  let count = 0;
  if (blob) {
    try { count = Number((await (await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, { cache: "no-store" })).json() as { count?: number }).count ?? 0); }
    catch { count = maximum; }
  }
  if (count >= maximum) return false;
  await put(pathname, JSON.stringify({ count: count + 1 }), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
  return true;
}
