export const BUSINESS_TYPES = [
  ["bakery", "Bakery"],
  ["cafe", "Café"],
  ["restaurant", "Restaurant"],
  ["food_truck", "Food truck"],
  ["caterer", "Caterer"],
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number][0];
export function businessLabel(type?: BusinessType) {
  return BUSINESS_TYPES.find(([id]) => id === type)?.[1] ?? "Bakery";
}
