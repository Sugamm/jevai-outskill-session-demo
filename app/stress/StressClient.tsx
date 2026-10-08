"use client";

import { useState } from "react";
import { when } from "@/components/format";
import { ModeToggle, ReplayBanner } from "@/components/ModeToggle";
import { ResultCard } from "@/components/ResultCard";
import { MODEL_NAMES, PageHeader } from "@/components/ui";
import { useClassify } from "@/components/useClassify";
import type { Tally, Vote } from "@/lib/calls";

const VOTE_LABELS: [Vote, string][] = [
  ["jev_right", "Jev was right"],
  ["llm_right", "LLM was right"],
  ["both_right", "Both right"],
  ["both_wrong", "Both wrong"],
];

interface Props {
  hardCases: { id: string; text: string; hard_type?: string | null }[];
  options: string[];
  initialTally: Tally;
  models: { jev: string; llm: string };
  replay: boolean;
}

export default function StressClient({ hardCases, options, initialTally, models, replay }: Props) {
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [voted, setVoted] = useState<Vote | null>(null);
  const [tally, setTally] = useState(initialTally);
  const { result, running, error, failing, run } = useClassify("stress");
  const finished = !!result.call_id;

  async function vote(v: Vote) {
    if (!result.call_id) return;
    setVoted(v);
    const res = await fetch("/api/stress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: result.call_id, vote: v }),
    });
    if (res.ok) setTally(await res.json());
  }

  return (
    <>
      <PageHeader
        eyebrow="Demo 3 · Break it"
        title="Send us your trickiest email"
        right={
          <div className="row" style={{ gap: 32 }} aria-label="Audience tally">
            {VOTE_LABELS.map(([k, label]) => (
              <div key={k} className="stat" style={{ textAlign: "center" }}>
                <div className={`num ${k === "jev_right" ? "jev-text" : k === "llm_right" ? "llm-text" : ""}`} style={{ fontSize: 36, lineHeight: 1.1 }}>
                  {tally[k]}
                </div>
                <div className="label">{label}</div>
              </div>
            ))}
          </div>
        }
      />

      {failing && !replay && <ReplayBanner path="/stress" side={MODEL_NAMES[failing]} />}

      <div className="card" style={{ display: "grid", gap: 16 }}>
        <textarea
          value={text}
          placeholder="Paste an audience email here…"
          onChange={(e) => {
            setText(e.target.value);
            setSource(null);
          }}
        />
        <div className="row">
          <button
            onClick={() => {
              setVoted(null);
              run(text, { source, replay });
            }}
            disabled={running || !text.trim()}
          >
            {running ? "Running both…" : "Run both"}
          </button>
          <select
            value=""
            onChange={(e) => {
              const c = hardCases.find((h) => h.id === e.target.value);
              if (c) {
                setText(c.text);
                setSource(c.id);
              }
            }}
          >
            <option value="">Load a hard case…</option>
            {hardCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.hard_type?.replace(/_/g, " ")}: {c.text.slice(0, 48)}
                {c.text.length > 48 ? "…" : ""}
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto" }} className="row">
            {result.replay && <span className="chip replay">Replay · recorded {when(result.replay.recorded_at)}</span>}
            <ModeToggle path="/stress" replay={replay} />
          </div>
        </div>
        {error && <span className="error">Error: {error}</span>}
      </div>

      <div className="split">
        {(["jev", "llm"] as const).map((side) => (
          <ResultCard key={side} side={side} modelId={models[side]} decision={result[side]} options={options} running={running} />
        ))}
      </div>

      {finished && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="muted">Audience vote:</span>
          {VOTE_LABELS.map(([k, label]) => (
            <button key={k} className="secondary" aria-pressed={voted === k} onClick={() => vote(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
