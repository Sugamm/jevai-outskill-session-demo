"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { duration, ms, pct, prettyLabel, usd, when } from "@/components/format";
import { Stat } from "@/components/ResultCard";
import { FairnessStrip, MODEL_NAMES, PageHeader, SideHead } from "@/components/ui";
import type { PublicDecision, RaceEvent, RaceMeta, Side } from "@/lib/race";
import { median, percentile, type RaceSummary } from "@/lib/stats";

const SIDES: Side[] = ["jev", "llm"];
const COST_DECIMALS: Record<Side, number> = { jev: 4, llm: 2 };
const ERROR_STREAK = 3;

interface Props {
  concurrency: number;
  limit?: number;
  n: number;
  host: string;
  models: Record<Side, string>;
  runs: { file: string; started_at: string; n: number; aborted: boolean }[];
  replay: string | null;
}

type Phase = "idle" | "running" | "done";

export default function RaceClient({ concurrency, limit, n, host, models, runs, replay }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<RaceMeta | null>(null);
  const [results, setResults] = useState<Record<Side, (PublicDecision | null)[]>>({ jev: [], llm: [] });
  const [doneAt, setDoneAt] = useState<Record<Side, number | null>>({ jev: null, llm: null });
  const [streak, setStreak] = useState<Record<Side, number>>({ jev: 0, llm: 0 });
  const [summary, setSummary] = useState<RaceSummary | null>(null);
  const [savedFile, setSavedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"live" | "results" | "disagreements">("live");
  const [now, setNow] = useState(0);
  const startedAt = useRef(0);
  const source = useRef<EventSource | null>(null);

  useEffect(() => () => source.current?.close(), []);
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setNow(performance.now() - startedAt.current), 100);
    return () => clearInterval(t);
  }, [phase]);

  function start() {
    source.current?.close();
    setPhase("running");
    setMeta(null);
    setSummary(null);
    setSavedFile(null);
    setError(null);
    setView("live");
    setDoneAt({ jev: null, llm: null });
    setStreak({ jev: 0, llm: 0 });
    setNow(0);
    startedAt.current = performance.now();

    const q = new URLSearchParams(replay ? { replay } : { concurrency: String(concurrency), ...(limit ? { limit: String(limit) } : {}) });
    const es = new EventSource(`/api/race?${q}`);
    source.current = es;
    let finished = false;
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as RaceEvent;
      if (e.type === "start") {
        startedAt.current = performance.now();
        setMeta(e.meta);
        setResults({ jev: e.meta.emails.map(() => null), llm: e.meta.emails.map(() => null) });
      } else if (e.type === "result") {
        setResults((r) => {
          const next = [...r[e.side]];
          next[e.index] = e.decision;
          return { ...r, [e.side]: next };
        });
        setStreak((s) => ({ ...s, [e.side]: e.decision.error ? s[e.side] + 1 : 0 }));
      } else if (e.type === "side_done") {
        setDoneAt((d) => ({ ...d, [e.side]: e.t_ms }));
      } else if (e.type === "done") {
        finished = true;
        es.close();
        setSummary(e.summary);
        setSavedFile(e.file);
        setPhase("done");
        setView("results");
      } else if (e.type === "error") {
        finished = true;
        es.close();
        setError(e.message);
        setPhase("idle");
      }
    };
    // EventSource reconnects on its own, which would start a second (paid) race.
    es.onerror = () => {
      es.close();
      if (!finished) {
        setError("Lost the connection to the server.");
        setPhase("idle");
      }
    };
  }

  const live = useMemo(() => {
    const out = {} as Record<Side, { done: number; cost: number; median: number | null; p95: number | null; errors: number; elapsed: number }>;
    for (const side of SIDES) {
      const rows = results[side].filter((r): r is PublicDecision => r !== null);
      const lat = rows.filter((r) => !r.error).map((r) => r.latency_ms);
      out[side] = {
        done: rows.length,
        cost: rows.reduce((a, r) => a + r.cost_usd, 0),
        median: median(lat),
        p95: percentile(lat, 95),
        errors: rows.filter((r) => r.error).length,
        elapsed: doneAt[side] ?? (phase === "running" && meta ? now : 0),
      };
    }
    return out;
  }, [results, doneAt, now, phase, meta]);

  const total = meta?.n ?? n;
  const isReplay = !!replay;
  const failing = SIDES.find((s) => streak[s] >= ERROR_STREAK);
  const latestRun = runs.find((r) => !r.aborted) ?? runs[0];

  const disagreements = useMemo(() => {
    if (!meta) return [];
    return meta.emails
      .map((email, i) => ({ email, jev: results.jev[i], llm: results.llm[i] }))
      .filter(({ email, jev, llm }) => jev?.label !== llm?.label || jev?.label !== email.gold || llm?.label !== email.gold);
  }, [meta, results]);

  return (
    <>
      <PageHeader
        eyebrow="Demo 1 · The race"
        title={`${total} emails. Two models. Same start.`}
        right={
          <>
            <div className="chips" role="group" aria-label="Mode">
              <Link className={`chip${isReplay ? "" : " active"}`} href={`/race${limit ? `?limit=${limit}` : ""}`}>
                Live
              </Link>
              {runs.length > 0 && (
                <Link className={`chip${isReplay ? " active" : ""}`} href={`/race?replay=${encodeURIComponent(replay ?? latestRun.file)}`}>
                  Replay
                </Link>
              )}
            </div>
            {isReplay && (
              <select value={replay ?? ""} onChange={(e) => router.push(`/race?replay=${encodeURIComponent(e.target.value)}`)} aria-label="Saved run">
                {runs.map((r) => (
                  <option key={r.file} value={r.file}>
                    {when(r.started_at)} · {r.n} emails{r.aborted ? " · aborted" : ""}
                  </option>
                ))}
              </select>
            )}
            <button onClick={start} disabled={phase === "running"}>
              {phase === "running" ? "Racing…" : isReplay ? "▶ Start replay" : phase === "done" ? "▶ Race again" : "▶ Start race"}
            </button>
          </>
        }
      />

      <div className="row" style={{ justifyContent: "space-between" }}>
        <FairnessStrip
          items={[
            ["Same", `${total} emails`],
            ["Same", "3 options"],
            ["Concurrency", `${meta?.concurrency ?? concurrency} each`],
            ["Same machine", meta?.host ?? host],
          ]}
        />
        {meta?.replay && <span className="chip replay">Replay · recorded {when(meta.replay.recorded_at)}</span>}
      </div>

      {failing && !isReplay && (
        <div className="banner">
          <span>
            {MODEL_NAMES[failing]} failed {streak[failing]} times in a row. Switch to replay?
          </span>
          {latestRun ? <Link href={`/race?replay=${encodeURIComponent(latestRun.file)}`}>Open last saved run</Link> : <span>No saved run yet</span>}
        </div>
      )}
      {error && <div className="banner">{error}</div>}

      {view === "live" && (
        <div className="split">
          {SIDES.map((side) => {
            const s = live[side];
            return (
              <section key={side} className={`card side-card ${side}`}>
                <SideHead side={side} modelId={meta?.models[side] ?? models[side]} />
                <div>
                  <div className="num counter">
                    {s.done} <span className="of">/ {total}</span>
                  </div>
                  <div className="muted">{MODEL_NAMES[side]} emails classified</div>
                </div>
                <div className="progress">
                  <div style={{ width: `${total ? (s.done / total) * 100 : 0}%` }} />
                </div>
                <div className="stat-grid big">
                  <Stat label={`${MODEL_NAMES[side]} elapsed`} value={duration(s.elapsed)} />
                  <Stat label={`${MODEL_NAMES[side]} cost so far`} value={usd(s.cost, COST_DECIMALS[side])} />
                  <Stat label={`${MODEL_NAMES[side]} median latency`} value={s.median == null ? "—" : ms(s.median)} />
                  <Stat label={`${MODEL_NAMES[side]} p95 latency`} value={s.p95 == null ? "—" : ms(s.p95)} />
                </div>
                {s.errors > 0 && (
                  <div className="error">
                    {MODEL_NAMES[side]} errors: {s.errors}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {view !== "live" && summary && meta && (
        <Results
          summary={summary}
          meta={meta}
          savedFile={savedFile}
          view={view}
          setView={setView}
          disagreements={disagreements}
        />
      )}
    </>
  );
}

function Results({
  summary,
  meta,
  savedFile,
  view,
  setView,
  disagreements,
}: {
  summary: RaceSummary;
  meta: RaceMeta;
  savedFile: string | null;
  view: "results" | "disagreements";
  setView: (v: "live" | "results" | "disagreements") => void;
  disagreements: { email: RaceMeta["emails"][number]; jev: PublicDecision | null; llm: PublicDecision | null }[];
}) {
  const { jev, llm, agreement } = summary;
  const rows: [string, (s: typeof jev, side: Side) => string, boolean?][] = [
    ["Accuracy vs gold labels", (s) => pct(s.accuracy), true],
    ["Total time", (s) => duration(s.wall_ms)],
    ["Total cost", (s, side) => usd(s.total_cost_usd, COST_DECIMALS[side])],
    ["Median latency per call", (s) => (s.median_latency_ms == null ? "—" : ms(s.median_latency_ms))],
    ["p95 latency per call", (s) => (s.p95_latency_ms == null ? "—" : ms(s.p95_latency_ms))],
    ["Errors", (s) => String(s.errors)],
    ["Cost per 1 million decisions", (s) => `$${Math.round(s.cost_per_million_usd).toLocaleString("en-US")}`],
  ];

  return (
    <section className="card" style={{ display: "grid", gap: 24 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">Results</div>
          <h2>{view === "results" ? "How they did" : `${disagreements.length} emails where they disagree or either is wrong`}</h2>
        </div>
        <div className="row">
          <button className="secondary" aria-pressed={view === "disagreements"} onClick={() => setView(view === "disagreements" ? "results" : "disagreements")}>
            {view === "disagreements" ? "Back to results" : `Show disagreements (${disagreements.length})`}
          </button>
          <button className="secondary" onClick={() => setView("live")}>
            Live view
          </button>
        </div>
      </div>

      {view === "results" ? (
        <>
          <table className="compare">
            <thead>
              <tr>
                <th />
                {SIDES.map((side) => (
                  <th key={side} className="num">
                    <span className={`badge ${side}`}>{MODEL_NAMES[side].toUpperCase()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fmt, headline]) => (
                <tr key={label} className={headline ? "headline" : undefined}>
                  <td>{label}</td>
                  {SIDES.map((side) => (
                    <td key={side} className={`num ${side}-text`}>
                      {fmt(summary[side], side)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 18 }}>
            At this measured rate, 1 million decisions would cost{" "}
            <b className="jev-text">${Math.round(jev.cost_per_million_usd).toLocaleString("en-US")} with Jev</b> and{" "}
            <b className="llm-text">${Math.round(llm.cost_per_million_usd).toLocaleString("en-US")} with the LLM</b>.
          </p>
          <p className="muted">
            The models agreed on {pct(agreement.rate)} of emails ({agreement.agreed} of {agreement.both_answered} that both answered). Errors count as wrong answers. Gold
            labels hand-reviewed: {meta.reviewed} of {meta.n}.{savedFile ? ` Saved to runs/${savedFile}.` : ""}
          </p>
        </>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Gold</th>
              <th>
                <span className="badge jev">JEV</span>
              </th>
              <th>
                <span className="badge llm">LLM</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {disagreements.map(({ email, jev: j, llm: l }) => (
              <tr key={email.id}>
                <td className="muted">{email.id}</td>
                <td style={{ maxWidth: 520 }}>{email.text}</td>
                <td>{prettyLabel(email.gold)}</td>
                {[j, l].map((d, k) => (
                  <td key={k}>
                    <Verdict d={d} gold={email.gold} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Verdict({ d, gold }: { d: PublicDecision | null; gold: string }) {
  if (!d) return <span className="muted">not run</span>;
  if (d.error) return <span className="verdict wrong">error</span>;
  const right = d.label === gold;
  return (
    <span className={`verdict ${right ? "right" : "wrong"}`}>
      {prettyLabel(d.label ?? "")} <span className="muted">{pct(d.top_prob ?? 0)}</span>
      <div className="muted">{right ? "right" : "wrong"}</div>
    </span>
  );
}
