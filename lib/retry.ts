import type { RunConfig } from "./config";

export const RETRYABLE_STATUSES = new Set([408, 429]);
export const isRetryableStatus = (status: number) => RETRYABLE_STATUSES.has(status) || (status >= 500 && status < 600);

export interface AttemptResult<T> {
  value: T | null;
  error: unknown;
  /** Network time of the last attempt. */
  latency_ms: number;
  total_ms: number;
  attempts: number;
}

/**
 * The single retry policy shared by both models: one retry on a retryable failure,
 * after a fixed backoff, then the error is returned rather than thrown.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  config: Pick<RunConfig, "max_retries" | "retry_backoff_ms">,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<AttemptResult<T>> {
  const started = performance.now();
  let attempts = 0;
  let latency_ms = 0;
  let error: unknown = null;
  while (attempts <= config.max_retries) {
    if (attempts > 0) await sleep(config.retry_backoff_ms);
    attempts++;
    const t0 = performance.now();
    try {
      const value = await attempt();
      latency_ms = performance.now() - t0;
      return { value, error: null, latency_ms, total_ms: performance.now() - started, attempts };
    } catch (e) {
      latency_ms = performance.now() - t0;
      error = e;
      if (!isRetryable(e)) break;
    }
  }
  return { value: null, error, latency_ms, total_ms: performance.now() - started, attempts };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as { status?: unknown }).status;
    return `${error.name}${typeof status === "number" ? ` ${status}` : ""}: ${error.message}`;
  }
  return String(error);
}
