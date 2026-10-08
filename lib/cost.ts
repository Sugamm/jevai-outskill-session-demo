import type { Price } from "./config";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
}

export function costUsd(usage: TokenUsage, price: Price): number {
  const cached = Math.min(usage.cached_input_tokens ?? 0, usage.input_tokens);
  const cachedRate = price.cached_input_per_mtok ?? price.input_per_mtok;
  return (
    ((usage.input_tokens - cached) * price.input_per_mtok +
      cached * cachedRate +
      usage.output_tokens * price.output_per_mtok) /
    1_000_000
  );
}

export function costPerMillionDecisions(totalCostUsd: number, decisions: number): number {
  return decisions > 0 ? (totalCostUsd / decisions) * 1_000_000 : 0;
}
