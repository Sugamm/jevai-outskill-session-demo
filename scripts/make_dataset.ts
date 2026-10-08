/**
 * Generate data/emails.jsonl: 500 synthetic support emails (60% easy, 30% medium, 10% hard)
 * with proposed gold labels marked `reviewed: false` for hand review in scripts/review.ts.
 *
 *   npx tsx scripts/make_dataset.ts [--force]
 *
 * Uses `dataset_generator_model` from config/llm.yaml, deliberately a different model
 * family from the evaluated LLM.
 */
import { existsSync } from "node:fs";
import OpenAI from "openai";
import { llmConfig, requireEnv, taskConfig } from "../lib/config";
import { type Email, readJsonl, writeJsonl } from "../lib/jsonl";

const OUT = "data/emails.jsonl";
const task = taskConfig();
const labels = Object.keys(task.options);
const llm = llmConfig();

if (existsSync(OUT) && !process.argv.includes("--force")) {
  const reviewed = readJsonl<Email>(OUT).filter((e) => e.reviewed).length;
  console.error(`${OUT} already exists (${reviewed} reviewed). Re-run with --force to overwrite it.`);
  process.exit(1);
}

const HARD_TYPES: Record<string, string> = {
  sarcasm: "Sarcastic: the literal words sound positive but the meaning is negative (e.g. 'love that for me').",
  two_requests: "Two different requests in one email (e.g. a refund AND closing the account, or a complaint AND a refund).",
  hinglish: "Hinglish or mixed Hindi-English written in Latin script (e.g. 'paisa wapas karo', 'account band kar do').",
  arithmetic: "Needs simple arithmetic to understand, e.g. overcharges, partial refunds, price differences, quantities.",
  very_short: "Very short, 2 to 6 words, e.g. 'done with you guys', 'money back pls', 'still broken'.",
  polite_angry: "Extremely polite and formal on the surface but clearly furious underneath.",
};

interface Batch {
  difficulty: Email["difficulty"];
  count: number;
  gold?: string;
  hard_type?: string;
}

// Per bucket: 10% over-generation absorbs duplicates; rows are trimmed to the target after dedupe.
const TARGETS: { difficulty: Email["difficulty"]; gold?: string; hard_type?: string; target: number }[] = [
  ...labels.map((gold) => ({ difficulty: "easy" as const, gold, target: 100 })),
  ...labels.map((gold) => ({ difficulty: "medium" as const, gold, target: 50 })),
  ...Object.keys(HARD_TYPES).map((hard_type, i) => ({ difficulty: "hard" as const, hard_type, target: i < 2 ? 9 : 8 })),
];

const DIFFICULTY: Record<Email["difficulty"], string> = {
  easy: "Easy: the intent is stated plainly in 1 to 3 sentences. A new support agent would label it instantly.",
  medium:
    "Medium: 3 to 7 sentences with some noise (order details, backstory, mild emotion, typos). The intent is clear but not in the first sentence.",
  hard: "Hard: a careful human can still pick the right label, but a keyword matcher would get it wrong.",
};

const client = new OpenAI({ baseURL: llm.base_url, apiKey: requireEnv("OPENROUTER_API_KEY"), maxRetries: 2 });

