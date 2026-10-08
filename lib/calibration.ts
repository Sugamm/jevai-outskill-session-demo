export interface Prediction {
  /** Stated probability of the chosen label. */
  p: number;
  correct: boolean;
}

export interface Bucket {
  lo: number;
  hi: number;
  n: number;
  correct: number;
  accuracy: number | null;
  mean_p: number | null;
}

export interface Calibration {
  n: number;
  buckets: Bucket[];
  /** Predictions stated below 0.5 (possible with three options), kept out of the chart. */
  below: Bucket;
  /** Expected calibration error over all predictions, including `below`. */
  ece: number | null;
}

export const EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

function bucket(lo: number, hi: number, preds: Prediction[]): Bucket {
  const n = preds.length;
  const correct = preds.filter((x) => x.correct).length;
  return {
    lo,
    hi,
    n,
    correct,
    accuracy: n ? correct / n : null,
    mean_p: n ? preds.reduce((a, x) => a + x.p, 0) / n : null,
  };
}

/** Buckets are [lo, hi) except the last, which includes 1.0. */
export function calibrate(preds: Prediction[]): Calibration {
  const buckets = EDGES.slice(0, -1).map((lo, i) => {
    const hi = EDGES[i + 1];
    const last = i === EDGES.length - 2;
    return bucket(lo, hi, preds.filter((x) => x.p >= lo && (last ? x.p <= hi : x.p < hi)));
  });
  const below = bucket(0, EDGES[0], preds.filter((x) => x.p < EDGES[0]));
  const all = [below, ...buckets].filter((b) => b.n > 0);
  const ece = preds.length ? all.reduce((a, b) => a + (b.n / preds.length) * Math.abs((b.accuracy ?? 0) - (b.mean_p ?? 0)), 0) : null;
  return { n: preds.length, buckets, below, ece };
}

const pct = (x: number) => `${Math.round(x * 100)}`;

/**
 * One plain-language sentence. Uses the most populated bucket below 90% when it has at
 * least `minN` predictions (the interesting range), otherwise the most populated bucket.
 */
export function calibrationSentence(model: string, cal: Calibration, minN = 10): string {
  const filled = cal.buckets.filter((b) => b.n > 0);
  if (!filled.length) return `${model} made no predictions at 50% or above in this run.`;
  const mid = filled.filter((b) => b.hi <= 0.9).sort((a, b) => b.n - a.n)[0];
  const pick = mid && mid.n >= minN ? mid : [...filled].sort((a, b) => b.n - a.n)[0];
  return `When ${model} said ${pct(pick.lo)} to ${pct(pick.hi)}% sure, it was right ${pct(pick.accuracy ?? 0)}% of the time (n=${pick.n}).`;
}
