import type { PriceObservation } from "./types";
/** Flat trailing-seven-observation mean. +/-10% is illustrative, not calibrated. */
export function forecast(history: PriceObservation[], clock: string) {
  const usable = history
    .filter((p) => p.date <= clock.slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (usable.length < 7) return [];
  const mean =
    usable
      .slice(-7)
      .reduce((n, p) => n + p.pack_price_cents / p.pack_quantity_base, 0) / 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${clock.slice(0, 10)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return {
      date: d.toISOString().slice(0, 10),
      price: mean,
      low: mean * 0.9,
      high: mean * 1.1,
    };
  });
}
