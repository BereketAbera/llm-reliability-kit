export function seconds(ms: number | undefined, digits = 1): string {
  if (ms === undefined || !Number.isFinite(ms)) return "–";
  return `${(ms / 1000).toFixed(digits)} s`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function thousands(n: number): string {
  return n.toLocaleString("en-US");
}
