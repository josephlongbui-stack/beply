import type { State } from "./types";

// Lots label existing physical stock; creating a lot never creates stock.
export function expiredQuantity(s: State, ingredientId: string, at: string) {
  return (s.lots ?? [])
    .filter(
      (l) =>
        l.ingredient_id === ingredientId &&
        Date.parse(l.use_by) < Date.parse(at),
    )
    .reduce((n, l) => n + l.remaining_base, 0);
}
export function assignedQuantity(s: State, ingredientId: string) {
  return (s.lots ?? [])
    .filter((l) => l.ingredient_id === ingredientId)
    .reduce((n, l) => n + l.remaining_base, 0);
}
export function consumeLots(
  s: State,
  ingredientId: string,
  quantity: number,
  at: string,
  waste = false,
) {
  // Earliest use-by first, then unlabelled stock. Production skips expired lots.
  const lots = (s.lots ?? [])
    .filter(
      (l) =>
        l.ingredient_id === ingredientId &&
        (waste || Date.parse(l.use_by) >= Date.parse(at)),
    )
    .sort((a, b) => Date.parse(a.use_by) - Date.parse(b.use_by));
  let remaining = quantity;
  for (const lot of lots) {
    const used = Math.min(remaining, lot.remaining_base);
    lot.remaining_base -= used;
    remaining -= used;
    if (!remaining) break;
  }
}
