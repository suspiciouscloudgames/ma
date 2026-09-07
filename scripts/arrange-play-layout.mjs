const baseUrl = process.argv[2];
const adminKey = process.argv[3];
if (!baseUrl || !adminKey) throw new Error("Usage: node scripts/arrange-play-layout.mjs <base-url> <admin-key>");

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return response.json();
}

const [{ questions }, { responses }] = await Promise.all([
  getJson("/api/questions"),
  getJson("/api/question-responses"),
]);

const questionLayout = {};
const responseLayout = {};
const answerColumns = [27, 51, 75];
const rowHeight = 430;
let groupTop = 50;
let z = 1;

for (const question of questions) {
  const linked = responses.filter((response) => response.questionId === question.id);
  const rows = Math.max(1, Math.ceil(linked.length / answerColumns.length));
  const answerAreaHeight = linked.length ? rows * rowHeight : 230;
  questionLayout[question.id] = {
    x: 3,
    y: groupTop + Math.max(35, (answerAreaHeight - 180) / 2),
    z: z++,
  };
  linked.forEach((response, index) => {
    responseLayout[response.id] = {
      x: answerColumns[index % answerColumns.length],
      y: groupTop + Math.floor(index / answerColumns.length) * rowHeight,
      z: z++,
    };
  });
  groupTop += answerAreaHeight + 150;
}

async function patch(path, layoutPatch) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layoutPatch, adminKey }),
  });
  if (!response.ok) throw new Error(`PATCH ${path} failed: ${response.status} ${await response.text()}`);
}

await Promise.all([
  patch("/api/questions", questionLayout),
  patch("/api/question-responses", responseLayout),
]);

console.log(JSON.stringify({ questions: questions.length, responses: responses.length, canvasHeight: groupTop }));
