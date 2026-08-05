// Below a cent, two decimal places reads as free even though the call was
// billed — this is real money, so a tiny nonzero amount stays visible instead.
const CENT = 0.005;

export function formatUsd(usd: number): string {
  if (usd !== 0 && Math.abs(usd) < CENT) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
