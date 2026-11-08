export const PACKAGE_UNITS = {
  g: { base: "g", factor: 1, label: "g" },
  kg: { base: "g", factor: 1000, label: "kg" },
  lb: { base: "g", factor: 453.59237, label: "lb" },
  oz: { base: "g", factor: 28.349523125, label: "oz (weight)" },
  ml: { base: "ml", factor: 1, label: "ml" },
  l: { base: "ml", factor: 1000, label: "L" },
  us_gal: { base: "ml", factor: 3785.411784, label: "US gallon" },
  us_qt: { base: "ml", factor: 946.352946, label: "US quart" },
  us_fl_oz: { base: "ml", factor: 29.5735295625, label: "US fl oz" },
  each: { base: "each", factor: 1, label: "each" },
  dozen: { base: "each", factor: 12, label: "dozen" },
} as const;
export type PackageUnit = keyof typeof PACKAGE_UNITS;
/** Conservative conversion: the integer ledger never promises a fractional g/ml. */
export function packageBaseQuantity(
  amount: number,
  unit: PackageUnit,
  base: string,
) {
  const spec = PACKAGE_UNITS[unit];
  if (!spec || spec.base !== base)
    throw new Error(
      "Choose a package unit matching the ingredient’s weight, volume or count.",
    );
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Package quantity must be positive.");
  const exact = amount * spec.factor;
  if (base === "each" && !Number.isInteger(exact))
    throw new Error("Counted packages must contain a whole number of items.");
  const quantity = Math.floor(exact + 1e-8);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000000)
    throw new Error("Package quantity is outside supported storage units.");
  return quantity;
}
