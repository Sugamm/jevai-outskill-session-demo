import type { PublicDecision } from "@/lib/race";
import { ms, pct, prettyLabel, usd } from "./format";
import { MODEL_NAMES, type Side, SideHead } from "./ui";

export type { PublicDecision };

/** Bar color comes from the enclosing `.jev` / `.llm` card. */
export function ProbBars({ probs, options, top }: { probs: Record<string, number>; options: string[]; top?: string | null }) {
  return (
    <div className="bars">
      {options.map((o) => {
        const p = probs[o] ?? 0;
        return (
          <div className={`bar-row${o === top ? " top" : ""}`} key={o}>
            <span>{prettyLabel(o)}</span>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ width: `${p * 100}%` }} />
            </div>
            <span className="bar-pct">{pct(p)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ResultCard({
  side,
  modelId,
  decision,
  options,
  running,
}: {
  side: Side;
  modelId: string;
  decision: PublicDecision | null;
  options: string[];
  running?: boolean;
}) {
  const name = MODEL_NAMES[side];
  const ok = decision && !decision.error;
  return (
    <section className={`card side-card ${side}`}>
      <SideHead side={side} modelId={decision?.model_version ?? modelId} />
      {decision?.error ? (
        <p className="error">
          {name} error: {decision.error}
        </p>
      ) : (
        <div>
          <div className="muted">{name} says</div>
          <div className="answer">{ok ? prettyLabel(decision.label ?? "") : running ? "Thinking…" : "—"}</div>
        </div>
      )}
      <div>
        <div className="stat" style={{ marginBottom: 12 }}>
          <div className="label">
            {side === "jev" ? "Jev's probabilities" : "LLM's self-reported probabilities"}
          </div>
        </div>
        <ProbBars probs={ok ? decision.probs : {}} options={options} top={ok ? decision.label : null} />
      </div>
      <div className="stat-grid four">
        <Stat label={`${name} confidence`} value={ok ? pct(decision.confidence ?? 0) : "—"} />
        <Stat label={`${name} latency`} value={decision ? ms(decision.latency_ms) : "—"} />
        <Stat label={`${name} cost`} value={decision ? usd(decision.cost_usd, side === "jev" ? 4 : 2) : "—"} />
        <Stat label={`${name} tokens in/out`} value={decision ? `${decision.input_tokens} / ${decision.output_tokens}` : "—"} />
      </div>
    </section>
  );
}

export function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`stat ${className ?? ""}`}>
      <div className="label">{label}</div>
      <div className="num">{value}</div>
    </div>
  );
}
