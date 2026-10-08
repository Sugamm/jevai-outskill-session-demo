import { costPerMillionDecisions } from "./cost";

/** Nearest-rank percentile; `p` in [0, 100]. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface Row {
  label: string | null;
  error: string | null;
  latency_ms: number;
  cost_usd: number;
}

export interface SideSummary {
  n: number;
  answered: number;
  errors: number;
  correct: number;
  /** Errors count as wrong answers. */
  accuracy: number;
  median_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost_usd: number;
  cost_per_million_usd: number;
  wall_ms: number;
}

/** Latency percentiles use successful calls only; errors are reported separately. */
export function summarizeSide(rows: Row[], gold: string[], wall_ms: number): SideSummary {
  const ok = rows.filter((r) => !r.error && r.label);
  const latencies = ok.map((r) => r.latency_ms);
  const total_cost_usd = rows.reduce((a, r) => a + r.cost_usd, 0);
  const correct = rows.filter((r, i) => !r.error && r.label === gold[i]).length;
  return {
    n: rows.length,
    answered: ok.length,
    errors: rows.length - ok.length,
    correct,
    accuracy: rows.length ? correct / rows.length : 0,
    median_latency_ms: median(latencies),
    p95_latency_ms: percentile(latencies, 95),
    total_cost_usd,
    cost_per_million_usd: costPerMillionDecisions(total_cost_usd, rows.length),
    wall_ms,
  };
}

export interface RaceSummary {
  jev: SideSummary;
  llm: SideSummary;
  agreement: ReturnType<typeof agreement>;
}

export function summarizeRace(gold: string[], jev: Row[], llm: Row[], wall: { jev: number; llm: number }): RaceSummary {
  return { jev: summarizeSide(jev, gold, wall.jev), llm: summarizeSide(llm, gold, wall.llm), agreement: agreement(jev, llm) };
}

/** Share of emails where both models answered and chose the same label. */
export function agreement(a: Row[], b: Row[]): { rate: number; both_answered: number; agreed: number } {
  let both_answered = 0;
  let agreed = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i].error || b[i].error || !a[i].label || !b[i].label) continue;
    both_answered++;
    if (a[i].label === b[i].label) agreed++;
  }
  return { rate: both_answered ? agreed / both_answered : 0, both_answered, agreed };
}
