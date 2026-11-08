import { describe, it, expect } from "vitest";
import { seedState } from "../src/domain/seed";
import { applyAction } from "../src/domain/service";
import { derive, optimize, offerReason, stockOf } from "../src/domain/engine";
import {
  locationKey,
  localDateTime,
  zonedInstant,
  US_STATES,
  US_TIMEZONES,
  collectionTime,
  referenceOffer,
} from "../src/domain/location";
import { packageBaseQuantity } from "../src/domain/units";
import { Repository } from "../src/server/repository";
import type { State } from "../src/domain/types";
const ny = {
  country: "US" as const,
  city: "New York",
  state: "NY",
  postal_code: "10001",
};
function locate(s = seedState()) {
  return applyAction(s, {
    type: "location",
    name: "Beply Bakery",
    location: ny,
    timezone: "America/New_York",
    price_mode: "local",
  });
}
function supplier(s: State) {
  return applyAction(s, {
    type: "local_supplier",
    name: "Owner’s Market",
    address: "Owner-entered pickup address",
    mode: "in_store",
    ready_at: s.clock,
    timezone: s.timezone,
    hours: "07:00-23:00",
    estimated_trip_cash_cost_cents: 100,
    minimum_order_cents: 0,
    shipping_cents: 0,
  });
}
function quote(s: State, ingredient_id = "flour", price = 900) {
  return applyAction(s, {
    type: "local_quote",
    supplier_id: s.suppliers.at(-1)!.id,
    ingredient_id,
    package_quantity:
      ingredient_id === "flour" ? 5000 : ingredient_id === "eggs" ? 12 : 1000,
    package_unit:
      ingredient_id === "eggs" ? "each" : ingredient_id === "milk" ? "ml" : "g",
    pack_price_cents: price,
    tax_cents_per_pack: 0,
    maximum_packs: 20,
    availability: "confirmed",
    observed_at: s.clock,
    valid_until: "2026-10-27T23:00:00Z",
    source_label: "Shelf label checked by owner",
  });
}
describe("US locations and local purchasing", () => {
  it("includes all 50 states, DC and the five populated territories", () => {
    expect(US_STATES).toHaveLength(56);
    expect(new Set(US_STATES.map((s) => s[0])).size).toBe(56);
  });
  it("round-trips winter and summer wall times across every supported US timezone", () => {
    for (const [zone] of US_TIMEZONES)
      for (const date of ["2026-01-15T20:00", "2026-07-15T20:00"])
        expect(localDateTime(zonedInstant(date, zone), zone)).toBe(date);
  });
  it("handles New York, Arizona, Hawaii and Alaska offsets without Pacific assumptions", () => {
    expect(zonedInstant("2026-01-15T20:00", "America/New_York")).toBe(
      "2026-01-16T01:00:00.000Z",
    );
    expect(zonedInstant("2026-07-15T20:00", "America/New_York")).toBe(
      "2026-07-16T00:00:00.000Z",
    );
    expect(zonedInstant("2026-07-15T20:00", "America/Phoenix")).toBe(
      "2026-07-16T03:00:00.000Z",
    );
    expect(zonedInstant("2026-01-15T20:00", "Pacific/Honolulu")).toBe(
      "2026-01-16T06:00:00.000Z",
    );
    expect(zonedInstant("2026-01-15T20:00", "America/Anchorage")).toBe(
      "2026-01-16T05:00:00.000Z",
    );
  });
  it("rejects nonexistent spring time and resolves both fall-back occurrences explicitly", () => {
    expect(() => zonedInstant("2026-03-08T02:30", "America/New_York")).toThrow(
      "does not exist",
    );
    expect(
      zonedInstant("2026-11-01T01:30", "America/New_York", "earlier"),
    ).toBe("2026-11-01T05:30:00.000Z");
    expect(zonedInstant("2026-11-01T01:30", "America/New_York", "later")).toBe(
      "2026-11-01T06:30:00.000Z",
    );
    expect(() => zonedInstant("2026-02-30T10:00", "America/New_York")).toThrow(
      "valid calendar",
    );
  });
  it("preserves event instants and stock, cancels an unexecuted approval and excludes sample prices", () => {
    const initial = seedState();
    const approved = applyAction(initial, {
      type: "approve",
      plan_version: initial.plan_version,
      operation_key: "loc-approval",
    });
    const changed = locate(approved);
    expect(changed.orders[0].status).toBe("Cancelled");
    expect(changed.production).toEqual(initial.production);
    expect(changed.inventory).toEqual(initial.inventory);
    expect(optimize(changed).status).toBe("no_supply_feasible_plan");
    expect(derive(changed).purchasingPower.partial).toBe(true);
  });
  it("calculates with local quotes, keeps history, and excludes quotes after relocation", () => {
    let s = supplier(locate());
    for (const i of s.ingredients) s = quote(s, i.id, 100);
    const before = derive(s);
    expect(before.plan.status).toBe("feasible");
    expect(before.purchasingPower.partial).toBe(false);
    expect(before.purchasingPower.index).toBe(100);
    expect(
      before.plan.lines.every((l) => l.supplier_id.startsWith("local_")),
    ).toBe(true);
    s = quote(s, "flour", 200);
    const after = derive(s);
    expect(after.plan.total_cost_cents).toBeGreaterThan(
      before.plan.total_cost_cents,
    );
    expect(after.costs.baguette.ingredientCents).toBeGreaterThan(
      before.costs.baguette.ingredientCents,
    );
    expect(after.purchasingPower.index).toBeGreaterThan(100);
    expect(
      s.price_history.filter(
        (p) =>
          p.location_key === locationKey(ny) && p.ingredient_id === "flour",
      ),
    ).toHaveLength(2);
    s = applyAction(s, {
      type: "location",
      name: s.name,
      location: { ...ny, city: "Houston", state: "TX", postal_code: "77002" },
      timezone: "America/Chicago",
      price_mode: "local",
    });
    expect(referenceOffer(s, "flour")).toBeUndefined();
    expect(optimize(s).status).toBe("no_supply_feasible_plan");
    expect(
      s.price_history.some((p) => p.location_key === locationKey(ny)),
    ).toBe(true);
  });
  it("receives local orders once and separates subsequent production and sales", () => {
    let s = supplier(locate());
    for (const i of s.ingredients) s = quote(s, i.id, 100);
    s = applyAction(s, {
      type: "approve",
      plan_version: s.plan_version,
      operation_key: "local-approve",
    });
    expect(stockOf(s).flour).toBe(12000);
    const o = s.orders[0];
    const quantities = Object.fromEntries(
      o.plan.lines.map((l) => [l.offer_id, l.quantity_base]),
    );
    s = applyAction(s, {
      type: "receive",
      order_id: o.id,
      quantities,
      operation_key: "local-receive",
    });
    const stock = stockOf(s);
    s = applyAction(s, {
      type: "receive",
      order_id: o.id,
      quantities,
      operation_key: "local-repeat",
    });
    expect(stockOf(s)).toEqual(stock);
    s = applyAction(s, {
      type: "complete_production",
      operation_key: "local-produce",
    });
    const consumed = stockOf(s);
    s = applyAction(s, {
      type: "sell",
      recipe_id: "baguette",
      quantity: 1,
      operation_key: "local-sale",
    });
    expect(stockOf(s)).toEqual(consumed);
  });
  it("uses supplier local opening and closing times, including overnight hours", () => {
    const s = locate(),
      p = {
        ...s.suppliers[0],
        timezone: "America/New_York",
        ready_at: s.clock,
        hours: "16:00-20:00",
      };
    expect(new Date(collectionTime(s, p)).toISOString()).toBe(
      "2026-10-24T20:00:00.000Z",
    );
    p.hours = "07:00-15:00";
    expect(Number.isNaN(collectionTime(s, p))).toBe(true);
    p.hours = "20:00-06:00";
    expect(new Date(collectionTime(s, p)).toISOString()).toBe(
      "2026-10-25T00:00:00.000Z",
    );
  });
  it("blocks a supplier opening after prep and includes owner-entered tax", () => {
    let s = quote(supplier(locate()));
    const p = s.suppliers.at(-1)!;
    const o = s.offers.at(-1)!;
    p.hours = "23:30-23:59";
    expect(offerReason(s, o)).toContain("after preparation");
    p.hours = "07:00-23:00";
    s = applyAction(s, {
      type: "local_quote",
      supplier_id: p.id,
      ingredient_id: "flour",
      package_quantity: 25,
      package_unit: "lb",
      pack_price_cents: 1000,
      tax_cents_per_pack: 80,
      maximum_packs: 20,
      availability: "confirmed",
      observed_at: s.clock,
      valid_until: s.production.prep_starts_at,
      source_label: "Quote incl owner tax",
    });
    expect(referenceOffer(s, "flour")!.pack_quantity_base).toBe(11339);
    expect(referenceOffer(s, "flour")!.tax_cents_per_pack).toBe(80);
  });
  it("converts US packages conservatively and rejects mass/volume and fractional counts", () => {
    expect(packageBaseQuantity(25, "lb", "g")).toBe(11339);
    expect(packageBaseQuantity(1, "us_gal", "ml")).toBe(3785);
    expect(packageBaseQuantity(2, "dozen", "each")).toBe(24);
    expect(() => packageBaseQuantity(1, "lb", "ml")).toThrow();
    expect(() => packageBaseQuantity(0.1, "each", "each")).toThrow();
  });
  it("validates US settings and prevents changing location with an executed outstanding order", () => {
    expect(() =>
      applyAction(seedState(), {
        type: "location",
        name: "B",
        location: { ...ny, postal_code: "123" },
        timezone: "America/New_York",
        price_mode: "local",
      }),
    ).toThrow();
    let s = seedState();
    s = applyAction(s, {
      type: "approve",
      plan_version: s.plan_version,
      operation_key: "paid-approve",
    });
    s = applyAction(s, { type: "pay", order_id: s.orders[0].id });
    expect(() => locate(s)).toThrow("Finish receiving");
  });
  it("migrates existing SQLite workspaces without changing records and persists new settings", () => {
    const repo = new Repository(":memory:"),
      session = repo.createSession();
    const original = seedState(session.workspace);
    repo.save(session.session, original);
    const legacy = structuredClone(original) as Partial<State>;
    delete legacy.location;
    delete legacy.price_mode;
    repo.save(session.session, legacy as State);
    const migrated = repo.read(session.session, session.workspace);
    expect(migrated.location.city).toBe("Garden Grove");
    expect(migrated.inventory).toEqual(original.inventory);
    expect(optimize(migrated).total_cost_cents).toBe(7780);
    repo.save(session.session, locate(migrated));
    expect(repo.read(session.session, session.workspace).location).toEqual(ny);
    repo.db.close();
  });
  it("blocks replacement purchasing after a local quote changes on an already paid order", () => {
    let s = supplier(locate());
    for (const i of s.ingredients) s = quote(s, i.id, 100);
    s = applyAction(s, {
      type: "approve",
      plan_version: s.plan_version,
      operation_key: "committed-local",
    });
    const original = structuredClone(s.orders[0]);
    s = applyAction(s, { type: "pay", order_id: original.id });
    s = quote(s, "flour", 200);
    expect(optimize(s).status).toBe("needs_review");
    expect(() =>
      applyAction(s, {
        type: "approve",
        plan_version: s.plan_version,
        operation_key: "duplicate-local",
      }),
    ).toThrow();
    expect(s.orders[0].input_snapshot).toEqual(original.input_snapshot);
    const quantities = Object.fromEntries(
      original.plan.lines.map((l) => [l.offer_id, l.quantity_base]),
    );
    s = applyAction(s, {
      type: "receive",
      order_id: original.id,
      quantities,
      operation_key: "finish-local",
    });
    expect(optimize(s).total_cost_cents).toBe(0);
  });
});
