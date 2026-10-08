import { loadRaceRun, type RaceEvent, raceIsRunning, replayEvents, runRace } from "@/lib/race";
import { runConfig, warnIfPricingStale } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of a race.
 *   /api/race?concurrency=10[&limit=20]   live race against both APIs
 *   /api/race?replay=race_<ts>.json       saved run, re-streamed with its original timing
 */
export function GET(req: Request) {
  warnIfPricingStale();
  const url = new URL(req.url);
  const replay = url.searchParams.get("replay");
  const concurrency = clampInt(url.searchParams.get("concurrency"), runConfig().concurrency, 1, 50);
  const limit = url.searchParams.get("limit") ? clampInt(url.searchParams.get("limit"), 0, 1, 100_000) : undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (e: RaceEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false;
        }
      };
      const heartbeat = setInterval(() => open && controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      req.signal.addEventListener("abort", () => (open = false));
      try {
        if (replay) {
          const record = loadRaceRun(replay);
          for await (const e of replayEvents(record, replay)) {
            if (!open) break;
            send(e);
          }
        } else if (raceIsRunning()) {
          send({ type: "error", t_ms: 0, message: "A race is already running in another tab." });
        } else {
          await runRace({ concurrency, limit, emit: send, signal: req.signal });
        }
      } catch (e) {
        send({ type: "error", t_ms: 0, message: (e as Error).message });
      } finally {
        clearInterval(heartbeat);
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
