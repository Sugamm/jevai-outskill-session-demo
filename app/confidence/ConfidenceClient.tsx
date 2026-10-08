"use client";

import { useState } from "react";
import { pct, prettyLabel, when } from "@/components/format";
import { ModeToggle, ReplayBanner } from "@/components/ModeToggle";
import { ProbBars } from "@/components/ResultCard";
import { TierBadge, TierScale } from "@/components/Tiers";
import { MODEL_NAMES, PageHeader, type Side, SideHead } from "@/components/ui";
import { type ClassifyResult, useClassify } from "@/components/useClassify";
import { type Tiers, tierFor } from "@/lib/tiers";

interface Props {
  trio: { id: string; title: string; text: string }[];
  options: string[];
  tiers: Tiers;
  models: Record<Side, string>;
  replay: boolean;
}

const SIDES: Side[] = ["jev", "llm"];

export default function ConfidenceClient({ trio, options, tiers, models, replay }: Props) {
  const [selected, setSelected] = useState(0);
  const [results, setResults] = useState<Record<string, ClassifyResult>>({});
  const [ask, setAsk] = useState(tiers.ask_confirm);
  const [auto, setAuto] = useState(tiers.auto_act);
  const { result: streaming, running, error, failing, run } = useClassify("confidence");

  const email = trio[selected];
  const result = running ? streaming : results[email.id] ?? null;
  const metric = (d: ClassifyResult["jev"]) => (d && !d.error ? (tiers.metric === "top_prob" ? d.top_prob : d.confidence) : null);

  async function runSelected() {
    const r = await run(email.text, { source: email.id, replay });
    setResults((all) => ({ ...all, [email.id]: r }));
  }

  return (
    <>
      <PageHeader eyebrow="Demo 2 · Confidence" title="How sure is each model?" right={<ModeToggle path="/confidence" replay={replay} />} />

      {failing && !replay && <ReplayBanner path="/confidence" side={MODEL_NAMES[failing]} />}

      <section className="card" style={{ display: "grid", gap: 20 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="chips">
            {trio.map((t, i) => (
              <button key={t.id} className={`chip${i === selected ? " active" : ""}`} onClick={() => setSelected(i)} disabled={running}>
                {i + 1} · {t.title}
              </button>
            ))}
          </div>
          <div className="row">
            {result?.replay && <span className="chip replay">Replay · recorded {when(result.replay.recorded_at)}</span>}
            <button onClick={runSelected} disabled={running}>
              {running ? "Running…" : results[email.id] ? "▶ Run again" : "▶ Run"}
            </button>
          </div>
        </div>
        <p className="email-quote">“{email.text}”</p>
        {error && <p className="error">Error: {error}</p>}
      </section>

      <div className="split">
        {SIDES.map((side) => {
          const d = result?.[side] ?? null;
          const ok = d && !d.error;
          const value = metric(d);
          return (
            <section key={side} className={`card side-card ${side}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <SideHead side={side} modelId={d?.model_version ?? models[side]} />
                <TierBadge tier={value == null ? null : tierFor(value, { ask_confirm: ask, auto_act: auto })} />
              </div>
              {d?.error ? (
                <p className="error">
                  {MODEL_NAMES[side]} error: {d.error}
                </p>
              ) : (
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div className="muted">{MODEL_NAMES[side]} says</div>
                    <div className="answer">{ok ? prettyLabel(d.label ?? "") : running ? "Thinking…" : "—"}</div>
                  </div>
                  <div className="stat" style={{ textAlign: "right" }}>
                    <div className="label">{side === "jev" ? "Jev confidence" : "LLM self-reported confidence"}</div>
                    <div className="num" style={{ fontSize: 40, lineHeight: 1.1 }}>
                      {value == null ? "—" : pct(value)}
                    </div>
                  </div>
                </div>
              )}
              <ProbBars probs={ok ? d.probs : {}} options={options} top={ok ? d.label : null} />
            </section>
          );
        })}
      </div>

      <section className="card" style={{ paddingTop: 8 }}>
        <TierScale
          ask={ask}
          auto={auto}
          markers={SIDES.flatMap((side) => {
            const v = metric(result?.[side] ?? null);
            return v == null ? [] : [{ side, value: v }];
          })}
        />
        <div className="slider-grid">
          <label>
            <span>
              <b>Ask to confirm</b> <span className="muted">from</span> <b>{pct(ask)}</b>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={ask} onChange={(e) => setAsk(Math.min(Number(e.target.value), auto))} />
          </label>
          <label>
            <span>
              <b>Auto act</b> <span className="muted">from</span> <b>{pct(auto)}</b>
            </span>
            <input type="range" min={0} max={1} step={0.01} value={auto} onChange={(e) => setAuto(Math.max(Number(e.target.value), ask))} />
          </label>
        </div>
      </section>
    </>
  );
}
