import { describe, it, expect } from "vitest";
import { seedState } from "../src/domain/seed";
import { applyAction } from "../src/domain/service";
import {
  stockOf,
  optimize,
  requirements,
  finishedOf,
  scenario,
} from "../src/domain/engine";
import { assignedQuantity, expiredQuantity } from "../src/domain/perishables";
import { previewCsv, commitCsv } from "../src/domain/imports";
const item = {
  type: "catalog_item",
  name: "Coffee beans",
  name_vi: "",
  category: "ingredient",
  base_unit: "g",
  count_unit: "units",
  product_specification: "Roasted coffee beans",
  max_storage_base: 20000,
  reorder_point_base: 1000,
  operation_key: "coffee",
};
function coffee() {
  let s = applyAction(seedState(), item);
  const id = s.ingredients.at(-1)!.id;
  s = applyAction(s, {
    type: "count",
    ingredient_id: id,
    quantity_base: 0,
    observed_at: s.clock,
    operation_key: "count-coffee",
  });
  s = applyAction(s, {
    type: "recipe",
    recipe: {
      id: "coffee",
      name: "Coffee service",
      yield_units: 10,
      batch_scaling: "whole_batches",
      version: 1,
      ingredients: [{ ingredient_id: id, quantity_base: 200 }],
      variable_labor_cents_per_batch: null,
      packaging_cents_per_unit: null,
      energy_cents_per_batch: null,
      allocated_overhead_cents_per_unit: 0,
      selling_price_cents: 350,
    },
  });
  s = applyAction(s, {
    type: "production",
    items: [{ recipe_id: "coffee", planned_units: 25 }],
    prep_starts_at: s.production.prep_starts_at,
    ready_for_sale_at: s.production.ready_for_sale_at,
  });
  s.offers.push({
    ...s.offers[0],
    id: "coffee_quote",
    ingredient_id: id,
    product_specification: "Roasted coffee beans",
    pack_quantity_base: 500,
    pack_price_cents: 700,
  });
  return { s, id };
}
describe("food businesses share the same purchasing and stock engine", () => {
  it("adds a custom item without invented quantities or prices, deduplicates retries and rejects alias collisions", () => {
    const s = applyAction(seedState(), item);
    expect(s.ingredients.at(-1)).toMatchObject({
      name: "Coffee beans",
      confidence: "needs_checking",
    });
    expect(stockOf(s)[s.ingredients.at(-1)!.id]).toBe(0);
    expect(s.offers).toEqual(seedState().offers);
    expect(applyAction(s, item)).toEqual(s);
    expect(() =>
      applyAction(s, {
        ...item,
        operation_key: "again",
        name: "  coffee   BEANS ",
      }),
    ).toThrow(/already exists/);
    expect(() =>
      applyAction(s, {
        ...item,
        name: "Cups",
        operation_key: "cups",
        reorder_point_base: 99999,
      }),
    ).toThrow(/capacity/);
  });
  it("computes custom café demand, recalculates a selected-item scenario, and completes the ledger once", () => {
    const initial = coffee(),
      id = initial.id;
    let s = initial.s;
    const plan = optimize(s);
    expect(plan.required[id]).toBe(600);
    expect(plan.lines[0].packs).toBe(2);
    const original = structuredClone(s);
    expect(
      scenario(s, 50, 0, 2, 10000, id).result.plan.total_cost_cents,
    ).toBeGreaterThan(plan.total_cost_cents);
    expect(s).toEqual(original);
    s = applyAction(s, {
      type: "approve",
      plan_version: s.plan_version,
      operation_key: "approve",
    });
    expect(stockOf(s)[id]).toBe(0);
    const receive = {
      type: "receive",
      order_id: s.orders[0].id,
      quantities: { coffee_quote: 1000 },
      operation_key: "received",
    };
    s = applyAction(s, receive);
    s = applyAction(s, { ...receive, operation_key: "received-again" });
    expect(stockOf(s)[id]).toBe(1000);
    s = applyAction(s, { type: "complete_production", operation_key: "make" });
    expect(stockOf(s)[id]).toBe(400);
    expect(finishedOf(s).coffee).toBe(30);
    s = applyAction(s, {
      type: "sell",
      recipe_id: "coffee",
      quantity: 20,
      operation_key: "sell",
    });
    expect(stockOf(s)[id]).toBe(400);
    expect(finishedOf(s).coffee).toBe(10);
  });
  it("expires lots for planning without deleting physical stock and consumes only usable lots", () => {
    const initial = coffee(),
      id = initial.id;
    let s = initial.s;
    s = applyAction(s, {
      type: "count",
      ingredient_id: id,
      quantity_base: 1000,
      observed_at: s.clock,
      operation_key: "onhand",
    });
    const earlier = new Date(
        Date.parse(s.production.prep_starts_at) - 3600000,
      ).toISOString(),
      later = new Date(
        Date.parse(s.production.prep_starts_at) + 86400000,
      ).toISOString();
    s = applyAction(s, {
      type: "lot",
      ingredient_id: id,
      label: "Old delivery",
      quantity_base: 500,
      use_by: earlier,
      operation_key: "old-lot",
    });
    s = applyAction(s, {
      type: "lot",
      ingredient_id: id,
      label: "New delivery",
      quantity_base: 500,
      use_by: later,
      operation_key: "new-lot",
    });
    expect(stockOf(s)[id]).toBe(1000);
    expect(expiredQuantity(s, id, s.production.prep_starts_at)).toBe(500);
    expect(optimize(s).shortfalls[id]).toBe(100);
    expect(() =>
      applyAction(s, {
        type: "complete_production",
        operation_key: "too-soon",
      }),
    ).toThrow(/Receive enough/);
    s = applyAction(s, {
      type: "production",
      items: [{ recipe_id: "coffee", planned_units: 20 }],
      prep_starts_at: s.production.prep_starts_at,
      ready_for_sale_at: s.production.ready_for_sale_at,
    });
    s = applyAction(s, { type: "complete_production", operation_key: "make" });
    expect(s.lots?.find((l) => l.id === "old-lot")?.remaining_base).toBe(500);
    expect(s.lots?.find((l) => l.id === "new-lot")?.remaining_base).toBe(100);
    s = applyAction(s, {
      type: "waste",
      ingredient_id: id,
      quantity_base: 500,
      operation_key: "discard",
    });
    expect(stockOf(s)[id]).toBe(100);
    expect(assignedQuantity(s, id)).toBe(100);
  });
  it("prevents overlabelling and clears lot allocation on a new physical count", () => {
    let s = seedState();
    s = applyAction(s, {
      type: "lot",
      ingredient_id: "flour",
      label: "Bag",
      quantity_base: 10000,
      use_by: s.production.ready_for_sale_at,
      operation_key: "lot",
    });
    expect(() =>
      applyAction(s, {
        type: "lot",
        ingredient_id: "flour",
        label: "Bag2",
        quantity_base: 10000,
        use_by: s.production.ready_for_sale_at,
        operation_key: "lot2",
      }),
    ).toThrow(/exceeds/);
    s = applyAction(s, {
      type: "count",
      ingredient_id: "flour",
      quantity_base: 6000,
      observed_at: s.clock,
      operation_key: "recount",
    });
    expect(assignedQuantity(s, "flour")).toBe(0);
    expect(stockOf(s).flour).toBe(6000);
  });
  it("saves service plans without commitments, prevents overlapping activation and reuses the remaining ledger", () => {
    let { s } = coffee();
    const before = structuredClone(s);
    s = applyAction(s, {
      type: "queue_production",
      label: "Saturday café",
      items: [{ recipe_id: "coffee", planned_units: 10 }],
      prep_starts_at: s.production.prep_starts_at,
      ready_for_sale_at: s.production.ready_for_sale_at,
      operation_key: "queue",
    });
    expect(s.plan_version).toBe(before.plan_version);
    expect(s.production).toEqual(before.production);
    expect(s.inventory).toEqual(before.inventory);
    expect(() =>
      applyAction(s, {
        type: "activate_production",
        production_id: s.production_queue![0].id,
      }),
    ).toThrow(/Complete/);
    s.production.status = "completed";
    s = applyAction(s, {
      type: "activate_production",
      production_id: s.production_queue![0].id,
    });
    expect(s.production.label).toBe("Saturday café");
    expect(requirements(s).required[s.ingredients.at(-1)!.id]).toBe(200);
    expect(s.production_queue).toHaveLength(0);
    expect(s.production_history?.at(-1)?.status).toBe("completed");
  });
  it("imports validated local supplier quotes once and blocks partial imports", () => {
    let s = seedState("owner", "owner");
    s.location = {
      country: "US",
      city: "Boston",
      state: "MA",
      postal_code: "02108",
    };
    s = applyAction(s, {
      type: "local_supplier",
      name: "Supplier",
      address: "",
      mode: "in_store",
      ready_at: s.clock,
      timezone: s.timezone,
      hours: "00:00-23:59",
      estimated_trip_cash_cost_cents: 0,
      minimum_order_cents: 0,
      shipping_cents: 0,
    });
    const header =
        "supplier,ingredient,quantity,unit,pack_price_usd,tax_usd,maximum_packs,availability,observed_at,valid_until,source_label\n",
      row = `Supplier,flour,1,kg,3.25,0.00,10,confirmed,${s.clock},${new Date(Date.parse(s.clock) + 86400000).toISOString()},My supplier list`;
    const csv = header + row;
    expect(previewCsv(s, csv, "quotes").errors).toEqual([]);
    const next = commitCsv(s, csv, "quotes", "upload");
    expect(next.offers[0].pack_price_cents).toBe(325);
    expect(next.price_history).toHaveLength(1);
    expect(commitCsv(next, csv, "quotes", "upload")).toEqual(next);
    expect(
      previewCsv(s, header + row.replace("3.25", "bad"), "quotes").errors
        .length,
    ).toBeGreaterThan(0);
    expect(s.offers).toHaveLength(0);
  });
  it("uses live owner time and blocks future production completion", () => {
    const s = seedState("owner", "owner");
    expect(s.clock_mode).toBe("live");
    expect(() =>
      applyAction(s, { type: "complete_production", operation_key: "future" }),
    ).toThrow(/not started/);
  });
});
