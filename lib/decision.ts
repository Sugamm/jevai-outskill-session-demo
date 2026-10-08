export interface Decision {
  /** Chosen option, or null when the call failed. */
  label: string | null;
  /** Full distribution over the task options. */
  probs: Record<string, number>;
  /** Jev's own `confidence` field; for the LLM, the same formula applied to its self-reported distribution. */
  confidence: number | null;
  /** Highest probability in `probs`. Used for calibration plots. */
  top_prob: number | null;
  /** Wall clock around the network call of the successful (or last) attempt. */
  latency_ms: number;
  /** Wall clock across all attempts, including retry backoff. */
  total_ms: number;
  attempts: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  /** Model id reported by the API response. */
  model_version: string | null;
  /** Exact request sent, for fairness audits. */
  request: unknown;
  /** Full response for logging. */
  raw: unknown;
  error: string | null;
}

export function topProbability(probs: Record<string, number>): number | null {
  const values = Object.values(probs);
  return values.length ? Math.max(...values) : null;
}
