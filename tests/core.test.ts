import { describe, it, expect } from "vitest";
import oracle from "../demo/expected_results.json";
import { seedState } from "../src/domain/seed";
import {
  optimize,
  stockOf,
  requirements,
  budgetOf,
  finishedOf,
  scenario,
  suggestedPrice,
  recipeCost,
} from "../src/domain/engine";
import { applyAction } from "../src/domain/service";
import { previewCsv, commitCsv, safeCsv } from "../src/domain/imports";
import { Repository } from "../src/server/repository";
import { readFileSync } from "node:fs";
import type { State } from "../src/domain/types";
const approve = (s: State) =>
  applyAction(s, {
    type: "approve",
    plan_version: s.plan_version,
    operation_key: "approve-1",
  });
const receiveAll = (s: State) =>
  applyAction(s, {
    type: "receive",
    order_id: s.orders[0].id,
    quantities: Object.fromEntries(
      s.orders[0].plan.lines.map((l) => [l.offer_id, l.quantity_base]),
    ),
    operation_key: "receive-1",
  });
describe("independent TypeScript reference computations", () => {
  it("reproduces requirements, shortages and every two-store line", () => {
    const s = seedState(),
      p = optimize(s);
    expect(requirements(s).required).toEqual(oracle.required_quantities_base);
    expect(p.shortfalls).toEqual(oracle.shortfalls_base);
    expect(p.total_cost_cents).toBe(oracle.two_store_plan.total_cost_cents);
    expect(p.goods_cost_cents).toBe(oracle.two_store_plan.goods_cost_cents);
    expect(p.estimated_trip_cost_cents).toBe(
      oracle.two_store_plan.estimated_trip_cost_cents,
    );
    expect(
      [...p.lines].sort((a, b) => a.offer_id.localeCompare(b.offer_id)),
    ).toEqual(
      [...oracle.two_store_plan.lines].sort((a, b) =>
        a.offer_id.localeCompare(b.offer_id),
      ),
    );
  });
  it("enforces one-store and reserve constraints", () => {
    const s = seedState();
    expect(optimize(s, { maxStops: 1 }).total_cost_cents).toBe(
      oracle.one_store_plan.total_cost_cents,
    );
    s.settings.budget_cents = 8500;
    const p = optimize(s);
    expect(p.status).toBe("budget_infeasible");
    expect(p.funding_gap_cents).toBe(oracle.tight_budget_case.shortfall_cents);
    expect(() => approve(s)).toThrow();
  });
  it("rejects expired, wrong-spec and late offers from data rules", () => {
    const p = optimize(seedState());
    expect(
      p.exclusions.find((e) => e.offer_id === "wrong_spec_flour")?.reason,
    ).toMatch(/specification/);
    expect(
      p.exclusions.find((e) => e.offer_id === "expired_butter_sale")?.reason,
    ).toMatch(/expired/);
    expect(
      p.exclusions.find((e) => e.offer_id === "online_c_flour")?.reason,
    ).toMatch(/deadline/);
  });
  it("recomputes quantities and quotes, rounds whole batches", () => {
    const s = seedState();
    s.production.items[0].planned_units = 301;
    const p = optimize(s);
    expect(p.batches[0]).toMatchObject({ batches: 4, units: 400, extra: 99 });
    expect(p.total_cost_cents).not.toBe(7780);
    s.offers.find((o) => o.id === "market_a_butter")!.pack_price_cents = 900;
    expect(optimize(s).total_cost_cents).not.toBe(p.total_cost_cents);
  });
  it("prevents insufficient storage and uncertain inventory approval", () => {
    const s = seedState();
    s.ingredients[0].max_storage_base = 20000;
    expect(optimize(s).status).toBe("no_supply_feasible_plan");
    s.ingredients[0].max_storage_base = 75000;
    s.ingredients[0].confidence = "needs_checking";
    expect(optimize(s).status).toBe("needs_review");
  });
  it("posts a paid, received flour receipt once and preserves total provenance", () => {
    let s = applyAction(seedState(), { type: "sample", sample: "receipt" });
    const doc = s.documents[0];
    s = applyAction(s, { type: "review_document", document: doc });
    expect(stockOf(s).flour).toBe(17000);
    expect(budgetOf(s).spent).toBe(oracle.after_receipt_actual_spend_cents);
    expect(optimize(s).total_cost_cents).toBe(
      oracle.after_confirmed_flour_receipt_plan.total_cost_cents,
    );
    expect(budgetOf(s).spent + optimize(s).total_cost_cents).toBe(
      oracle.after_receipt_actual_plus_remaining_plan_cents,
    );
    const twice = applyAction(s, { type: "review_document", document: doc });
    expect(twice.inventory).toEqual(s.inventory);
    expect(twice.expenses).toEqual(s.expenses);
  });
});
describe("ledger transitions", () => {
  it("approval commits cash, never on-hand stock or double reservations", () => {
    const s = seedState(),
      a = approve(s);
    expect(stockOf(a)).toEqual(stockOf(s));
    expect(budgetOf(a).commitments).toBe(7780);
    expect(optimize(a).shortfalls.flour).toBe(0);
    expect(approve(a).orders).toHaveLength(1);
  });
  it("partial receipts and repeated cumulative confirmation update once", () => {
    let s = approve(seedState());
    const id = s.orders[0].id;
    s = applyAction(s, {
      type: "receive",
      order_id: id,
      quantities: { warehouse_b_flour: 8000 },
      operation_key: "partial",
    });
    expect(stockOf(s).flour).toBe(20000);
    expect(s.orders[0].status).toBe("Partially received");
    expect(optimize(s).incoming.flour).toBe(22000);
    const repeated = applyAction(s, {
      type: "receive",
      order_id: id,
      quantities: { warehouse_b_flour: 8000 },
      operation_key: "repeat",
    });
    expect(stockOf(repeated)).toEqual(stockOf(s));
  });
  it("payment replaces commitment and leaves stock alone", () => {
    let s = approve(seedState());
    const old = stockOf(s);
    s = applyAction(s, { type: "pay", order_id: s.orders[0].id });
    expect(budgetOf(s)).toMatchObject({
      spent: 7780,
      commitments: 0,
      available: 2220,
    });
    expect(stockOf(s)).toEqual(old);
    expect(
      applyAction(s, { type: "pay", order_id: s.orders[0].id }).expenses,
    ).toHaveLength(1);
  });
  it("receives, produces once, sells without a second raw deduction", () => {
    let s = receiveAll(approve(seedState()));
    s = applyAction(s, {
      type: "complete_production",
      operation_key: "production-1",
    });
    expect(stockOf(s)).toEqual(
      oracle.ending_raw_inventory_after_receiving_and_producing_base,
    );
    expect(finishedOf(s)).toEqual({ baguette: 300, butter_bun: 100 });
    const raw = stockOf(s);
    s = applyAction(s, {
      type: "complete_production",
      operation_key: "production-repeat",
    });
    s = applyAction(s, {
      type: "sell",
      recipe_id: "baguette",
      quantity: 1,
      operation_key: "sale-1",
    });
    expect(stockOf(s)).toEqual(raw);
    expect(finishedOf(s).baguette).toBe(299);
  });
  it("blocks production without physical stock", () =>
    expect(() =>
      applyAction(approve(seedState()), {
        type: "complete_production",
        operation_key: "prod",
      }),
    ).toThrow(/Receive/));
  it("invalidates an unexecuted approval and releases commitment after edits", () => {
    let s = approve(seedState());
    s = applyAction(s, {
      type: "settings",
      settings: { ...s.settings, budget_cents: 12000 },
    });
    expect(s.orders[0]).toMatchObject({ stale: true, status: "Cancelled" });
    expect(budgetOf(s).commitments).toBe(0);
    expect(() =>
      applyAction(s, {
        type: "approve",
        plan_version: 1,
        operation_key: "stale",
      }),
    ).toThrow(/changed/);
  });
  it("reconciles counts, rejects backdating and preserves recipe snapshots", () => {
    let s = seedState();
    expect(() =>
      applyAction(s, {
        type: "count",
        ingredient_id: "flour",
        quantity_base: 15000,
        observed_at: "2026-10-23T12:00:00-07:00",
        operation_key: "count",
      }),
    ).toThrow(/Backdated/);
    s = applyAction(s, {
      type: "count",
      ingredient_id: "flour",
      quantity_base: 15000,
      observed_at: s.clock,
      operation_key: "count",
    });
    expect(stockOf(s).flour).toBe(15000);
    expect(s.inventory.at(-1)?.quantity_base).toBe(3000);
    s = receiveAll(approve(seedState()));
    s = applyAction(s, { type: "complete_production", operation_key: "prod" });
    const raw = stockOf(s);
    s = applyAction(s, {
      type: "recipe",
      recipe: { ...s.recipes[0], yield_units: 80 },
    });
    expect(s.production.completed_snapshot?.[0].yield_units).toBe(100);
    expect(stockOf(s)).toEqual(raw);
  });
});
describe("imports, economics and workspace isolation", () => {
  it("validates unknown units, mass/volume, malformed rows and safe exports", () => {
    const s = seedState(),
      csv = readFileSync("demo/purchase_import.csv", "utf8");
    expect(previewCsv(s, csv, "purchases").errors).toHaveLength(0);
    expect(
      previewCsv(s, csv.replace(",g,", ",case,"), "purchases").errors[0]
        .message,
    ).toMatch(/Unknown/);
    expect(
      previewCsv(s, csv.replace(",g,", ",L,"), "purchases").errors[0].message,
    ).toMatch(/mismatch/);
    expect(safeCsv([["=HYPERLINK(1)", "+1", "text"]])).toContain("'=HYPERLINK");
  });
  it("CSV and sample receipt link to one underlying purchase", () => {
    let s = commitCsv(
      seedState(),
      readFileSync("demo/purchase_import.csv", "utf8"),
      "purchases",
      "csv-source",
    );
    s = applyAction(s, { type: "sample", sample: "receipt" });
    expect(s.documents).toHaveLength(1);
    expect(stockOf(s).flour).toBe(17000);
    expect(s.expenses).toHaveLength(1);
  });
  it("statement matching never creates stock or payment", () => {
    let s = applyAction(seedState(), { type: "sample", sample: "receipt" });
    s = applyAction(s, { type: "review_document", document: s.documents[0] });
    s = applyAction(s, { type: "sample", sample: "statement" });
    const stock = stockOf(s);
    s = applyAction(s, {
      type: "review_document",
      document: {
        ...s.documents[0],
        linked_purchase: "demo_flour_receipt_001",
      },
    });
    expect(stockOf(s)).toEqual(stock);
    expect(s.expenses).toHaveLength(1);
  });
  it("isolates economic scenarios and validates pricing", () => {
    const s = seedState(),
      copy = JSON.stringify(s);
    const result = scenario(s, 20, 25, 1, 11000);
    expect(result.result.plan.total_cost_cents).not.toBe(
      optimize(s).total_cost_cents,
    );
    expect(JSON.stringify(s)).toBe(copy);
    expect(suggestedPrice(100, 0.5, 25)).toBe(200);
    expect(() => suggestedPrice(100, 1, 25)).toThrow();
    s.recipes[0].variable_labor_cents_per_batch = null;
    expect(recipeCost(s, s.recipes[0]).partial).toBe(true);
  });
  it("persists workspace records and enforces ownership on reads and writes", () => {
    const db = new Repository(":memory:"),
      a = db.createSession(),
      b = db.createSession();
    db.mutate(a.session, a.workspace, (s) =>
      applyAction(s, {
        type: "settings",
        settings: { ...s.settings, budget_cents: 8500 },
      }),
    );
    expect(db.read(a.session, a.workspace).settings.budget_cents).toBe(8500);
    expect(db.read(b.session, b.workspace).settings.budget_cents).toBe(0);
    expect(() => db.read(b.session, a.workspace)).toThrow(/access denied/);
    expect(() => db.save(b.session, db.read(a.session, a.workspace))).toThrow(
      /denied/,
    );
    db.db.close();
  });
});
