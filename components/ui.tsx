import type { ReactNode } from "react";

export const MODEL_NAMES = { jev: "Jev", llm: "LLM" } as const;
export type Side = keyof typeof MODEL_NAMES;

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right && <div className="row">{right}</div>}
    </header>
  );
}

export function SideHead({ side, modelId }: { side: Side; modelId: string }) {
  return (
    <div className="side-head">
      <span className={`badge ${side}`}>{MODEL_NAMES[side].toUpperCase()}</span>
      <span className="model-id">{modelId}</span>
    </div>
  );
}

/** What both models share, stated on screen so the audience can check it. */
export function FairnessStrip({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="chips">
      {items.map(([k, v], i) => (
        <span key={i} className="chip">
          {k} <b>{v}</b>
        </span>
      ))}
    </div>
  );
}
