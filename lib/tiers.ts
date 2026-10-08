export interface Tiers {
  metric: "confidence" | "top_prob";
  auto_act: number;
  ask_confirm: number;
}

export type Tier = "auto_act" | "ask_confirm" | "human_decides";

export const TIER_LABELS: Record<Tier, string> = {
  auto_act: "Auto act",
  ask_confirm: "Ask to confirm",
  human_decides: "Human decides",
};

export function tierFor(value: number, t: Pick<Tiers, "auto_act" | "ask_confirm">): Tier {
  if (value >= t.auto_act) return "auto_act";
  if (value >= t.ask_confirm) return "ask_confirm";
  return "human_decides";
}
