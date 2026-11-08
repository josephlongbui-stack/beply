import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedState } from "../src/domain/seed";
import { applyAction, contentHash } from "../src/domain/service";
import {
  optimize,
  stockOf,
  budgetOf,
  requirements,
} from "../src/domain/engine";
import { forecast } from "../src/domain/forecast";
import { previewCsv, commitCsv } from "../src/domain/imports";
import { Repository } from "../src/server/repository";
import { sampleExtraction } from "../src/server/providers";
describe("validation and integration boundaries", () => {
  it("preserves the named baseline with an approved snapshot", () => {
    const s = applyAction(seedState(), {
      type: "approve",
      plan_version: 1,
      operation_key: "baseline",
    });
    expect(s.orders[0].baseline).toEqual({
      name: "Best eligible one-store plan",
      total_cost_cents: 9330,
    });
    expect(s.orders[0].input_snapshot?.inventory).toHaveLength(6);
  });
  it("honors online lead time, shipping and minimum orders; submission is simulated", () => {
    let s = seedState();
    s.production.prep_starts_at = "2026-10-27T20:00:00-07:00";
    s.settings.mode = "online";
    s.settings.budget_cents = 30000;
    const p = optimize(s);
    expect(p.status).toBe("feasible");
    expect(p.shipping_cents).toBe(800);
    expect(p.goods_cost_cents).toBeGreaterThanOrEqual(6000);
    s = applyAction(s, {
      type: "approve",
      plan_version: s.plan_version,
      operation_key: "appr",
    });
    const before = stockOf(s);
    s = applyAction(s, { type: "submit", order_id: s.orders[0].id });
    expect(s.orders[0].status).toBe("Simulated order submitted");
    expect(s.orders[0].simulated_reference).toMatch(/^SIM-/);
    expect(stockOf(s)).toEqual(before);
    expect(s.expenses).toHaveLength(0);
    s.suppliers.find((p) => p.mode === "online")!.minimum_order_cents = 1000000;
    expect(optimize({ ...s, orders: [] }).status).toBe(
      "no_supply_feasible_plan",
    );
  });
  it("paid but undelivered document is not stock, and later receipt posts once", () => {
    let s = applyAction(seedState(), { type: "sample", sample: "receipt" });
    let doc = { ...s.documents[0], received: false };
    s = applyAction(s, { type: "review_document", document: doc });
    expect(stockOf(s).flour).toBe(12000);
    expect(budgetOf(s).spent).toBe(800);
    doc = { ...s.documents[0], received: true };
    s = applyAction(s, { type: "review_document", document: doc });
    expect(stockOf(s).flour).toBe(17000);
    expect(s.expenses).toHaveLength(1);
    s = applyAction(s, { type: "review_document", document: doc });
    expect(stockOf(s).flour).toBe(17000);
  });
  it("waste is idempotent and preserves paid expenses", () => {
    const s = seedState(),
      action = {
        type: "waste",
        ingredient_id: "flour",
        quantity_base: 1000,
        operation_key: "waste",
      };
    const next = applyAction(s, action);
    expect(stockOf(next).flour).toBe(11000);
    expect(applyAction(next, action).inventory).toEqual(next.inventory);
    expect(next.expenses).toEqual(s.expenses);
    expect(() => applyAction(s, { ...action, quantity_base: 13000 })).toThrow(
      /exceed/,
    );
  });
  it("unknown availability, unit mismatch, exclusions and coupons block offers", () => {
    for (const mutation of [
      { availability: "unknown" },
      { base_unit: "ml" },
      { coupon_required: true },
    ]) {
      const s = seedState();
      Object.assign(
        s.offers.find((o) => o.id === "market_a_flour")!,
        mutation,
      );
      expect(
        optimize(s).lines.some((l) => l.offer_id === "market_a_flour"),
      ).toBe(false);
    }
    const s = seedState();
    s.settings.excluded_suppliers = ["warehouse_b"];
    expect(optimize(s).supplier_ids).toEqual(["market_a"]);
  });
  it("expired stock and closed-store collection require review", () => {
    const s = seedState();
    s.ingredients[0].expires_at = "2026-10-23T20:00:00-07:00";
    expect(optimize(s).status).toBe("needs_review");
    s.ingredients[0].expires_at = undefined;
    s.clock = "2026-10-24T23:00:00-07:00";
    s.production.prep_starts_at = "2026-10-25T20:00:00-07:00";
    expect(optimize(s).status).toBe("no_supply_feasible_plan");
  });
  it("sample matching uses bytes, not filenames, and images match the manifest", () => {
    const s = seedState(),
      bytes = readFileSync("public/samples/receipt.svg"),
      manifest = JSON.parse(
        readFileSync("public/samples/manifest.json", "utf8"),
      );
    expect(contentHash(bytes)).toBe(manifest.receipt);
    expect(sampleExtraction.extract(bytes, s)?.lines).toEqual([
      { ingredient_id: "flour", quantity_base: 5000, line_total_cents: 800 },
    ]);
    expect(bytes.toString()).toContain("Bread flour: 5000 g");
    expect(bytes.toString()).toContain("Item total: $8.00");
    expect(
      sampleExtraction.extract(
        Buffer.from("a different file named receipt.svg"),
        s,
      ),
    ).toBeNull();
  });
  it("forecast cannot see future observations and has an insufficient-data state", () => {
    const s = seedState(),
      history = s.price_history.filter(
        (p) => p.ingredient_id === "flour" && p.supplier_id === "market_a",
      ),
      base = forecast(history, s.clock);
    expect(base).toHaveLength(7);
    expect(forecast(history.slice(0, 6), s.clock)).toEqual([]);
    expect(
      forecast(
        [
          ...history,
          { ...history[0], date: "2027-01-01", pack_price_cents: 999999 },
        ],
        s.clock,
      ),
    ).toEqual(base);
  });
  it("recipe and production CSV templates validate and commit without a POS", () => {
    let s = seedState("guided", "guided");
    const recipes = readFileSync("demo/recipe_import.csv", "utf8"),
      prod = readFileSync("demo/production_import.csv", "utf8");
    expect(previewCsv(s, recipes, "recipes").errors).toEqual([]);
    s = commitCsv(s, recipes, "recipes", "doc");
    expect(s.recipes).toHaveLength(2);
    expect(previewCsv(s, prod, "production").errors).toEqual([]);
    s = commitCsv(s, prod, "production", "doc2");
    expect(requirements(s).required.flour).toBe(38000);
    expect(commitCsv(s, prod, "production", "doc2").revision).toBe(s.revision);
  });
  it("transaction rollback and optimistic concurrency preserve records", () => {
    const db = new Repository(":memory:"),
      auth = db.createSession(),
      before = db.read(auth.session, auth.workspace);
    expect(() =>
      db.mutate(auth.session, auth.workspace, (s) => {
        s.expenses.push({
          id: "bad",
          cents: 100,
          source: "test",
          occurred_at: s.clock,
        });
        db.save(auth.session, s);
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(db.read(auth.session, auth.workspace).expenses).toEqual([]);
    db.mutate(
      auth.session,
      auth.workspace,
      (s) =>
        applyAction(s, {
          type: "settings",
          settings: { ...s.settings, budget_cents: 12000 },
        }),
      before.revision,
    );
    expect(() =>
      db.mutate(auth.session, auth.workspace, (s) => s, before.revision),
    ).toThrow(/another view/);
    db.db.close();
  });
  it("SQLite persists across reopening and scratch reset preserves the sample", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-db-test-"));
    try {
      const path = join(dir, "data.sqlite");
      let db = new Repository(path);
      const auth = db.createSession();
      db.mutate(auth.session, auth.workspace, (s) =>
        applyAction(s, {
          type: "settings",
          settings: { ...s.settings, budget_cents: 9000 },
        }),
      );
      expect(() => db.switch(auth.session, "guided", true)).toThrow(
        /active workspace/,
      );
      db.switch(auth.session, "guided");
      db.switch(auth.session, "guided", true);
      db.switch(auth.session, "sample");
      db.db.close();
      db = new Repository(path);
      expect(db.read(auth.session, auth.workspace).settings.budget_cents).toBe(
        9000,
      );
      db.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
