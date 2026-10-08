import { existsSync } from "node:fs";
import path from "node:path";
import { llmConfig, pricingAgeDays, pricingConfig, ROOT, taskConfig } from "@/lib/config";
import { loadEmails, listRaceRuns, loadRaceRun } from "@/lib/race";
import * as jev from "@/lib/models/jev";
import * as llm from "@/lib/models/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Status = "ok" | "warn" | "fail";
export interface Check {
  id: string;
  name: string;
  status: Status;
  detail: string;
  latency_ms?: number;
}

const PING = "Please close my account.";

async function pingModel(id: "jev" | "llm", name: string, classify: typeof jev.classify): Promise<Check> {
  const task = taskConfig();
  try {
    const d = await classify(PING, task.options, task.question);
    if (d.error) return { id, name, status: "fail", detail: d.error, latency_ms: d.latency_ms };
    const slow = d.latency_ms > 5000;
    return {
      id,
      name,
      status: slow || d.attempts > 1 ? "warn" : "ok",
      detail: `${d.model_version} answered "${d.label}"${d.attempts > 1 ? ` after ${d.attempts} attempts` : ""}${slow ? " (slow)" : ""}`,
      latency_ms: d.latency_ms,
    };
  } catch (e) {
    return { id, name, status: "fail", detail: (e as Error).message };
  }
}

function localChecks(): Check[] {
  const checks: Check[] = [];
  const pricing = pricingConfig();
  const age = pricingAgeDays(pricing.checked_on);
  checks.push({
    id: "pricing",
    name: "Pricing config",
    status: age > 30 ? "warn" : "ok",
    detail: `config/pricing.yaml checked ${age} day${age === 1 ? "" : "s"} ago (${pricing.checked_on})`,
  });

  const { emails, reviewed } = loadEmails();
  checks.push({
    id: "dataset",
    name: "Dataset",
    status: emails.length === 500 && reviewed === emails.length ? "ok" : "warn",
    detail: `${emails.length} emails, ${reviewed} gold labels hand-reviewed`,
  });

  const runs = listRaceRuns();
  const full = runs.find((r) => !r.aborted && r.n === emails.length);
  if (!full) {
    checks.push({ id: "replay", name: "Replay backup", status: "fail", detail: `No complete ${emails.length}-email race saved yet. Run one so replay has something to show.` });
  } else {
    const rec = loadRaceRun(full.file);
    const errors = rec.summary.jev.errors + rec.summary.llm.errors;
    checks.push({
      id: "replay",
      name: "Replay backup",
      status: errors ? "warn" : "ok",
      detail: `${full.file} (${full.n} emails, ${errors} errors)`,
    });
  }

  const logo = existsSync(path.join(ROOT, "public/logo.png"));
  checks.push({ id: "logo", name: "Outskill logo", status: logo ? "ok" : "warn", detail: logo ? "public/logo.png found" : "Drop logo.png into public/" });
  return checks;
}

export async function GET() {
  const [j, l] = await Promise.all([pingModel("jev", "Jev API", jev.classify), pingModel("llm", `LLM API (${llmConfig().model})`, llm.classify)]);
  return Response.json({ checked_at: new Date().toISOString(), checks: [j, l, ...localChecks()] });
}
