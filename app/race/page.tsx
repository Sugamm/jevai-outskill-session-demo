import { hostname } from "node:os";
import { llmConfig, runConfig } from "@/lib/config";
import { JEV_MODEL } from "@/lib/models/jev";
import { listRaceRuns, loadEmails } from "@/lib/race";
import RaceClient from "./RaceClient";

export const dynamic = "force-dynamic";

export default async function RacePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const concurrency = Math.min(50, Math.max(1, Number.parseInt(sp.concurrency ?? "", 10) || runConfig().concurrency));
  const limit = sp.limit ? Math.max(1, Number.parseInt(sp.limit, 10) || 0) || undefined : undefined;
  const { emails } = loadEmails(limit);
  return (
    <RaceClient
      key={sp.replay ?? "live"}
      concurrency={concurrency}
      limit={limit}
      n={emails.length}
      host={hostname()}
      models={{ jev: JEV_MODEL, llm: llmConfig().model }}
      runs={listRaceRuns()}
      replay={sp.replay ?? null}
    />
  );
}
