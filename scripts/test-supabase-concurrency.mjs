const url = "https://lhpfrkumzpinzgkkmgmd.supabase.co";
const key = "sb_publishable__YJW6ZRNOjK8z7CuJ-0OOA_GyUzRWLL";
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const count = Number(process.env.PARTICIPANTS ?? 20);
const participants = Array.from({ length: count }, () => crypto.randomUUID());
const started = Date.now();
const writes = await Promise.all(participants.map(async (participant_id, index) => {
  const response = await fetch(`${url}/rest/v1/questions`, { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ text: `load-test-${Date.now()}-${index}`, participant_id }) });
  return { ok: response.ok, status: response.status, body: await response.json() };
}));
const ids = writes.flatMap((item) => item.ok ? item.body.map((row) => row.id) : []);
const reads = await Promise.all(Array.from({ length: 80 }, () => fetch(`${url}/rest/v1/exhibit_state?select=*`, { headers }).then((r) => r.ok)));
const cleanup = await Promise.all(ids.map((item_id) => fetch(`${url}/rest/v1/rpc/admin_delete_item`, { method: "POST", headers, body: JSON.stringify({ admin_key: "0000", item_kind: "question", item_id }) }).then((r) => r.ok)));
const reset = await fetch(`${url}/rest/v1/rpc/admin_set_state`, { method: "POST", headers, body: JSON.stringify({ admin_key: "0000", next_display_mode: "none", next_questions_enabled: false, next_locale: "ko" }) });
console.log(JSON.stringify({ questionWrites: `${writes.filter(v=>v.ok).length}/${count}`, readRequests: `${reads.filter(Boolean).length}/80`, cleanup: `${cleanup.filter(Boolean).length}/${ids.length}`, reset: reset.ok, elapsedMs: Date.now()-started }, null, 2));
if (writes.some(v=>!v.ok) || reads.some(v=>!v) || cleanup.some(v=>!v) || !reset.ok) process.exitCode = 1;
