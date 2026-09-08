import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://lhpfrkumzpinzgkkmgmd.supabase.co",
  "sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL",
  { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } },
);

export const adminStorage = (adminKey: string) => createClient(
  "https://lhpfrkumzpinzgkkmgmd.supabase.co",
  "sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL",
  { auth: { persistSession: false }, global: { headers: { "x-admin-key": adminKey } } },
);

export type ExhibitState = {
  id: boolean;
  display_mode: "none" | "photos" | "play";
  questions_enabled: boolean;
  locale: "ko" | "ja";
  version: number;
};

export const publicPhotoUrl = (path: string) =>
  supabase.storage.from("workshop-photos").getPublicUrl(path).data.publicUrl;

export async function readState() {
  const { data, error } = await supabase.from("exhibit_state").select("*").single();
  if (error) throw error;
  return data as ExhibitState;
}

export function subscribeTables(onChange: () => void, names: string[]) {
  const channel = supabase.channel(`live-${crypto.randomUUID()}`);
  names.forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange));
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
