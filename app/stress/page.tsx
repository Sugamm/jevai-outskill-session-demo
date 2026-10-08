import path from "node:path";
import { tally } from "@/lib/calls";
import { llmConfig, ROOT, taskConfig } from "@/lib/config";
import { type Email, readJsonl } from "@/lib/jsonl";
import { JEV_MODEL } from "@/lib/models/jev";
import StressClient from "./StressClient";

export const dynamic = "force-dynamic";

export default async function StressPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const hardCases = readJsonl<Email>(path.join(ROOT, "data/hard_cases.jsonl")).map(({ id, text, hard_type }) => ({ id, text, hard_type }));
  return (
    <StressClient
      key={sp.replay ? "replay" : "live"}
      hardCases={hardCases}
      options={Object.keys(taskConfig().options)}
      initialTally={tally()}
      models={{ jev: JEV_MODEL, llm: llmConfig().model }}
      replay={!!sp.replay}
    />
  );
}
