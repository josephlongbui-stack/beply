import { describe, it, expect } from "vitest";
import { Repository } from "../src/server/repository";
import { seedState } from "../src/domain/seed";
import { applyAction } from "../src/domain/service";
import { derive, stockOf, optimize } from "../src/domain/engine";

describe("input-first workspaces and invoice reconciliation", () => {
  it("creates empty owner records while keeping the computed sample opt-in and isolated", () => {
    const db = new Repository(":memory:");
    const auth = db.createSession();
    const owner = db.read(auth.session, auth.workspace);
    expect(owner.kind).toBe("owner");
    for (const field of [
      "recipes",
      "inventory",
      "offers",
      "suppliers",
      "price_history",
      "index_basket",
      "expenses",
      "orders",
    ] as const)
      expect(owner[field]).toEqual([]);
    expect(owner.production.items).toEqual([]);
    expect(owner.location.city).toBe("");
    expect(owner.settings.budget_cents).toBe(0);
    expect(derive(owner).purchasingPower.partial).toBe(true);
    const sample = db.switch(auth.session, "sample");
    expect(optimize(sample).total_cost_cents).toBe(7780);
    db.mutate(auth.session, sample.id, (s) =>
      applyAction(s, {
        type: "settings",
        settings: { ...s.settings, budget_cents: 8500 },
      }),
    );
    expect(db.switch(auth.session, "owner")).toEqual({
      ...owner,
      clock: expect.any(String),
    });
    expect(db.switch(auth.session, "sample").settings.budget_cents).toBe(8500);
    db.db.close();
  });
  it("builds the fixed basket from first confirmed production, not fixture quantities", () => {
    let s = seedState("owner", "owner");
    const recipe = {
      ...seedState().recipes[0],
      id: "my_recipe",
      name: "My bread",
      yield_units: 12,
      ingredients: [{ ingredient_id: "flour", quantity_base: 900 }],
    };
    s = applyAction(s, { type: "recipe", recipe });
    s = applyAction(s, {
      type: "production",
      items: [{ recipe_id: recipe.id, planned_units: 25 }],
      prep_starts_at: s.production.prep_starts_at,
      ready_for_sale_at: s.production.ready_for_sale_at,
    });
    expect(derive(s).plan.required.flour).toBe(2700);
    expect(s.index_basket).toEqual([
      {
        ingredient_id: "flour",
        quantity_base: 2700,
        comparison_supplier_id: "local",
      },
    ]);
    s = applyAction(s, {
      type: "production",
      items: [{ recipe_id: recipe.id, planned_units: 48 }],
      prep_starts_at: s.production.prep_starts_at,
      ready_for_sale_at: s.production.ready_for_sale_at,
    });
    expect(derive(s).plan.required.flour).toBe(3600);
    expect(s.index_basket[0].quantity_base).toBe(2700);
  });
  it("an invoice draft starts with no payment, delivery or extracted lines", () => {
    const s = applyAction(seedState("owner", "owner"), {
      type: "manual_document",
      kind: "invoice",
    });
    expect(s.documents[0]).toMatchObject({
      type: "invoice",
      paid: false,
      received: false,
      lines: [],
      mode: "manual",
      supplier_id: "unassigned",
    });
    expect(s.inventory).toEqual([]);
    expect(s.expenses).toEqual([]);
  });
  it("later receipt evidence completes an invoice exactly once and preserves both sources", () => {
    let s = applyAction(seedState(), {
      type: "manual_document",
      kind: "invoice",
    });
    const invoice = {
      ...s.documents[0],
      external_id: "purchase_42",
      supplier_id: "market_a",
      lines: [
        { ingredient_id: "flour", quantity_base: 5000, line_total_cents: 800 },
      ],
    };
    s = applyAction(s, { type: "review_document", document: invoice });
    expect(stockOf(s).flour).toBe(12000);
    expect(s.expenses).toHaveLength(0);
    s = applyAction(s, { type: "manual_document", kind: "receipt" });
    const receipt = {
      ...s.documents[0],
      external_id: invoice.external_id,
      supplier_id: invoice.supplier_id,
      lines: invoice.lines,
      paid: true,
      received: true,
    };
    s = applyAction(s, { type: "review_document", document: receipt });
    expect(stockOf(s).flour).toBe(17000);
    expect(s.expenses).toHaveLength(1);
    expect(s.documents.find((d) => d.id === invoice.id)).toMatchObject({
      paid: true,
      received: true,
      status: "Confirmed",
    });
    expect(s.documents.find((d) => d.id === receipt.id)).toMatchObject({
      status: "Linked",
      linked_purchase: invoice.id,
    });
    s = applyAction(s, { type: "review_document", document: receipt });
    expect(stockOf(s).flour).toBe(17000);
    expect(s.expenses).toHaveLength(1);
  });
  it("conflicting evidence for an existing invoice cannot silently replace its facts", () => {
    let s = applyAction(seedState(), {
      type: "manual_document",
      kind: "invoice",
    });
    const invoice = {
      ...s.documents[0],
      external_id: "conflict",
      supplier_id: "market_a",
      lines: [
        { ingredient_id: "flour", quantity_base: 1000, line_total_cents: 800 },
      ],
    };
    s = applyAction(s, { type: "review_document", document: invoice });
    s = applyAction(s, { type: "manual_document", kind: "receipt" });
    expect(() =>
      applyAction(s, {
        type: "review_document",
        document: {
          ...s.documents[0],
          external_id: "conflict",
          supplier_id: "market_a",
          lines: [
            {
              ingredient_id: "flour",
              quantity_base: 5000,
              line_total_cents: 800,
            },
          ],
          received: true,
        },
      }),
    ).toThrow(/different reviewed details/);
    expect(stockOf(s).flour).toBe(12000);
  });
});
