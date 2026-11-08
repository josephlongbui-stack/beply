import fixture from "../../demo/seed.json";
import type { State, Recipe } from "./types";
import { DEFAULT_LOCATION } from "./location";

export function seedState(
  id = "local-demo",
  kind: State["kind"] = "sample",
): State {
  const state: State = {
    id,
    kind,
    business_type: "bakery",
    clock_mode: kind === "owner" ? "live" : "demo",
    lots: [],
    production_queue: [],
    production_history: [],
    name: kind === "guided" ? "Your guided bakery" : fixture.bakery.name,
    revision: 0,
    plan_version: 1,
    clock: fixture.clock.now,
    timezone: fixture.clock.timezone,
    location: { ...DEFAULT_LOCATION },
    price_mode: "sample",
    settings: {
      budget_cents: fixture.settings.budget_cents,
      cash_reserve_cents: fixture.settings.cash_reserve_cents,
      maximum_in_person_stops: fixture.settings.maximum_in_person_stops,
      mode: "mixed",
      locale: "en",
      excluded_suppliers: [],
      owner_time_value_cents_per_hour: 0,
    },
    ingredients: fixture.ingredients.map((i) => ({
      ...i,
      base_unit: i.base_unit as "g" | "ml" | "each",
      aliases: [i.name, i.name_vi],
      confidence: kind === "guided" ? "needs_checking" : "confirmed",
    })),
    recipes:
      kind === "guided" ? [] : (structuredClone(fixture.recipes) as Recipe[]),
    recipe_versions:
      kind === "guided" ? [] : (structuredClone(fixture.recipes) as Recipe[]),
    production: {
      ...structuredClone(fixture.production_plan),
      items:
        kind === "guided" ? [] : structuredClone(fixture.production_plan.items),
    },
    suppliers: structuredClone(fixture.suppliers).map((p) => ({
      ...p,
      is_sample: true,
      timezone: fixture.clock.timezone,
    })),
    offers: structuredClone(fixture.offers),
    price_history: structuredClone(fixture.price_history),
    index_basket: structuredClone(fixture.index_basket),
    inventory:
      kind === "guided"
        ? []
        : fixture.opening_stock.map((r) => ({
            id: r.id,
            ingredient_id: r.ingredient_id,
            quantity_base: r.quantity_base,
            event_type: "opening_count",
            source: "Owner-confirmed sample opening count",
            occurred_at: r.observed_at,
          })),
    expenses: [],
    orders: [],
    documents: [],
    finished: [],
    operation_keys: [],
    audit: [
      {
        id: "seed",
        event: "Workspace created",
        detail:
          kind === "guided"
            ? "Empty guided workspace; confirm recipes and opening counts."
            : "Fictional sample records loaded; no external services connected.",
        occurred_at: fixture.clock.now,
      },
    ],
  };
  if (kind === "owner") {
    state.name = "Your food business";
    state.clock = new Date().toISOString();
    state.timezone = "America/New_York";
    state.location = { country: "US", city: "", state: "", postal_code: "" };
    state.price_mode = "local";
    state.settings.budget_cents = 0;
    state.settings.cash_reserve_cents = 0;
    state.recipes = [];
    state.recipe_versions = [];
    state.inventory = [];
    state.suppliers = [];
    state.offers = [];
    state.price_history = [];
    state.index_basket = [];
    state.ingredients.forEach((i) => {
      i.confidence = "needs_checking";
    });
    state.production = {
      id: `production_${id}`,
      status: "planned",
      items: [],
      prep_starts_at: new Date(
        Date.parse(state.clock) + 4 * 3600000,
      ).toISOString(),
      ready_for_sale_at: new Date(
        Date.parse(state.clock) + 14 * 3600000,
      ).toISOString(),
    };
    state.audit = [
      {
        id: "seed",
        event: "Workspace created",
        detail:
          "Empty owner workspace. No sample purchases, prices, recipes or stock loaded.",
        occurred_at: state.clock,
      },
    ];
  }
  return state;
}
export const fixtureRecipes = fixture.recipes as Recipe[];
export const fixtureOpening = fixture.opening_stock;