function prompt(b: Batch): string {
  const options = Object.entries(task.options)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Write ${b.count} realistic, varied customer support emails sent to "KitchenKart", a fictional online appliance store
(blenders, toasters, fridges, washing machines, microwaves, air fryers, vacuum cleaners, kettles, mixers, ACs, plus the KitchenKart app and membership).

Every email must be entirely fictional: invent names and order numbers, never use real people, real emails, phone numbers or addresses.

The emails will be used to test a classifier with this question:
"${task.question}"
Options:
${options}

${DIFFICULTY[b.difficulty]}
${b.hard_type ? `Every email in this batch must be of this hard type: ${HARD_TYPES[b.hard_type]}\nSpread the correct labels across all three options.` : `The correct label for every email in this batch is: ${b.gold}.`}

Vary length, tone, writing style, products, customer background, and region (India, US, UK and elsewhere).
Do not start emails the same way. Do not mention the label names verbatim.
For each email, give the label a careful human reviewer would choose.`;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["emails"],
  properties: {
    emails: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "gold"],
        properties: { text: { type: "string" }, gold: { type: "string", enum: labels } },
      },
    },
  },
};

async function generate(b: Batch): Promise<{ text: string; gold: string }[]> {
  const res = await client.chat.completions.create({
    model: llm.dataset_generator_model,
    messages: [{ role: "user", content: prompt(b) }],
    response_format: { type: "json_schema", json_schema: { name: "emails", schema, strict: true } },
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  return (parsed.emails ?? []).filter((e: { text?: unknown; gold?: unknown }) => typeof e.text === "string" && labels.includes(e.gold as string));
}

const BATCH = 20;
const batches: (Batch & { key: string })[] = [];
for (const t of TARGETS) {
  let remaining = Math.ceil(t.target * 1.1);
  while (remaining > 0) {
    const count = Math.min(BATCH, remaining);
    batches.push({ ...t, count, key: `${t.difficulty}/${t.gold ?? t.hard_type}` });
    remaining -= count;
  }
}

const fixed = new Set(
  [...readJsonl<Email>("data/hard_cases.jsonl"), ...readJsonl<Email>("data/confidence_trio.jsonl")].map((e) => norm(e.text)),
);
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

console.log(`Generating with ${llm.dataset_generator_model}: ${batches.length} batches...`);
const results = new Map<string, Email[]>();
const seen = new Set(fixed);
let next = 0;
let done = 0;
async function worker() {
  while (next < batches.length) {
    const b = batches[next++];
    let rows: { text: string; gold: string }[] = [];
    for (let attempt = 1; attempt <= 3 && rows.length === 0; attempt++) {
      try {
        rows = await generate(b);
      } catch (e) {
        console.warn(`  batch ${b.key} attempt ${attempt} failed: ${(e as Error).message}`);
      }
    }
    const bucket = results.get(b.key) ?? [];
    for (const r of rows) {
      const k = norm(r.text);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      bucket.push({
        id: "",
        text: r.text.trim(),
        gold: r.gold,
        difficulty: b.difficulty,
        hard_type: b.hard_type ?? null,
        reviewed: false,
        generator_model: llm.dataset_generator_model,
      });
    }
    results.set(b.key, bucket);
    console.log(`  [${++done}/${batches.length}] ${b.key}: +${rows.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const all: Email[] = [];
let short = false;
for (const t of TARGETS) {
  const key = `${t.difficulty}/${t.gold ?? t.hard_type}`;
  const rows = (results.get(key) ?? []).slice(0, t.target);
  if (rows.length < t.target) {
    short = true;
    console.warn(`  ⚠️  ${key}: only ${rows.length}/${t.target} after dedupe`);
  }
  all.push(...rows);
}

// Deterministic shuffle so ids don't reveal difficulty or label.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [all[i], all[j]] = [all[j], all[i]];
}
all.forEach((e, i) => (e.id = `e${String(i + 1).padStart(3, "0")}`));
writeJsonl(OUT, all);

const count = (f: (e: Email) => boolean) => all.filter(f).length;
console.log(`\nWrote ${all.length} emails to ${OUT}${short ? " (short of 500, re-run with --force)" : ""}`);
console.log(`  difficulty: easy ${count((e) => e.difficulty === "easy")}, medium ${count((e) => e.difficulty === "medium")}, hard ${count((e) => e.difficulty === "hard")}`);
console.log(`  gold: ${labels.map((l) => `${l} ${count((e) => e.gold === l)}`).join(", ")}`);
console.log(`Next: npx tsx scripts/review.ts`);
