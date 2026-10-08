/**
 * Hand-review gold labels, one keypress per email. Saves after every keypress.
 *
 *   npx tsx scripts/review.ts [file=data/emails.jsonl] [--all]
 *
 * Keys: Enter/y accept · 1/2/3 set label · s skip · b back · q quit
 */
import readline from "node:readline";
import { taskConfig } from "../lib/config";
import { type Email, readJsonl, writeJsonl } from "../lib/jsonl";

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "data/emails.jsonl";
const showAll = process.argv.includes("--all");
const labels = Object.keys(taskConfig().options);
const rows = readJsonl<Email>(file);
if (!rows.length) {
  console.error(`No rows in ${file}. Run scripts/make_dataset.ts first.`);
  process.exit(1);
}
const queue = rows.map((_, i) => i).filter((i) => showAll || !rows[i].reviewed);
if (!queue.length) {
  console.log(`All ${rows.length} rows in ${file} are reviewed. Use --all to revisit.`);
  process.exit(0);
}
if (!process.stdin.isTTY) {
  console.error("review.ts needs an interactive terminal.");
  process.exit(1);
}

const B = "\x1b[1m", D = "\x1b[2m", G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[0m";
let pos = 0;

function render() {
  const e = rows[queue[pos]];
  const reviewed = rows.filter((r) => r.reviewed).length;
  console.clear();
  console.log(`${D}${file} · ${queue.length - pos} left in this session · ${reviewed}/${rows.length} reviewed overall${R}\n`);
  console.log(`${B}${e.id}${R}  ${D}${e.difficulty}${e.hard_type ? ` · ${e.hard_type}` : ""}${e.reviewed ? " · already reviewed" : ""}${R}\n`);
  console.log(e.text.replace(/^/gm, "  "));
  if (e.note) console.log(`\n${D}note: ${e.note}${R}`);
  console.log(`\nGold label: ${Y}${B}${e.gold}${R}\n`);
  labels.forEach((l, i) => console.log(`  ${B}${i + 1}${R} ${l}${l === e.gold ? `${G} ← current${R}` : ""}`));
  console.log(`\n${D}Enter/y accept · 1-${labels.length} set label · s skip · b back · q quit${R}`);
}

function finish() {
  writeJsonl(file, rows);
  console.clear();
  console.log(`Saved ${file}: ${rows.filter((r) => r.reviewed).length}/${rows.length} reviewed.`);
  process.exit(0);
}

function advance() {
  if (++pos >= queue.length) finish();
  render();
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
  const e = rows[queue[pos]];
  if (key.ctrl && key.name === "c") finish();
  if (key.name === "q") finish();
  if (key.name === "return" || key.name === "y") {
    e.reviewed = true;
    writeJsonl(file, rows);
    return advance();
  }
  const n = Number(str);
  if (Number.isInteger(n) && n >= 1 && n <= labels.length) {
    e.gold = labels[n - 1];
    e.reviewed = true;
    writeJsonl(file, rows);
    return advance();
  }
  if (key.name === "s") return advance();
  if (key.name === "b" && pos > 0) {
    pos--;
    render();
  }
});
render();
