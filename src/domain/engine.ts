import { expiredQuantity } from "./perishables";
import type {
  State,
  Plan,
  PlanLine,
  QuantityMap,
  Offer,
  Recipe,
  RecipeCost,
  Derived,
} from "./types";
import {
  collectionTime,
  sourceReason,
  referenceOffer,
  historyFor,
  localDateTime,
} from "./location";

export function stockOf(s: State): QuantityMap {
  const stock = Object.fromEntries(s.ingredients.map((i) => [i.id, 0]));
  for (const e of s.inventory)
    stock[e.ingredient_id] = (stock[e.ingredient_id] ?? 0) + e.quantity_base;
  return stock;
}
export function stockConfidence(s: State, ingredientId: string) {
  const ingredient = s.ingredients.find((i) => i.id === ingredientId);
  if (ingredient?.confidence === "needs_checking") return "Needs checking";
  const last = s.inventory.findLast((e) => e.ingredient_id === ingredientId);
  return last &&
    ["opening_count", "count_reconciliation"].includes(last.event_type)
    ? "Owner confirmed"
    : "Ledger estimate";
}
export function finishedOf(s: State): QuantityMap {
  const stock: QuantityMap = {};
  for (const e of s.finished)
    stock[e.recipe_id] = (stock[e.recipe_id] ?? 0) + e.quantity;
  return stock;
}
export function budgetOf(s: State, replacingOrder?: string) {
  const spent = s.expenses.reduce((n, e) => n + e.cents, 0);
  const commitments = s.orders
    .filter(
      (o) =>
        o.id !== replacingOrder &&
        !o.paid &&
        o.status !== "Cancelled" &&
        o.status !== "Draft",
    )
    .reduce((n, o) => n + o.plan.total_cost_cents, 0);
  return {
    spent,
    commitments,
    available:
      s.settings.budget_cents -
      s.settings.cash_reserve_cents -
      spent -
      commitments,
  };
}
export function requirements(s: State) {
  const required = Object.fromEntries(s.ingredients.map((i) => [i.id, 0]));
  const batches: Plan["batches"] = [];
  if (s.production.status === "completed") return { required, batches };
  for (const item of s.production.items) {
    const r = s.recipes.find((x) => x.id === item.recipe_id);
    if (!r || r.yield_units <= 0) continue;
    const n = Math.ceil(item.planned_units / r.yield_units);
    batches.push({
      recipe_id: r.id,
      batches: n,
      units: n * r.yield_units,
      extra: n * r.yield_units - item.planned_units,
    });
    for (const row of r.ingredients)
      required[row.ingredient_id] =
        (required[row.ingredient_id] ?? 0) + n * row.quantity_base;
  }
  return { required, batches };
}
export function offerReason(s: State, o: Offer): string | null {
  const i = s.ingredients.find((x) => x.id === o.ingredient_id);
  const supplier = s.suppliers.find((x) => x.id === o.supplier_id);
  if (!i || !supplier) return "Unknown ingredient or supplier";
  const source = sourceReason(s, o);
  if (source) return source;
  if (
    o.product_specification !== i.product_specification &&
    !i.approved_substitutions?.includes(o.product_specification)
  )
    return "Unapproved specification substitution";
  if (o.base_unit && o.base_unit !== i.base_unit)
    return "Unit mismatch; confirmed conversion required";
  if (!Number.isSafeInteger(o.pack_quantity_base) || o.pack_quantity_base <= 0)
    return "Unknown package size";
  if (!Number.isSafeInteger(o.pack_price_cents) || o.pack_price_cents < 0)
    return "Invalid price";
  if (!o.valid_until || Date.parse(o.valid_until) < Date.parse(s.clock))
    return "Quote expired or validity unknown";
  if (!o.observed_at || Date.parse(o.observed_at) > Date.parse(s.clock))
    return "Price observation not yet available";
  if (o.currency !== "USD") return "Unmatched currency";
  if (o.availability !== "in_stock_demo" && o.availability !== "confirmed")
    return "Availability needs confirmation";
  if (o.membership_required || o.coupon_required)
    return "Membership or coupon not confirmed";
  if (s.settings.excluded_suppliers.includes(supplier.id))
    return "Supplier excluded by owner";
  if (s.settings.mode !== "mixed" && supplier.mode !== s.settings.mode)
    return "Outside selected shopping mode";
  const arrival = collectionTime(s, supplier, o);
  if (!Number.isFinite(arrival))
    return "Store closes before collection is possible";
  if (arrival > Date.parse(s.production.prep_starts_at))
    return "Arrives after preparation deadline";
  return null;
}

