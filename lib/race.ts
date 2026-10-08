import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { llmConfig, pricingConfig, ROOT, runConfig, taskConfig } from "./config";
import type { Decision } from "./decision";
import { type Email, readJsonl } from "./jsonl";
import * as jev from "./models/jev";
import * as llm from "./models/llm";
import { type RaceSummary, summarizeRace } from "./stats";

export type Side = "jev" | "llm";
export const SIDES: Side[] = ["jev", "llm"];
export type PublicDecision = Omit<Decision, "request" | "raw">;

export interface RaceMeta {
  started_at: string;
  host: string;
  concurrency: number;
  n: number;
  models: Record<Side, string>;
  options: string[];
  emails: Pick<Email, "id" | "text" | "gold" | "difficulty">[];
  reviewed: number;
  replay?: { file: string; recorded_at: string };
}

export type RaceEvent =
  | { type: "start"; t_ms: number; meta: RaceMeta }
  | { type: "result"; t_ms: number; side: Side; index: number; decision: PublicDecision }
  | { type: "side_done"; t_ms: number; side: Side }
  | { type: "done"; t_ms: number; file: string | null; summary: RaceSummary; aborted: boolean }
  | { type: "error"; t_ms: number; message: string };

export interface RaceRecord {
  version: 1;
  meta: RaceMeta;
  finished_at: string;
  aborted: boolean;
  config: { task: ReturnType<typeof taskConfig>; run: ReturnType<typeof runConfig>; llm: ReturnType<typeof llmConfig>; node: string };
  pricing: ReturnType<typeof pricingConfig>;
  summary: RaceSummary;
  /** Every event in order with its original timestamp, for replay. */
  events: RaceEvent[];
  /** Full Decisions including exact requests and raw responses, indexed like meta.emails. */
  decisions: Record<Side, (Decision | null)[]>;
}

const RUNS = path.join(ROOT, "runs");
const RUN_FILE = /^race_[\w-]+\.json$/;

export const toPublic = ({ request: _q, raw: _r, ...d }: Decision): PublicDecision => d;

export function loadEmails(limit?: number) {
  const all = readJsonl<Email>(path.join(ROOT, "data/emails.jsonl"));
  return { emails: limit ? all.slice(0, limit) : all, reviewed: all.filter((e) => e.reviewed).length };
}

let active = false;
export const raceIsRunning = () => active;

type Classify = (text: string, options: Record<string, string>, question: string) => Promise<Decision>;
const CLASSIFIERS: Record<Side, Classify> = { jev: jev.classify, llm: llm.classify };

/**
 * Run every email through both models at once. Each model gets its own pool of
 * `concurrency` workers (the equivalent of an asyncio.Semaphore of that size), both
 * pools start at the same instant and process emails in the same order.
 */
export async function runRace(opts: {
  concurrency: number;
  limit?: number;
  emit: (e: RaceEvent) => void;
  signal?: AbortSignal;
  classifiers?: Record<Side, Classify>;
}): Promise<RaceRecord> {
  if (active) throw new Error("A race is already running.");
  active = true;
  try {
    const task = taskConfig();
    const { emails, reviewed } = loadEmails(opts.limit);
    const classifiers = opts.classifiers ?? CLASSIFIERS;
    const events: RaceEvent[] = [];
    const t0 = performance.now();
    const now = () => Math.round(performance.now() - t0);
    const emit = (e: RaceEvent) => {
      events.push(e);
      opts.emit(e);
    };

    const meta: RaceMeta = {
      started_at: new Date().toISOString(),
      host: hostname(),
      concurrency: opts.concurrency,
      n: emails.length,
      models: { jev: jev.JEV_MODEL, llm: llmConfig().model },
      options: Object.keys(task.options),
      emails: emails.map(({ id, text, gold, difficulty }) => ({ id, text, gold, difficulty })),
      reviewed,
    };
    emit({ type: "start", t_ms: 0, meta });

    const decisions: Record<Side, (Decision | null)[]> = { jev: emails.map(() => null), llm: emails.map(() => null) };
    const wall: Record<Side, number> = { jev: 0, llm: 0 };

    const pool = async (side: Side) => {
      let next = 0;
      const worker = async () => {
        while (next < emails.length && !opts.signal?.aborted) {
          const index = next++;
          const d = await classifiers[side](emails[index].text, task.options, task.question);
          decisions[side][index] = d;
          emit({ type: "result", t_ms: now(), side, index, decision: toPublic(d) });
        }
      };
      await Promise.all(Array.from({ length: Math.min(opts.concurrency, emails.length) }, worker));
      wall[side] = now();
      emit({ type: "side_done", t_ms: wall[side], side });
    };
    await Promise.all(SIDES.map(pool));

    const aborted = !!opts.signal?.aborted;
    const gold = emails.map((e) => e.gold);
    const rows = (side: Side) => decisions[side].map((d) => d ?? { label: null, error: "not run (race aborted)", latency_ms: 0, cost_usd: 0 });
    const summary = summarizeRace(gold, rows("jev"), rows("llm"), wall);

    const stamp = meta.started_at.replace(/[:.]/g, "-");
    const file = `race_${stamp}${opts.limit ? `_n${emails.length}` : ""}.json`;
    const record: RaceRecord = {
      version: 1,
      meta,
      finished_at: new Date().toISOString(),
      aborted,
      config: { task, run: runConfig(), llm: llmConfig(), node: process.version },
      pricing: pricingConfig(),
      summary,
      events: [...events, { type: "done", t_ms: now(), file, summary, aborted }],
      decisions,
    };
    mkdirSync(RUNS, { recursive: true });
    writeFileSync(path.join(RUNS, file), JSON.stringify(record));
    opts.emit(record.events.at(-1)!);
    return record;
  } finally {
    active = false;
  }
}

export function listRaceRuns(): { file: string; started_at: string; n: number; aborted: boolean }[] {
  let files: string[] = [];
  try {
    files = readdirSync(RUNS).filter((f) => RUN_FILE.test(f));
  } catch {
    return [];
  }
  return files
    .map((file) => {
      try {
        const r = loadRaceRun(file);
        return { file, started_at: r.meta.started_at, n: r.meta.n, aborted: r.aborted };
      } catch {
        return null;
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Accepts `race_x.json` or `runs/race_x.json`; anything else is rejected. */
export function loadRaceRun(name: string): RaceRecord {
  const file = path.basename(name);
  if (!RUN_FILE.test(file)) throw new Error(`Not a race run file: ${name}`);
  return JSON.parse(readFileSync(path.join(RUNS, file), "utf8")) as RaceRecord;
}

/** Re-emit a saved run's events at their original offsets from the start. */
export async function* replayEvents(
  record: RaceRecord,
  file: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  clock: () => number = () => performance.now(),
): AsyncGenerator<RaceEvent> {
  const t0 = clock();
  for (const event of record.events) {
    const wait = event.t_ms - (clock() - t0);
    if (wait > 0) await sleep(wait);
    yield event.type === "start"
      ? { ...event, meta: { ...event.meta, replay: { file: path.basename(file), recorded_at: event.meta.started_at } } }
      : event;
  }
}
