export function usd(value: number, decimals: number): string {
  if (value > 0 && value < 10 ** -decimals) return `$${value.toPrecision(2)}`;
  return `$${value.toFixed(decimals)}`;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

export function duration(msValue: number): string {
  const s = msValue / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const prettyLabel = (label: string) => label.replace(/_/g, " ");
