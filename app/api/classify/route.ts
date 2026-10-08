import { randomUUID } from "node:crypto";
import { CALL_LOGS, type CallLog, findCachedCall, logCall } from "@/lib/calls";
import { taskConfig, warnIfPricingStale } from "@/lib/config";
import type { Decision } from "@/lib/decision";
import * as jev from "@/lib/models/jev";
import * as llm from "@/lib/models/llm";
import { SIDES, type Side, toPublic } from "@/lib/race";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 8000;
const CLASSIFY: Record<Side, typeof jev.classify> = { jev: jev.classify, llm: llm.classify };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Classify one email with both models, streamed as NDJSON so each side appears the moment
 * it answers: {"type":"result","side":...} per model, then {"type":"done",...}.
 * With `replay: true`, the last logged answer for the same text is re-streamed with its
 * original latencies instead of calling the APIs.
 */
export async function POST(req: Request) {
  warnIfPricingStale();
  const body = (await req.json().catch(() => null)) as { text?: unknown; source?: unknown; log?: unknown; replay?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Email text is required." }, { status: 400 });
  if (text.length > MAX_CHARS) return Response.json({ error: `Email is longer than ${MAX_CHARS} characters.` }, { status: 400 });
  const log: CallLog = CALL_LOGS.includes(body?.log as CallLog) ? (body?.log as CallLog) : "stress";
  const source = typeof body?.source === "string" ? body.source : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        if (body?.replay === true) {
          const cached = findCachedCall(text);
          if (!cached) {
            send({ type: "error", message: "No saved answer for this email yet. Switch to live." });
          } else {
            await Promise.all(
              SIDES.map(async (side) => {
                await sleep(cached[side].latency_ms);
                send({ type: "result", side, decision: toPublic(cached[side]) });
              }),
            );
            send({ type: "done", call_id: cached.call_id, replay: { recorded_at: cached.at } });
          }
        } else {
          const task = taskConfig();
          const results = {} as Record<Side, Decision>;
          // Started together so neither model gets a head start.
          await Promise.all(
            SIDES.map(async (side) => {
              results[side] = await CLASSIFY[side](text, task.options, task.question);
              send({ type: "result", side, decision: toPublic(results[side]) });
            }),
          );
          const call_id = randomUUID();
          logCall(log, { call_id, text, source, jev: results.jev, llm: results.llm });
          send({ type: "done", call_id });
        }
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
