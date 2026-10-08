"use client";

import { useRef, useState } from "react";
import type { PublicDecision, Side } from "@/lib/race";

const ERROR_STREAK = 3;

export interface ClassifyResult {
  jev: PublicDecision | null;
  llm: PublicDecision | null;
  call_id: string | null;
  replay: { recorded_at: string } | null;
}

const EMPTY: ClassifyResult = { jev: null, llm: null, call_id: null, replay: null };

/** Streams one email through both models; each side is set the moment it answers. */
export function useClassify(log: "stress" | "confidence") {
  const [result, setResult] = useState<ClassifyResult>(EMPTY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failing, setFailing] = useState<Side | null>(null);
  const streak = useRef<Record<Side, number>>({ jev: 0, llm: 0 });

  async function run(text: string, opts: { source?: string | null; replay?: boolean } = {}): Promise<ClassifyResult> {
    setRunning(true);
    setError(null);
    let current = { ...EMPTY };
    setResult(current);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: opts.source ?? null, log, replay: !!opts.replay }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "result") {
            current = { ...current, [e.side]: e.decision };
            if (!opts.replay) {
              streak.current[e.side as Side] = e.decision.error ? streak.current[e.side as Side] + 1 : 0;
              if (streak.current[e.side as Side] >= ERROR_STREAK) setFailing(e.side);
            }
          } else if (e.type === "done") {
            current = { ...current, call_id: e.call_id, replay: e.replay ?? null };
          } else if (e.type === "error") {
            throw new Error(e.message);
          }
          setResult(current);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
    return current;
  }

  return { result, running, error, failing, run, reset: () => setResult(EMPTY) };
}
