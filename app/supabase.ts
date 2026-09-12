import { createClient } from "@supabase/supabase-js";

const timedFetch: typeof fetch = async (input,init) => {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  const cancel=()=>controller.abort();init?.signal?.addEventListener('abort',cancel,{once:true});
  if(init?.signal?.aborted)controller.abort();
  try{return await fetch(input,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);init?.signal?.removeEventListener('abort',cancel);}
};

export const supabase = createClient(
  "https://lhpfrkumzpinzgkkmgmd.supabase.co",
  "sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL",
  { auth: { persistSession: false }, global:{fetch:timedFetch}, realtime: { params: { eventsPerSecond: 20 } } },
);

export const adminStorage = (adminKey: string) => createClient(
  "https://lhpfrkumzpinzgkkmgmd.supabase.co",
  "sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL",
  { auth: { persistSession: false }, global: { fetch:timedFetch, headers: { "x-admin-key": adminKey } } },
);

export type ExhibitState = {
  id: boolean;
  display_mode: "none" | "photos" | "play";
  questions_enabled: boolean;
  locale: "ko" | "en";
  version: number;
};

export const publicPhotoUrl = (path: string) =>
  supabase.storage.from("workshop-photos").getPublicUrl(path).data.publicUrl;

let latestState: ExhibitState | undefined;
export async function readState() {
  const { data, error } = await supabase.from("exhibit_state").select("*").single();
  if (error) throw error;
  if(!latestState || data.version >= latestState.version) latestState=data as ExhibitState;
  return latestState;
}

export function subscribeTables(onChange: () => void | Promise<void>, names: string[]) {
  let stopped=false,running=false,again=false;
  const refresh=async()=>{if(stopped)return;if(running){again=true;return;}running=true;try{do{again=false;try{await onChange();}catch{} }while(again&&!stopped);}finally{running=false;}};
  const resume=()=>{if(document.visibilityState==='visible')void refresh();};
  const channel = supabase.channel(`live-${crypto.randomUUID()}`);
  names.forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh));
  channel.subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  const timer=setInterval(refresh,15000);void refresh();
  return () => { stopped=true;clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);void supabase.removeChannel(channel); };
}
