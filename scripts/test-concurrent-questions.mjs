const baseUrl = process.argv[2];
const participants = Number(process.argv[3] ?? 20);
const adminKey = process.argv[4];
if (!baseUrl || !adminKey || !Number.isInteger(participants)) {
  throw new Error("Usage: node scripts/test-concurrent-questions.mjs <base-url> <participants> <admin-key>");
}

const startedAt = Date.now();
const results = await Promise.all(Array.from({ length: participants }, async (_, index) => {
  const response = await fetch(`${baseUrl}/api/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `health-check-${index}-${crypto.randomUUID()}`, participantId: crypto.randomUUID(), submissionId: crypto.randomUUID() }),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, id: data.question?.id };
}));

for (const result of results) if (result.id) {
  const response = await fetch(`${baseUrl}/api/questions`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: result.id, adminKey }),
  });
  if (!response.ok) throw new Error(`Cleanup failed for ${result.id}: ${response.status}`);
}

const statuses = Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length]));
console.log(JSON.stringify({ participants, statuses, elapsedMs: Date.now() - startedAt, cleaned: results.filter((result) => result.id).length }));
