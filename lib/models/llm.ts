import OpenAI, { APIConnectionError, APIError } from "openai";
import { llmConfig, pricingConfig, requireEnv, runConfig, taskConfig } from "../config";
import { costUsd } from "../cost";
import { type Decision, topProbability } from "../decision";
import { describeError, isRetryableStatus, withRetry } from "../retry";
import { ADAPTER_PORT_OF, buildChatRequest, toChoiceAnswer } from "./adapter";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // Retries are disabled here so both models share the identical policy in lib/retry.ts.
  client ??= new OpenAI({ baseURL: llmConfig().base_url, apiKey: requireEnv("OPENROUTER_API_KEY"), maxRetries: 0 });
  return client;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof APIError && typeof error.status === "number") return isRetryableStatus(error.status);
  return error instanceof APIConnectionError;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export async function classify(text: string, options: Record<string, string>, question: string): Promise<Decision> {
  const { question_id } = taskConfig();
  const llm = llmConfig();
  const run = runConfig();
  const labels = Object.keys(options);
  const request = buildChatRequest(llm.model, text, question_id, question, options);

  const result = await withRetry(
    () => getClient().chat.completions.create(request, { timeout: run.timeout_ms }),
    isRetryable,
    run,
  );
  const base = {
    latency_ms: result.latency_ms,
    total_ms: result.total_ms,
    attempts: result.attempts,
    request: { ...request, adapter: ADAPTER_PORT_OF, reasoning: llm.reasoning },
  };
  const failed = (error: string, raw: unknown, usage = { input_tokens: 0, output_tokens: 0 }, cost = 0): Decision => ({
    ...base,
    label: null,
    probs: {},
    confidence: null,
    top_prob: null,
    ...usage,
    cost_usd: cost,
    model_version: null,
    raw,
    error,
  });

  if (!result.value) {
    const e = result.error as APIError | undefined;
    return failed(describeError(result.error), { error: describeError(result.error), body: e?.error ?? null });
  }

  const completion = result.value;
  // OpenRouter sometimes returns HTTP 200 with an embedded `error` instead of throwing
  // (e.g. upstream OpenAI 403 policy blocks). Surface that before checking usage/choices.
  const providerError = (completion as { error?: { message?: string; code?: number | string } }).error;
  if (providerError?.message) {
    const code = providerError.code != null ? ` (${providerError.code})` : "";
    return failed(`${providerError.message}${code}`, { body: completion, provider_reported_cost_usd: null });
  }
  const u = (completion.usage ?? {}) as OpenRouterUsage;
  const usage = {
    input_tokens: u.prompt_tokens ?? 0,
    output_tokens: u.completion_tokens ?? 0,
    cached_input_tokens: u.prompt_tokens_details?.cached_tokens ?? 0,
  };
  const cost = costUsd(usage, pricingConfig().llm);
  const raw = { body: completion, provider_reported_cost_usd: u.cost ?? null };
  const tokens = { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens };

  if (u.prompt_tokens == null || u.completion_tokens == null) {
    return failed("Provider response did not report token usage", raw, tokens, cost);
  }
  const finish = completion.choices[0]?.finish_reason;
  if (finish !== "stop" && finish != null) {
    return failed(`OpenAI chat completion did not complete: ${finish}.`, raw, tokens, cost);
  }
  try {
    const answer = toChoiceAnswer(completion.choices[0]?.message?.content ?? "", question_id, labels);
    return {
      ...base,
      label: answer.choice,
      probs: answer.probabilities,
      confidence: answer.confidence,
      top_prob: topProbability(answer.probabilities),
      ...tokens,
      cost_usd: cost,
      model_version: completion.model,
      raw: { ...raw, normalization: answer.normalization },
      error: null,
    };
  } catch (e) {
    return failed(describeError(e), raw, tokens, cost);
  }
}
