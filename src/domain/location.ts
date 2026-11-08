import type { BusinessLocation, State, Offer, Supplier } from "./types";

export const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["AS", "American Samoa"],
  ["GU", "Guam"],
  ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"],
  ["VI", "US Virgin Islands"],
] as const;
export const US_TIMEZONES = [
  ["America/New_York", "Eastern · New York"],
  ["America/Chicago", "Central · Chicago"],
  ["America/Denver", "Mountain · Denver / Navajo Nation"],
  ["America/Phoenix", "Arizona · no daylight saving"],
  ["America/Los_Angeles", "Pacific · Los Angeles"],
  ["America/Anchorage", "Alaska · Anchorage"],
  ["America/Adak", "Aleutian Islands · Adak"],
  ["Pacific/Honolulu", "Hawaii · no daylight saving"],
  ["America/Puerto_Rico", "Atlantic · Puerto Rico / US Virgin Islands"],
  ["Pacific/Guam", "Chamorro · Guam / Northern Mariana Islands"],
  ["Pacific/Pago_Pago", "Samoa · American Samoa"],
] as const;
export const DEFAULT_LOCATION: BusinessLocation = {
  country: "US",
  city: "Garden Grove",
  state: "CA",
  postal_code: "92840",
};
export function suggestedZone(state: string) {
  if (["CA", "NV", "OR", "WA"].includes(state)) return "America/Los_Angeles";
  if (["CO", "ID", "MT", "NM", "UT", "WY"].includes(state))
    return "America/Denver";
  if (
    [
      "AL",
      "AR",
      "IL",
      "IA",
      "KS",
      "LA",
      "MN",
      "MS",
      "MO",
      "NE",
      "ND",
      "OK",
      "SD",
      "TN",
      "TX",
      "WI",
    ].includes(state)
  )
    return "America/Chicago";
  return (
    (
      {
        AK: "America/Anchorage",
        AZ: "America/Phoenix",
        HI: "Pacific/Honolulu",
        AS: "Pacific/Pago_Pago",
        GU: "Pacific/Guam",
        MP: "Pacific/Guam",
        PR: "America/Puerto_Rico",
        VI: "America/Puerto_Rico",
      } as Record<string, string>
    )[state] ?? "America/New_York"
  );
}
export const locationKey = (l: BusinessLocation) =>
  `${l.country}:${l.state}:${l.postal_code.slice(0, 5)}:${l.city.trim().toLowerCase().replace(/\s+/g, " ")}`;
export const locationLabel = (l: BusinessLocation) =>
  l.city && l.state ? `${l.city}, ${l.state}` : "Set your location";
export function localDateTime(
  instant: string | number,
  timezone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function formatDateTime(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(instant));
}
export function foldForInstant(
  instant: string,
  timezone: string,
): "earlier" | "later" {
  return Date.parse(
    zonedInstant(localDateTime(instant, timezone), timezone, "earlier"),
  ) ===
    Math.floor(Date.parse(instant) / 60000) * 60000
    ? "earlier"
    : "later";
}
/** Resolve wall time against the runtime's IANA rules. Never assume a fixed UTC offset.
 * Enumerate possible offsets around the date, round-trip to reject DST gaps and
 * explicitly choose one occurrence of a repeated fall-back hour. */
export function zonedInstant(
  local: string,
  timezone: string,
  fold: "earlier" | "later" = "earlier",
) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Enter a complete local date and time.");
  const wall = Date.parse(`${local}:00Z`);
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 16) !== local
  )
    throw new Error("Enter a valid calendar date and time.");
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const candidate = wall + hours * 3600000;
    offsets.add(
      Date.parse(`${localDateTime(candidate, timezone)}:00Z`) - candidate,
    );
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => localDateTime(candidate, timezone) === local)
    .sort((a, b) => a - b);
  if (!matches.length)
    throw new Error(
      `This local time does not exist in ${timezone} because the clocks move forward. Choose a time outside the skipped hour.`,
    );
  return new Date(
    fold === "later" ? matches.at(-1)! : matches[0],
  ).toISOString();
}
export function sourceReason(s: State, o: Offer): string | null {
  const supplier = s.suppliers.find((p) => p.id === o.supplier_id);
  if (s.price_mode === "local") {
    if (supplier?.is_sample !== false)
      return "Sample quote excluded in local-price mode";
    if (supplier.location_key !== locationKey(s.location))
      return "Quote belongs to another business location";
  } else if (supplier?.is_sample === false)
    return "Local quote excluded in sample-price mode";
  return null;
}
export function currentQuote(s: State, o: Offer) {
  return (
    !sourceReason(s, o) &&
    o.currency === "USD" &&
    ["in_stock_demo", "confirmed"].includes(o.availability) &&
    !!o.observed_at &&
    Date.parse(o.observed_at) <= Date.parse(s.clock) &&
    !!o.valid_until &&
    Date.parse(o.valid_until) >= Date.parse(s.clock)
  );
}
export function historyFor(s: State, ingredientId: string) {
  return s.price_history.filter(
    (p) =>
      p.ingredient_id === ingredientId &&
      p.date <= localDateTime(s.clock, s.timezone).slice(0, 10) &&
      (s.price_mode === "local"
        ? p.location_key === locationKey(s.location)
        : !p.location_key && p.supplier_id === "market_a"),
  );
}
/** Fixed supplier per ingredient keeps index comparisons like-for-like. */
export function referenceOffer(s: State, ingredientId: string) {
  const supplierId =
    s.price_mode === "sample"
      ? "market_a"
      : historyFor(s, ingredientId)[0]?.supplier_id;
  return s.offers
    .filter(
      (o) =>
        o.ingredient_id === ingredientId &&
        o.supplier_id === supplierId &&
        currentQuote(s, o),
    )
    .sort(
      (a, b) =>
        (a.pack_price_cents + (a.tax_cents_per_pack ?? 0)) /
          a.pack_quantity_base -
        (b.pack_price_cents + (b.tax_cents_per_pack ?? 0)) /
          b.pack_quantity_base,
    )[0];
}
/** Suppliers keep their own timezone when the bakery moves. Closing is exclusive;
 * opening/closing are daily local hours; overnight windows are supported. */
export function collectionTime(s: State, supplier: Supplier, offer?: Offer) {
  let arrival = Math.max(
    Date.parse(offer?.available_at ?? supplier.ready_at),
    Date.parse(supplier.ready_at),
    Date.parse(s.clock),
  );
  if (supplier.mode !== "in_store" || !supplier.hours) return arrival;
  const tz = supplier.timezone ?? "America/Los_Angeles";
  const [open, close] = supplier.hours.split(/[–-]/);
  if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) return NaN;
  const local = localDateTime(arrival, tz),
    day = local.slice(0, 10),
    time = local.slice(11);
  try {
    if (open < close) {
      arrival = Math.max(
        arrival,
        Date.parse(zonedInstant(`${day}T${open}`, tz)),
      );
      return arrival < Date.parse(zonedInstant(`${day}T${close}`, tz, "later"))
        ? arrival
        : NaN;
    }
    // Overnight: before closing belongs to the previous day's opening window.
    if (time < close || time >= open) return arrival;
    return Date.parse(zonedInstant(`${day}T${open}`, tz));
  } catch {
    return NaN;
  }
}
/** Additive metadata migration: old private records and event timestamps survive. */
export function migrateLocation(s: State): State {
  s.location ??= { ...DEFAULT_LOCATION };
  s.price_mode ??= "sample";
  for (const p of s.suppliers) {
    p.is_sample ??= true;
    p.timezone ??= "America/Los_Angeles";
  }
  return s;
}