type Candidate = {
  lines: PlanLine[];
  goods: number;
  mask: number;
  minimumSpend: number[];
  quantity: number;
};
function key(c: Candidate) {
  return `${c.mask}|${c.minimumSpend.join(",")}`;
}
function retain(map: Map<string, Candidate>, c: Candidate) {
  const k = key(c),
    old = map.get(k);
  if (
    !old ||
    c.goods < old.goods ||
    (c.goods === old.goods && c.quantity < old.quantity)
  )
    map.set(k, c);
}

/** Exact bounded integer search: all pack quantities up to available storage;
 * DP preserves used suppliers and capped per-supplier minimum-order spend.
 * No unit-price shortcut and no use of the fixture's eligibility flags.
 */
export function optimize(
  s: State,
  options: {
    maxStops?: number;
    mode?: State["settings"]["mode"];
    replacingOrder?: string;
  } = {},
): Plan {
  const state = {
    ...s,
    settings: {
      ...s.settings,
      maximum_in_person_stops:
        options.maxStops ?? s.settings.maximum_in_person_stops,
      mode: options.mode ?? s.settings.mode,
    },
  };
  const stock = stockOf(state),
    { required, batches } = requirements(state),
    incoming: QuantityMap = {},
    issues: string[] = [];
  const budgets = budgetOf(state, options.replacingOrder);
  if (
    s.orders.some(
      (o) =>
        o.stale &&
        !["Cancelled", "Received", "Draft"].includes(o.status) &&
        (o.paid ||
          Object.values(o.received).some(Boolean) ||
          o.status === "Simulated order submitted"),
    )
  )
    issues.push(
      "Finish receiving outstanding executed orders before approving a plan with changed inputs.",
    );
  for (const order of s.orders) {
    if (
      order.id === options.replacingOrder ||
      order.status === "Cancelled" ||
      order.status === "Draft" ||
      order.stale
    )
      continue;
    for (const line of order.plan.lines) {
      const offer = s.offers.find((o) => o.id === line.offer_id);
      if (offer && !offerReason(state, offer))
        incoming[line.ingredient_id] =
          (incoming[line.ingredient_id] ?? 0) +
          Math.max(
            0,
            line.quantity_base - (order.received[line.offer_id] ?? 0),
          );
    }
  }
  const shortfalls: QuantityMap = {};
  for (const i of s.ingredients) {
    const usable =
      !i.expires_at ||
      Date.parse(i.expires_at) >= Date.parse(s.production.prep_starts_at);
    shortfalls[i.id] = Math.max(
      0,
      required[i.id] -
        (usable
          ? stock[i.id] - expiredQuantity(s, i.id, s.production.prep_starts_at)
          : 0) -
        (incoming[i.id] ?? 0),
    );
    if (required[i.id] > 0 && i.confidence === "needs_checking")
      issues.push(`${i.name}: stock needs checking`);
    if (!usable && stock[i.id] > 0)
      issues.push(
        `${i.name}: existing stock expires before preparation; reconcile or remove it`,
      );
  }
  if (!s.production.items.length && s.production.status !== "completed")
    issues.push("Add confirmed recipes and a production plan");
  if (
    Date.parse(s.production.prep_starts_at) < Date.parse(s.clock) &&
    s.production.status !== "completed"
  )
    issues.push("Preparation deadline is in the past");
  for (const item of s.production.items)
    if (!s.recipes.find((r) => r.id === item.recipe_id))
      issues.push("Production references an unconfirmed recipe");
  const exclusions: Plan["exclusions"] = [];
  const eligible = state.offers.filter((o) => {
    const reason = offerReason(state, o);
    if (reason) exclusions.push({ offer_id: o.id, reason });
    return !reason;
  });
  const minimumSuppliers = state.suppliers.filter(
    (x) => x.minimum_order_cents > 0,
  );
  const zero: Candidate = {
    lines: [],
    goods: 0,
    mask: 0,
    minimumSpend: minimumSuppliers.map(() => 0),
    quantity: 0,
  };
  let dp = new Map<string, Candidate>([[key(zero), zero]]);
  let operations = 0;
  for (const ingredient of s.ingredients) {
    const need = shortfalls[ingredient.id],
      offers = eligible.filter((o) => o.ingredient_id === ingredient.id);
    const capacity = Math.max(
      0,
      ingredient.max_storage_base -
        stock[ingredient.id] -
        (incoming[ingredient.id] ?? 0),
    );
    const candidates = new Map<string, Candidate>();
    function enumerate(index: number, candidate: Candidate) {
      if (++operations > 300000)
        throw new Error(
          "This request exceeds the bounded demo solver. Reduce storage limits or the number of offers.",
        );
      if (index === offers.length) {
        if (candidate.quantity >= need) retain(candidates, candidate);
        return;
      }
      const o = offers[index],
        supplierIndex = state.suppliers.findIndex(
          (x) => x.id === o.supplier_id,
        );
      const max = Math.min(
        Math.floor((capacity - candidate.quantity) / o.pack_quantity_base),
        o.maximum_packs ?? Infinity,
        minimumSuppliers.length &&
          offers.some((p) =>
            minimumSuppliers.some((m) => m.id === p.supplier_id),
          )
          ? Infinity
          : Math.ceil(need / o.pack_quantity_base),
      );
      for (let n = 0; n <= max; n++) {
        const cost = n * (o.pack_price_cents + (o.tax_cents_per_pack ?? 0));
        const mask = n ? candidate.mask | (1 << supplierIndex) : candidate.mask;
        const stops = state.suppliers.filter(
          (p, idx) => p.mode === "in_store" && mask & (1 << idx),
        ).length;
        if (stops > state.settings.maximum_in_person_stops) continue;
        const minimumSpend = candidate.minimumSpend.map((x, idx) =>
          Math.min(
            minimumSuppliers[idx].minimum_order_cents,
            x + (minimumSuppliers[idx].id === o.supplier_id ? cost : 0),
          ),
        );
        enumerate(index + 1, {
          mask,
          minimumSpend,
          goods: candidate.goods + cost,
          quantity: candidate.quantity + n * o.pack_quantity_base,
          lines: n
            ? [
                ...candidate.lines,
                {
                  ingredient_id: ingredient.id,
                  offer_id: o.id,
                  supplier_id: o.supplier_id,
                  packs: n,
                  quantity_base: n * o.pack_quantity_base,
                  line_cost_cents: cost,
                },
              ]
            : candidate.lines,
        });
      }
    }
    enumerate(0, structuredClone(zero));
    const next = new Map<string, Candidate>();
    for (const a of dp.values())
      for (const b of candidates.values()) {
        const mask = a.mask | b.mask;
        if (
          state.suppliers.filter(
            (p, idx) => p.mode === "in_store" && mask & (1 << idx),
          ).length > state.settings.maximum_in_person_stops
        )
          continue;
        retain(next, {
          mask,
          minimumSpend: a.minimumSpend.map((x, i) =>
            Math.min(
              minimumSuppliers[i].minimum_order_cents,
              x + b.minimumSpend[i],
            ),
          ),
          goods: a.goods + b.goods,
          quantity: a.quantity + b.quantity,
          lines: [...a.lines, ...b.lines],
        });
        if (next.size > 40000)
          throw new Error(
            "Too many combinations for the demo solver; narrow the supplier selection.",
          );
      }
    dp = next;
  }
  let best: Candidate | undefined,
    total = Infinity,
    travel = 0,
    shipping = 0;
  for (const c of dp.values()) {
    const used = state.suppliers.filter((_, i) => c.mask & (1 << i));
    if (
      minimumSuppliers.some(
        (supplier, i) =>
          used.some((x) => x.id === supplier.id) &&
          c.minimumSpend[i] < supplier.minimum_order_cents,
      )
    )
      continue;
    const t = used.reduce((n, x) => n + x.estimated_trip_cash_cost_cents, 0),
      sh = used.reduce((n, x) => n + (x.shipping_cents ?? 0), 0);
    if (
      c.goods + t + sh < total ||
      (c.goods + t + sh === total && c.quantity < (best?.quantity ?? Infinity))
    ) {
      best = c;
      total = c.goods + t + sh;
      travel = t;
      shipping = sh;
    }
  }
  const bought: QuantityMap = {};
  for (const l of best?.lines ?? [])
    bought[l.ingredient_id] = (bought[l.ingredient_id] ?? 0) + l.quantity_base;
  const leftovers = Object.fromEntries(
    s.ingredients.map((i) => [
      i.id,
      stock[i.id] +
        (incoming[i.id] ?? 0) +
        (bought[i.id] ?? 0) -
        required[i.id],
    ]),
  );
  if (!best)
    issues.push(
      "No eligible package combination fits supply, storage, store limits and order minimums.",
    );
  const gap = best ? Math.max(0, total - budgets.available) : 0;
  return {
    status: !best
      ? "no_supply_feasible_plan"
      : issues.length
        ? "needs_review"
        : gap > 0
          ? "budget_infeasible"
          : "feasible",
    lines: best?.lines ?? [],
    total_cost_cents: best ? total : 0,
    goods_cost_cents: best?.goods ?? 0,
    estimated_trip_cost_cents: travel,
    shipping_cents: shipping,
    supplier_ids: [
      ...new Set(best?.lines.map((l) => l.supplier_id) ?? []),
    ].sort(),
    required,
    shortfalls,
    stock,
    incoming,
    leftovers,
    cash_available_cents: budgets.available,
    funding_gap_cents: gap,
    exclusions,
    issues,
    batches,
    calculated_at: s.clock,
    input_version: s.plan_version,
  };
}

