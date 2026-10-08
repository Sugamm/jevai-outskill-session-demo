import { TIER_LABELS, type Tier } from "@/lib/tiers";
import { pct } from "./format";
import { MODEL_NAMES, type Side } from "./ui";

export function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="tier empty">No decision yet</span>;
  return <span className={`tier ${tier}`}>{TIER_LABELS[tier]}</span>;
}

/** 0–100% scale split into the three tiers, with each model's confidence marked by name. */
export function TierScale({ ask, auto, markers }: { ask: number; auto: number; markers: { side: Side; value: number }[] }) {
  const zones: [Tier, number, number][] = [
    ["human_decides", 0, ask],
    ["ask_confirm", ask, auto],
    ["auto_act", auto, 1],
  ];
  return (
    <div className="scale">
      {markers
        .filter((m) => m.side === "jev")
        .map((m) => (
          <Marker key={m.side} {...m} position="above" />
        ))}
      <div className="scale-bar">
        {zones.map(([tier, lo, hi]) =>
          hi > lo ? (
            <div key={tier} className={`zone ${tier}`} style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}>
              {hi - lo >= 0.07 ? TIER_LABELS[tier] : ""}
            </div>
          ) : null,
        )}
      </div>
      {markers
        .filter((m) => m.side === "llm")
        .map((m) => (
          <Marker key={m.side} {...m} position="below" />
        ))}
    </div>
  );
}

function Marker({ side, value, position }: { side: Side; value: number; position: "above" | "below" }) {
  return (
    <div
      className={`marker ${side} ${position}${value > 0.93 ? " edge-right" : value < 0.07 ? " edge-left" : ""}`}
      style={{ left: `${Math.min(1, Math.max(0, value)) * 100}%` }}
    >
      <span>
        {MODEL_NAMES[side]} {pct(value)}
      </span>
    </div>
  );
}
