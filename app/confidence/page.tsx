import path from "node:path";
import { llmConfig, ROOT, taskConfig, tiersConfig } from "@/lib/config";
import { readJsonl } from "@/lib/jsonl";
import { JEV_MODEL } from "@/lib/models/jev";
import ConfidenceClient from "./ConfidenceClient";

export const dynamic = "force-dynamic";

export default async function ConfidencePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const trio = readJsonl<{ id: string; title: string; text: string }>(path.join(ROOT, "data/confidence_trio.jsonl")).map(({ id, title, text }) => ({
    id,
    title,
    text,
  }));
  return (
    <ConfidenceClient
      key={sp.replay ? "replay" : "live"}
      trio={trio}
      options={Object.keys(taskConfig().options)}
      tiers={tiersConfig()}
      models={{ jev: JEV_MODEL, llm: llmConfig().model }}
      replay={!!sp.replay}
    />
  );
}
