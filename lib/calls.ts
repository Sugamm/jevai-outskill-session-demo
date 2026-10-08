import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { ROOT } from "./config";
import type { Decision } from "./decision";
import { readJsonl } from "./jsonl";

/** Single-email calls are logged per page: runs/stress_<date>.jsonl, runs/confidence_<date>.jsonl. */
export const CALL_LOGS = ["stress", "confidence"] as const;
export type CallLog = (typeof CALL_LOGS)[number];

export const VOTES = ["jev_right", "llm_right", "both_right", "both_wrong"] as const;
export type Vote = (typeof VOTES)[number];
export type Tally = Record<Vote, number>;

const RUNS = path.join(ROOT, "runs");
const today = () => new Date().toISOString().slice(0, 10);
const logFile = (log: CallLog, date = today()) => path.join(RUNS, `${log}_${date}.jsonl`);

export interface CallRow {
  type: "call";
  call_id: string;
  at: string;
  host: string;
  text: string;
  source: string | null;
  jev: Decision;
  llm: Decision;
}
interface VoteRow {
  type: "vote";
  call_id: string;
  at: string;
  vote: Vote;
}

function append(log: CallLog, row: CallRow | VoteRow) {
  mkdirSync(RUNS, { recursive: true });
  appendFileSync(logFile(log), JSON.stringify(row) + "\n");
}

export function logCall(log: CallLog, row: Omit<CallRow, "type" | "at" | "host">) {
  append(log, { type: "call", at: new Date().toISOString(), host: hostname(), ...row });
}

export function logVote(call_id: string, vote: Vote) {
  append("stress", { type: "vote", call_id, at: new Date().toISOString(), vote });
}

/** Today's tally; a later vote on the same call replaces the earlier one. */
export function tally(date = today()): Tally {
  const latest = new Map<string, Vote>();
  for (const row of readJsonl<CallRow | VoteRow>(logFile("stress", date))) if (row.type === "vote") latest.set(row.call_id, row.vote);
  const t: Tally = { jev_right: 0, llm_right: 0, both_right: 0, both_wrong: 0 };
  for (const v of latest.values()) t[v]++;
  return t;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

/** Most recent logged call for this exact text where both models answered, from any call log. */
export function findCachedCall(text: string): CallRow | null {
  if (!existsSync(RUNS)) return null;
  const target = normalize(text);
  const files = readdirSync(RUNS)
    .filter((f) => CALL_LOGS.some((log) => f.startsWith(`${log}_`)) && f.endsWith(".jsonl"))
    .sort()
    .reverse();
  for (const f of files) {
    const rows = readJsonl<CallRow | VoteRow>(path.join(RUNS, f)).filter((r): r is CallRow => r.type === "call");
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (normalize(r.text) === target && !r.jev.error && !r.llm.error) return r;
    }
  }
  return null;
}