export function recipeCost(s: State, recipe: Recipe): RecipeCost {
  // Explicit fixed source policy: owner-entered sample Market quotes, never pack cash outlay.
  let batch = 0,
    partial = false;
  for (const line of recipe.ingredients) {
    const offer = referenceOffer(s, line.ingredient_id);
    if (!offer) {
      partial = true;
      continue;
    }
    batch +=
      (line.quantity_base *
        (offer.pack_price_cents + (offer.tax_cents_per_pack ?? 0))) /
      offer.pack_quantity_base;
  }
  const ingredientCents = Math.round(batch / recipe.yield_units);
  partial ||=
    recipe.variable_labor_cents_per_batch === null ||
    recipe.packaging_cents_per_unit === null ||
    recipe.energy_cents_per_batch === null;
  const variableCents = Math.round(
    (batch +
      (recipe.variable_labor_cents_per_batch ?? 0) +
      (recipe.energy_cents_per_batch ?? 0)) /
      recipe.yield_units +
      (recipe.packaging_cents_per_unit ?? 0),
  );
  return {
    ingredientCents,
    variableCents,
    allocatedCents: variableCents + recipe.allocated_overhead_cents_per_unit,
    contributionCents: recipe.selling_price_cents - variableCents,
    margin: recipe.selling_price_cents
      ? (recipe.selling_price_cents - variableCents) /
        recipe.selling_price_cents
      : 0,
    partial,
  };
}
export function suggestedPrice(
  cost: number,
  targetMargin: number,
  roundingCents: number,
) {
  if (!(targetMargin >= 0 && targetMargin < 1) || roundingCents <= 0)
    throw new Error(
      "Margin must be from 0% up to, but not including, 100%; rounding must be positive.",
    );
  return Math.ceil(cost / (1 - targetMargin) / roundingCents) * roundingCents;
}
export function purchasingPower(s: State) {
  const history = s.ingredients.flatMap((i) => historyFor(s, i.id));
  const dates = [...new Set(history.map((p) => p.date))].sort();
  const baseDate = dates[0] ?? "",
    currentDate = localDateTime(s.clock, s.timezone).slice(0, 10);
  let baseCost = 0,
    currentCost = 0,
    partial = s.index_basket.length === 0,
    hasHistory = s.index_basket.length > 0;
  for (const b of s.index_basket) {
    const current = referenceOffer(s, b.ingredient_id);
    const base = history.find(
      (p) =>
        p.ingredient_id === b.ingredient_id &&
        p.supplier_id === current?.supplier_id,
    );
    partial ||= !current;
    hasHistory &&= !!base;
    if (base)
      baseCost +=
        (b.quantity_base * base.pack_price_cents) / base.pack_quantity_base;
    if (current)
      currentCost +=
        (b.quantity_base *
          (current.pack_price_cents + (current.tax_cents_per_pack ?? 0))) /
        current.pack_quantity_base;
  }
  baseCost = Math.round(baseCost);
  currentCost = Math.round(currentCost);
  return {
    baseCost,
    currentCost,
    index: baseCost ? (100 * currentCost) / baseCost : 0,
    equivalents: currentCost
      ? Math.max(0, budgetOf(s).available) / currentCost
      : 0,
    baseDate,
    currentDate,
    partial,
    hasHistory,
    basis:
      s.price_mode === "sample"
        ? "Sample Market quotes"
        : "Local benchmark suppliers · owner-entered",
  };
}
export function derive(s: State): Derived {
  return {
    plan: optimize(s),
    oneStore: optimize(s, { maxStops: 1, mode: "in_store" }),
    online: optimize(s, { mode: "online" }),
    stock: stockOf(s),
    finished: finishedOf(s),
    ...budgetOf(s),
    purchasingPower: purchasingPower(s),
    costs: Object.fromEntries(s.recipes.map((r) => [r.id, recipeCost(s, r)])),
  };
}
export function scenario(
  s: State,
  pricePercent: number,
  productionPercent: number,
  maxStops: number,
  budget: number,
  ingredientId = "butter",
) {
  const draft = structuredClone(s);
  draft.offers = draft.offers.map((o) =>
    o.ingredient_id === ingredientId
      ? {
          ...o,
          pack_price_cents: Math.round(
            o.pack_price_cents * (1 + pricePercent / 100),
          ),
        }
      : o,
  );
  draft.production.items = draft.production.items.map((i) => ({
    ...i,
    planned_units: Math.ceil(i.planned_units * (1 + productionPercent / 100)),
  }));
  draft.settings.maximum_in_person_stops = maxStops;
  draft.settings.budget_cents = budget;
  return { state: draft, result: derive(draft) };
}
