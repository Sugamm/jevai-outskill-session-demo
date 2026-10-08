import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export const ROOT = process.cwd();

let envLoaded = false;
/** Load `.env` for scripts; Next.js loads it itself, and existing variables win. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = path.join(ROOT, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Add it to .env (see .env.example).`);
  return value;
}

function readYaml<T>(file: string): T {
  return parse(readFileSync(path.join(ROOT, "config", file), "utf8")) as T;
}

export interface TaskConfig {
  question_id: string;
  question: string;
  options: Record<string, string>;
}

export interface Price {
  model: string;
  source: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
}

export interface PricingConfig {
  checked_on: string;
  jev: Price;
  llm: Price;
}

export interface LlmConfig {
  provider: string;
  base_url: string;
  model: string;
  reasoning: string;
  dataset_generator_model: string;
}

export interface RunConfig {
  concurrency: number;
  timeout_ms: number;
  max_retries: number;
  retry_backoff_ms: number;
}

export const taskConfig = (): TaskConfig => readYaml("task.yaml");
export const tiersConfig = (): import("./tiers").Tiers => readYaml("tiers.yaml");
export const llmConfig = (): LlmConfig => readYaml("llm.yaml");
export const runConfig = (): RunConfig => readYaml("run.yaml");

export function pricingConfig(): PricingConfig {
  const pricing = readYaml<PricingConfig>("pricing.yaml");
  return { ...pricing, checked_on: String(pricing.checked_on) };
}

export function pricingAgeDays(checkedOn: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(`${checkedOn}T00:00:00Z`).getTime()) / 86_400_000);
}

let pricingWarned = false;
export function warnIfPricingStale(): void {
  if (pricingWarned) return;
  pricingWarned = true;
  const { checked_on } = pricingConfig();
  const age = pricingAgeDays(checked_on);
  if (age > 30) {
    console.warn(
      `\n⚠️  config/pricing.yaml was last checked ${age} days ago (${checked_on}). ` +
        "Re-check the provider pricing pages before quoting costs.\n",
    );
  }
}
