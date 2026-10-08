"use client";

import { useEffect, useState } from "react";
import { ms, when } from "@/components/format";
import { PageHeader } from "@/components/ui";
import type { Check, Status } from "@/app/api/health/route";

const WORD: Record<Status, string> = { ok: "OK", warn: "Check", fail: "Down" };

export default function HealthPage() {
  const [data, setData] = useState<{ checked_at: string; checks: Check[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  useEffect(() => {
    check();
  }, []);

  const overall: Status | null = data ? (data.checks.some((c) => c.status === "fail") ? "fail" : data.checks.some((c) => c.status === "warn") ? "warn" : "ok") : null;

  return (
    <>
      <PageHeader
        eyebrow="Pre-flight · Health"
        title={overall === "ok" ? "All systems go" : overall === "warn" ? "Mostly ready: check the amber rows" : overall === "fail" ? "Not ready: use replay or fix the red rows" : "Checking…"}
        sub={data ? `Checked ${when(data.checked_at)}. Each API gets one real classification call.` : "Sending one real classification call to each API…"}
        right={
          <button onClick={check} disabled={running}>
            {running ? "Checking…" : "↻ Check again"}
          </button>
        }
      />
      {error && <div className="banner">{error}</div>}
      <section className="card" style={{ padding: 0 }}>
        <table>
          <tbody>
            {(data?.checks ?? []).map((c) => (
              <tr key={c.id}>
                <td style={{ width: 110, verticalAlign: "middle", paddingLeft: 24 }}>
                  <span className={`health ${c.status}`}>{WORD[c.status]}</span>
                </td>
                <td style={{ verticalAlign: "middle" }}>
                  <div>{c.name}</div>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {c.detail}
                  </div>
                </td>
                <td className="num" style={{ textAlign: "right", fontSize: 22, verticalAlign: "middle", width: 140, paddingRight: 24 }}>
                  {c.latency_ms != null ? ms(c.latency_ms) : ""}
                </td>
              </tr>
            ))}
            {!data && (
              <tr>
                <td className="muted" style={{ padding: 24 }}>
                  Pinging Jev and the LLM…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
