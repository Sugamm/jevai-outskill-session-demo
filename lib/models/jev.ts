import { APIConnectionError, APIError, choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { pricingConfig, requireEnv, runConfig, taskConfig } from "../config";
import { costUsd } from "../cost";
import { type Decision, topProbability } from "../decision";
import { describeError, isRetryableStatus, withRetry } from "../retry";

export const JEV_MODEL = "jev-latest";

let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  // Retries are disabled here so both models share the identical policy in lib/retry.ts.
  client ??= new TypeSafeClient({ apiKey: requireEnv("TYPESAFE_API_KEY"), defaultModel: JEV_MODEL, retry: { maxRetries: 0 } });
  return client;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof APIError) return isRetryableStatus(error.status);
  return error instanceof APIConnectionError;
}

export async function classify(text: string, options: Record<string, string>, question: string): Promise<Decision> {
  const { question_id } = taskConfig();
  const run = runConfig();
  const request = {
    state: text,
    model: JEV_MODEL,
    questions: { [question_id]: choice(question, options) },
  };
  const result = await withRetry(
    () => getClient().systemOne(request, { timeout: run.timeout_ms }).withResponse(),
    isRetryable,
    run,
  );

  const base = { latency_ms: result.latency_ms, total_ms: result.total_ms, attempts: result.attempts, request };
  if (!result.value) {
    return {
      ...base,
      label: null,
      probs: {},
      confidence: null,
      top_prob: null,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      model_version: null,
      raw: { error: describeError(result.error), body: (result.error as APIError | undefined)?.body ?? null },
      error: describeError(result.error),
    };
  }

  const { data, requestId } = result.value;
  const answer = data.answers[question_id];
  const probs = { ...answer.probabilities } as Record<string, number>;
  const usage = { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens };
  return {
    ...base,
    label: answer.choice,
    probs,
    confidence: answer.confidence,
    top_prob: topProbability(probs),
    ...usage,
    cost_usd: costUsd(usage, pricingConfig().jev),
    model_version: data.model,
    raw: { request_id: requestId, body: data },
    error: null,
  };
}
