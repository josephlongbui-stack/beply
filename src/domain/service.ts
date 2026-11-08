import { assignedQuantity, expiredQuantity, consumeLots } from "./perishables";
import { createHash, randomUUID } from "node:crypto";
import {
  budgetOf,
  finishedOf,
  optimize,
  requirements,
  stockOf,
} from "./engine";
import { fixtureOpening, fixtureRecipes } from "./seed";
import { actionSchema, type Action } from "./validation";
import type { State, Recipe, DocumentRecord, Order } from "./types";
import { packageBaseQuantity } from "./units";
import { locationKey, locationLabel, localDateTime } from "./location";

function audit(s: State, event: string, detail: string) {
  s.audit.unshift({ id: randomUUID(), event, detail, occurred_at: s.clock });
}
function invalidate(s: State) {
  s.plan_version++;
  for (const o of s.orders) {
    if (o.status === "Cancelled" || o.status === "Received") continue;
    o.stale = true;
    // Unexecuted approvals are replaced, releasing their unpaid commitment.
    if (
      !o.paid &&
      !Object.values(o.received).some(Boolean) &&
      o.status !== "Simulated order submitted"
    ) {
      o.status = "Cancelled";
      audit(
        s,
        "Approval invalidated",
        `Order ${o.id.slice(0, 8)} cancelled after planning inputs changed; reapproval required.`,
      );
    }
  }
}
function findOrder(s: State, id: string) {
  const o = s.orders.find((o) => o.id === id);
  if (!o) throw new Error("Order not found in this workspace");
  return o;
}
function saveRecipe(s: State, recipe: Recipe) {
  if (
    new Set(recipe.ingredients.map((i) => i.ingredient_id)).size !==
    recipe.ingredients.length
  )
    throw new Error("Combine duplicate ingredient lines first");
  for (const line of recipe.ingredients)
    if (!s.ingredients.some((i) => i.id === line.ingredient_id))
      throw new Error("Confirm ingredient matches first");
  const old = s.recipes.find((r) => r.id === recipe.id);
  const next = { ...recipe, version: (old?.version ?? 0) + 1, confirmed: true };
  s.recipes = s.recipes.filter((r) => r.id !== recipe.id).concat(next);
  s.recipe_versions.push(structuredClone(next));
  invalidate(s);
  audit(
    s,
    "Recipe confirmed",
    `${recipe.name}, version ${next.version}; previous production is unchanged.`,
  );
}
export function sampleDocument(
  s: State,
  sample: "baguette" | "butter_bun" | "receipt" | "statement",
): DocumentRecord {
  const isRecipe = sample === "baguette" || sample === "butter_bun";
  return {
    id: `sample_${sample}`,
    name: `Sample ${sample.replaceAll("_", " ")}`,
    hash: `fixture:${sample}:1`,
    mime: "image/svg+xml",
    type: isRecipe ? "recipe" : sample,
    mode: "sample",
    status: "Needs review",
    sample_url: `/samples/${sample}.svg`,
    lines:
      sample === "receipt"
        ? [
            {
              ingredient_id: "flour",
              quantity_base: 5000,
              line_total_cents: 800,
            },
          ]
        : [],
    recipe: isRecipe
      ? structuredClone(fixtureRecipes.find((r) => r.id === sample)!)
      : undefined,
    external_id:
      sample === "receipt" ? "demo_flour_receipt_001" : `demo_${sample}_001`,
    paid: sample === "receipt",
    received: sample === "receipt",
    supplier_id: "market_a",
    created_at: s.clock,
    notes: isRecipe
      ? "Bundled sample extraction. Confirm quantities and yield; software fixture, not baking instructions."
      : sample === "statement"
        ? "Payment evidence only: link to a confirmed receipt. No item-level extraction."
        : "Bundled sample extraction. Separate purchase: 5 kg flour, $8 cash, already received. No additional trip cost in this fixture.",
  };
}
export function applyAction(original: State, raw: unknown): State {
  const action: Action = actionSchema.parse(raw),
    s = structuredClone(original);
  if (
    "operation_key" in action &&
    s.operation_keys.includes(action.operation_key)
  )
    return s;
  switch (action.type) {
    case "location": {
      const changed =
        locationKey(s.location) !== locationKey(action.location) ||
        s.timezone !== action.timezone ||
        s.price_mode !== action.price_mode;
      if (
        changed &&
        s.orders.some(
          (o) =>
            !["Cancelled", "Received", "Draft"].includes(o.status) &&
            (o.paid ||
              Object.values(o.received).some(Boolean) ||
              o.status === "Simulated order submitted"),
        )
      )
        throw new Error(
          "Finish receiving or cancel outstanding executed orders before changing location or price mode.",
        );
      s.name = action.name;
      s.business_type = action.business_type ?? s.business_type ?? "bakery";
      s.location = action.location;
      s.timezone = action.timezone;
      s.price_mode = action.price_mode;
      if (changed) invalidate(s);
      audit(
        s,
        "Business location saved",
        `${locationLabel(s.location)} ${s.location.postal_code}; ${s.timezone}; ${s.price_mode} prices. Existing timestamps retain their exact instant; review local deadlines.`,
      );
      break;
    }
    case "local_supplier": {
      if (!s.location.city || !s.location.state || !s.location.postal_code)
        throw new Error(
          "Set your business location before adding a local supplier.",
        );
      const existing = action.supplier_id
        ? s.suppliers.find((p) => p.id === action.supplier_id)
        : undefined;
      if (
        action.supplier_id &&
        (!existing ||
          existing.is_sample !== false ||
          existing.location_key !== locationKey(s.location))
      )
        throw new Error("Supplier does not belong to this location");
      if (
        !existing &&
        s.suppliers.filter((p) => p.is_sample === false).length >= 8
      )
        throw new Error(
          "This demo supports eight owner-entered suppliers across your locations.",
        );
      const values = {
        name: action.name,
        address: action.address,
        mode: action.mode,
        ready_at: action.ready_at,
        timezone: action.timezone,
        hours: action.hours,
        estimated_trip_cash_cost_cents: action.estimated_trip_cash_cost_cents,
        minimum_order_cents: action.minimum_order_cents,
        shipping_cents: action.shipping_cents,
      };
      const supplier = {
        ...values,
        id: existing?.id ?? `local_${randomUUID()}`,
        is_sample: false,
        location_key: locationKey(s.location),
      };
      s.suppliers = s.suppliers
        .filter((p) => p.id !== supplier.id)
        .concat(supplier);
      invalidate(s);
      audit(
        s,
        "Local supplier saved",
        `${supplier.name} · ${locationLabel(s.location)} · owner-entered hours, availability and trip costs.`,
      );
      break;
    }
    case "local_quote": {
      const supplier = s.suppliers.find((p) => p.id === action.supplier_id),
        ingredient = s.ingredients.find((i) => i.id === action.ingredient_id);
      if (
        !supplier ||
        supplier.is_sample !== false ||
        supplier.location_key !== locationKey(s.location)
      )
        throw new Error("Choose a supplier for the current business location");
      if (!ingredient) throw new Error("Unknown ingredient");
      if (Date.parse(action.observed_at) > Date.parse(s.clock))
        throw new Error(
          "Observation cannot be after the current planning time",
        );
      if (Date.parse(action.valid_until) < Date.parse(action.observed_at))
        throw new Error("Quote validity must follow its observation");
      const existing = action.offer_id
        ? s.offers.find((o) => o.id === action.offer_id)
        : undefined;
      if (
        action.offer_id &&
        (!existing ||
          existing.supplier_id !== supplier.id ||
          existing.ingredient_id !== ingredient.id)
      )
        throw new Error("Quote does not match this supplier and ingredient");
      const id = existing?.id ?? `${supplier.id}_${ingredient.id}`;
      const previous = s.offers.find((o) => o.id === id);
      const quote = {
        id,
        supplier_id: supplier.id,
        ingredient_id: ingredient.id,
        input_quantity: action.package_quantity,
        input_unit: action.package_unit,
        pack_quantity_base: packageBaseQuantity(
          action.package_quantity,
          action.package_unit,
          ingredient.base_unit,
        ),
        pack_price_cents: action.pack_price_cents,
        tax_cents_per_pack: action.tax_cents_per_pack,
        maximum_packs: action.maximum_packs,
        availability: action.availability,
        currency: "USD",
        product_specification: ingredient.product_specification,
        base_unit: ingredient.base_unit,
        source_type: "owner_entered",
        source_label: action.source_label,
        observed_at: action.observed_at,
        valid_until: action.valid_until,
      };
      s.offers = s.offers.filter((o) => o.id !== id).concat(quote);
      if (
        !previous ||
        previous.pack_price_cents !== quote.pack_price_cents ||
        previous.pack_quantity_base !== quote.pack_quantity_base ||
        previous.tax_cents_per_pack !== quote.tax_cents_per_pack ||
        previous.observed_at !== quote.observed_at
      ) {
        s.price_history.push({
          ingredient_id: ingredient.id,
          supplier_id: supplier.id,
          date: localDateTime(quote.observed_at, s.timezone).slice(0, 10),
          pack_quantity_base: quote.pack_quantity_base,
          pack_price_cents: quote.pack_price_cents + quote.tax_cents_per_pack,
          source_type: "owner_entered",
          label: quote.source_label,
          location_key: locationKey(s.location),
        });
      }
      invalidate(s);
      audit(
        s,
        "Local quote saved",
        `${ingredient.name} at ${supplier.name}; owner-entered USD quote, not a live feed.`,
      );
      break;
    }
    case "manual_document": {
      const id = randomUUID();
      s.documents.unshift({
        id,
        name: `Manual ${action.kind}`,
        hash: `manual:${id}`,
        mime: "text/plain",
        type: action.kind,
        mode: "manual",
        status: "Needs review",
        lines: [],
        external_id: `manual_${id}`,
        paid: false,
        received: false,
        supplier_id: s.suppliers[0]?.id ?? "unassigned",
        created_at: s.clock,
        notes: "Entered manually by the owner. No automated extraction.",
      });
      break;
    }
    case "settings": {
      const old = JSON.stringify({
        ...s.settings,
        locale: action.settings.locale,
      });
      s.settings = action.settings;
      if (old !== JSON.stringify(s.settings)) invalidate(s);
      audit(
        s,
        "Preferences saved",
        "Budget, reserve, store limit and shopping preferences saved.",
      );
      break;
    }
    case "production": {
      if (
        Date.parse(action.ready_for_sale_at) <=
        Date.parse(action.prep_starts_at)
      )
        throw new Error("Ready time must follow preparation time");
      if (Date.parse(action.prep_starts_at) < Date.parse(s.clock))
        throw new Error(
          "Preparation must be at or after the current planning time",
        );
      if (
        action.items.some((i) => !s.recipes.some((r) => r.id === i.recipe_id))
      )
        throw new Error("Confirm recipes before planning production");
      if (
        new Set(action.items.map((i) => i.recipe_id)).size !==
        action.items.length
      )
        throw new Error("Each recipe can appear once in this production cycle");
      if (s.production.items.length)
        (s.production_history ??= []).push(structuredClone(s.production));
      s.production = {
        id: randomUUID(),
        status: "planned",
        items: action.items,
        prep_starts_at: action.prep_starts_at,
        ready_for_sale_at: action.ready_for_sale_at,
      };
      if (s.kind === "owner" && !s.index_basket.length) {
        s.index_basket = Object.entries(requirements(s).required)
          .filter(([, quantity]) => quantity > 0)
          .map(([ingredient_id, quantity_base]) => ({
            ingredient_id,
            quantity_base,
            comparison_supplier_id: "local",
          }));
      }
      invalidate(s);
      audit(
        s,
        "Production planned",
        "Whole-batch requirements reserved for the target cycle. No stock consumed.",
      );
      break;
    }
    case "recipe":
      saveRecipe(s, action.recipe);
      break;
    case "count": {
      if (s.clock_mode !== "live" && action.observed_at !== s.clock)
        throw new Error(
          "Backdated counts need review. This demo accepts counts at its current simulated time only.",
        );
      const ingredient = s.ingredients.find(
        (i) => i.id === action.ingredient_id,
      );
      if (!ingredient) throw new Error("Unknown ingredient");
      if (action.quantity_base > ingredient.max_storage_base)
        throw new Error("Count exceeds configured storage capacity");
      if (
        s.clock_mode === "live" &&
        (Date.parse(action.observed_at) > Date.parse(s.clock) ||
          Date.parse(s.clock) - Date.parse(action.observed_at) > 15 * 60000)
      )
        throw new Error(
          "Refresh and recount: live counts must be observed within the last 15 minutes.",
        );
      const diff = action.quantity_base - stockOf(s)[ingredient.id];
      s.lots = (s.lots ?? []).filter((l) => l.ingredient_id !== ingredient.id);

      s.inventory.push({
        id: action.operation_key,
        ingredient_id: ingredient.id,
        quantity_base: diff,
        event_type: "count_reconciliation",
        source: `Physical count ${action.quantity_base} ${ingredient.base_unit}; difference ${diff}`,
        occurred_at: s.clock,
      });
      ingredient.confidence = "confirmed";
      invalidate(s);
      audit(
        s,
        "Physical count confirmed",
        `${ingredient.name}: adjustment ${diff} ${ingredient.base_unit}.`,
      );
      break;
    }
    case "waste": {
      if (
        !s.ingredients.some((i) => i.id === action.ingredient_id) ||
        stockOf(s)[action.ingredient_id] < action.quantity_base
      )
        throw new Error("Waste cannot exceed on-hand stock");
      s.inventory.push({
        id: action.operation_key,
        ingredient_id: action.ingredient_id,
        quantity_base: -action.quantity_base,
        event_type: "waste",
        source: "Owner-recorded waste",
        occurred_at: s.clock,
      });
      invalidate(s);
      consumeLots(s, action.ingredient_id, action.quantity_base, s.clock, true);
      audit(
        s,
        "Waste recorded",
        `${action.quantity_base} base units of ${action.ingredient_id}; no cash payment.`,
      );
      break;
    }
    case "lot": {
      const ingredient = s.ingredients.find(
        (i) => i.id === action.ingredient_id,
      );
      if (!ingredient || ingredient.confidence === "needs_checking")
        throw new Error("Confirm this item's physical count first.");
      if (
        action.quantity_base >
        stockOf(s)[ingredient.id] - assignedQuantity(s, ingredient.id)
      )
        throw new Error(
          "Lot quantity exceeds stock without a lot label. No stock is added by labelling a lot.",
        );
      (s.lots ??= []).push({
        id: action.operation_key,
        ingredient_id: ingredient.id,
        label: action.label,
        remaining_base: action.quantity_base,
        use_by: action.use_by,
        recorded_at: s.clock,
      });
      invalidate(s);
      audit(
        s,
        "Perishable lot labelled",
        `${ingredient.name}: ${action.quantity_base} ${ingredient.base_unit}, use by ${action.use_by}. Existing physical stock unchanged.`,
      );
      break;
    }
    case "queue_production": {
      if ((s.production_queue ?? []).length >= 30)
        throw new Error("Keep up to 30 upcoming prep plans.");
      // Reuse validation and whole-batch rules without changing the active plan or its approvals.
      const checked = applyAction(s, {
        type: "production",
        items: action.items,
        prep_starts_at: action.prep_starts_at,
        ready_for_sale_at: action.ready_for_sale_at,
      });
      (s.production_queue ??= []).push({
        ...checked.production,
        label: action.label,
      });
      s.production_queue.sort(
        (a, b) => Date.parse(a.prep_starts_at) - Date.parse(b.prep_starts_at),
      );
      audit(
        s,
        "Upcoming prep saved",
        `${action.label}; not yet reserved or purchased.`,
      );
      break;
    }
    case "activate_production": {
      if (
        s.production.status !== "completed" &&
        s.production.items.some((i) => i.planned_units > 0)
      )
        throw new Error(
          "Complete the active production cycle before starting a saved prep plan.",
        );
      if (
        s.orders.some(
          (o) => !["Received", "Cancelled", "Draft"].includes(o.status),
        )
      )
        throw new Error("Finish or cancel outstanding purchases first.");
      const next = s.production_queue?.find(
        (p) => p.id === action.production_id,
      );
      if (!next) throw new Error("Saved prep plan not found.");
      const checked = applyAction(s, {
        type: "production",
        items: next.items,
        prep_starts_at: next.prep_starts_at,
        ready_for_sale_at: next.ready_for_sale_at,
      });
      Object.assign(s, checked);
      s.production.label = next.label;
      s.production_queue = s.production_queue!.filter((p) => p.id !== next.id);
      audit(
        s,
        "Saved prep activated",
        "Purchasing recalculated using current stock, recipes and quotes. Review before approval.",
      );
      break;
    }
    case "remove_queued_production": {
      if (!s.production_queue?.some((p) => p.id === action.production_id))
        throw new Error("Saved prep plan not found.");
      s.production_queue = s.production_queue.filter(
        (p) => p.id !== action.production_id,
      );
      audit(s, "Upcoming prep removed", "No inventory or purchases changed.");
      break;
    }
    case "catalog_item": {
      if (s.ingredients.length >= 100)
        throw new Error(
          "This demo supports up to 100 stock items per workspace.",
        );
      const normalized = action.name.replace(/\s+/g, " ").toLocaleLowerCase();
      if (
        s.ingredients.some((i) =>
          [i.name, i.name_vi, ...(i.aliases ?? [])].some(
            (n) =>
              n.trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalized,
          ),
        )
      )
        throw new Error(
          "That item name already exists. Use its existing stock record or a more specific name.",
        );
      if (action.reorder_point_base > action.max_storage_base)
        throw new Error("Reorder point cannot exceed storage capacity.");
      s.ingredients.push({
        id: `item_${randomUUID()}`,
        name: action.name,
        name_vi: action.name_vi || action.name,
        category: action.category,
        base_unit: action.base_unit,
        count_unit: action.count_unit,
        product_specification: action.product_specification,
        max_storage_base: action.max_storage_base,
        reorder_point_base: action.reorder_point_base,
        aliases: [action.name],
        confidence: "needs_checking",
      });
      invalidate(s);
      audit(
        s,
        "Stock item added",
        `${action.name}: ${action.category}; no quantity or price assumed.`,
      );
      break;
    }
    case "ingredient": {
      const ingredient = s.ingredients.find(
        (i) => i.id === action.ingredient_id,
      );
      if (!ingredient) throw new Error("Unknown ingredient");
      if (
        (action.reorder_point_base ?? ingredient.reorder_point_base ?? 0) >
        action.max_storage_base
      )
        throw new Error("Reorder point cannot exceed storage capacity.");
      Object.assign(ingredient, action);
      invalidate(s);
      audit(
        s,
        "Ingredient rules updated",
        `${ingredient.name}: owner reviewed aliases, substitutions and storage.`,
      );
      break;
    }
    case "offer": {
      const offer = s.offers.find((o) => o.id === action.offer_id);
      if (!offer) throw new Error("Unknown offer");
      if (
        s.suppliers.find((p) => p.id === offer.supplier_id)?.is_sample === false
      )
        throw new Error(
          "Edit local prices through the local quote form so their provenance and history are retained.",
        );
      offer.pack_price_cents = action.pack_price_cents;
      offer.availability = action.availability;
      offer.source_label = "Owner-edited sample quote";
      invalidate(s);
      audit(
        s,
        "Sample quote edited",
        `${offer.id}: ${offer.pack_price_cents} cents per pack. Historical observations unchanged.`,
      );
      break;
    }
    case "supplier": {
      const supplier = s.suppliers.find((x) => x.id === action.supplier_id);
      if (!supplier) throw new Error("Unknown supplier");
      supplier.estimated_trip_cash_cost_cents =
        action.estimated_trip_cash_cost_cents;
      invalidate(s);
      audit(s, "Trip assumption changed", supplier.name);
      break;
    }
    case "draft":
    case "approve": {
      if (action.plan_version !== s.plan_version)
        throw new Error(
          "Plan changed. Review the current calculation before approval.",
        );
      const existing = s.orders.find(
        (o) =>
          o.input_version === s.plan_version &&
          !o.stale &&
          o.status !== "Cancelled" &&
          o.status !== "Received",
      );
      if (existing && existing.status !== "Draft") return s;
      const plan = optimize(s, { replacingOrder: existing?.id });
      if (plan.status !== "feasible" || !plan.lines.length)
        throw new Error(
          "Only an eligible, fully funded plan with purchases can be approved",
        );
      const oneStore = optimize(s, {
        maxStops: 1,
        mode: "in_store",
        replacingOrder: existing?.id,
      });
      const snapshot = {
        location: structuredClone(s.location),
        timezone: s.timezone,
        price_mode: s.price_mode,
        suppliers: structuredClone(s.suppliers),
        settings: structuredClone(s.settings),
        production: structuredClone(s.production),
        recipes: structuredClone(s.recipes),
        offers: structuredClone(s.offers),
        inventory: structuredClone(s.inventory),
      };
      const order: Order = {
        id: existing?.id ?? randomUUID(),
        status: action.type === "draft" ? "Draft" : "Approved",
        plan,
        input_version: s.plan_version,
        stale: false,
        paid: false,
        received: {},
        checked: {},
        created_at: s.clock,
        input_snapshot: snapshot,
        baseline:
          oneStore.status === "feasible"
            ? {
                name: "Best eligible one-store plan",
                total_cost_cents: oneStore.total_cost_cents,
              }
            : undefined,
      };
      s.orders = s.orders.filter((o) => o.id !== order.id).concat(order);
      audit(
        s,
        action.type === "draft" ? "Plan draft saved" : "Plan approved",
        `${order.plan.total_cost_cents} cents ${action.type === "draft" ? "in draft" : "committed"}; physical stock unchanged.`,
      );
      break;
    }
    case "submit": {
      const o = findOrder(s, action.order_id);
      if (o.status === "Simulated order submitted") return s;
      if (o.stale || o.status !== "Approved")
        throw new Error("A current approved plan is required");
      if (
        !o.plan.supplier_ids.some(
          (id) => s.suppliers.find((x) => x.id === id)?.mode === "online",
        )
      )
        throw new Error(
          "This is an in-store shopping plan. No online order is required.",
        );
      o.status = "Simulated order submitted";
      o.simulated_reference = `SIM-${o.id.slice(0, 8)}`;
      audit(
        s,
        "Simulated order submitted",
        "Demo adapter only. No supplier contacted; no payment or stock change.",
      );
      break;
    }
    case "pay": {
      const o = findOrder(s, action.order_id);
      if (o.paid) return s;
      if (o.status === "Draft" || o.status === "Cancelled")
        throw new Error("Order must be approved before recording payment");
      if (o.stale && o.status === "Approved")
        throw new Error("Stale approval: review again before payment");
      o.paid = true;
      s.expenses.push({
        id: `pay:${o.id}`,
        cents: o.plan.total_cost_cents,
        source: o.id,
        occurred_at: s.clock,
      });
      audit(
        s,
        "Payment recorded",
        `${o.plan.total_cost_cents} cents including the stated trip estimate; commitment released, physical stock unchanged.`,
      );
      break;
    }
    case "cancel": {
      const o = findOrder(s, action.order_id);
      if (o.status === "Cancelled") return s;
      if (o.paid || Object.values(o.received).some(Boolean))
        throw new Error(
          "Paid or partially received purchases need a separate refund/return; automatic cancellation is unavailable",
        );
      o.status = "Cancelled";
      audit(
        s,
        "Order cancelled",
        "Unpaid commitment released. No stock change.",
      );
      break;
    }
    case "receive": {
      const o = findOrder(s, action.order_id);
      if (o.status === "Draft" || o.status === "Cancelled")
        throw new Error("Only approved purchases can be received");
      // Cumulative received totals make repeated receipts idempotent even with different request keys.
      for (const [offerId, total] of Object.entries(action.quantities)) {
        const line = o.plan.lines.find((l) => l.offer_id === offerId);
        if (!line) throw new Error("Unknown order line");
        const prior = o.received[offerId] ?? 0;
        if (total < prior || total > line.quantity_base)
          throw new Error(
            "Received totals must not decrease or exceed the ordered quantity",
          );
        if (total === prior) continue;
        const ingredient = s.ingredients.find(
          (i) => i.id === line.ingredient_id,
        )!;
        if (
          stockOf(s)[ingredient.id] + total - prior >
          ingredient.max_storage_base
        )
          throw new Error(
            "Receiving would exceed storage; reconcile the actual count first",
          );
        s.inventory.push({
          id: `received:${o.id}:${offerId}:${total}`,
          ingredient_id: line.ingredient_id,
          quantity_base: total - prior,
          event_type: "receipt",
          source: o.id,
          occurred_at: s.clock,
        });
        o.received[offerId] = total;
      }
      o.status = o.plan.lines.every(
        (l) => (o.received[l.offer_id] ?? 0) === l.quantity_base,
      )
        ? "Received"
        : "Partially received";
      audit(
        s,
        "Goods received",
        `${o.status}; cumulative confirmed quantities posted once. Payment is separate.`,
      );
      break;
    }
    case "check": {
      const o = findOrder(s, action.order_id);
      if (!o.plan.lines.some((l) => l.offer_id === action.offer_id))
        throw new Error("Unknown shopping line");
      o.checked[action.offer_id] = action.checked;
      break;
    }
    case "complete_production": {
      if (s.production.status === "completed") return s;
      if (
        s.clock_mode === "live" &&
        Date.parse(s.clock) < Date.parse(s.production.prep_starts_at)
      )
        throw new Error(
          "Preparation has not started yet. Record production when it is actually complete.",
        );
      const usedAt =
        s.clock_mode === "live" ? s.clock : s.production.prep_starts_at;
      const { required, batches } = requirements(s),
        stock = stockOf(s);
      if (!batches.length) throw new Error("Plan production first");
      for (const i of s.ingredients) {
        if (required[i.id] > stock[i.id] - expiredQuantity(s, i.id, usedAt))
          throw new Error(`Receive enough ${i.name} before production`);
        if (
          required[i.id] > 0 &&
          (i.confidence === "needs_checking" ||
            (i.expires_at && Date.parse(i.expires_at) < Date.parse(usedAt)))
        )
          throw new Error(`Confirm usable ${i.name} before production`);
      }
      for (const [ingredient_id, q] of Object.entries(required))
        consumeLots(s, ingredient_id, q, usedAt);
      for (const [ingredient_id, q] of Object.entries(required))
        if (q)
          s.inventory.push({
            id: `produce:${s.production.id}:${ingredient_id}`,
            ingredient_id,
            quantity_base: -q,
            event_type: "production",
            source: s.production.id,
            occurred_at: usedAt,
          });
      for (const b of batches)
        s.finished.push({
          id: `finished:${s.production.id}:${b.recipe_id}`,
          recipe_id: b.recipe_id,
          quantity: b.units,
          kind: "production",
          source: s.production.id,
          occurred_at:
            s.clock_mode === "live" ? s.clock : s.production.ready_for_sale_at,
        });
      s.production.status = "completed";
      s.production.completed_snapshot = structuredClone(s.recipes);
      s.plan_version++;
      audit(
        s,
        "Production completed",
        s.clock_mode === "live"
          ? "Owner-confirmed production recorded at the current time; ingredients consumed once, finished goods created."
          : "Ingredients consumed once; reservations released; finished goods created. Simulated completion at scheduled time.",
      );
      break;
    }
    case "sell": {
      if ((finishedOf(s)[action.recipe_id] ?? 0) < action.quantity)
        throw new Error("Sale exceeds finished goods on hand");
      s.finished.push({
        id: action.operation_key,
        recipe_id: action.recipe_id,
        quantity: -action.quantity,
        kind: "sale",
        source: "Owner-confirmed sale",
        occurred_at:
          s.clock_mode === "live" ? s.clock : s.production.ready_for_sale_at,
      });
      audit(
        s,
        "Finished goods sold",
        `${action.quantity} × ${action.recipe_id}; raw ingredients unchanged. Revenue is not posted to purchasing cash.`,
      );
      break;
    }
    case "sample": {
      const doc = sampleDocument(s, action.sample);
      if (
        !s.documents.some(
          (d) => d.id === doc.id || d.external_id === doc.external_id,
        )
      )
        s.documents.unshift(doc);
      break;
    }
    case "review_document": {
      const edit = action.document,
        doc = s.documents.find((d) => d.id === edit.id);
      if (!doc) throw new Error("Document not found in this workspace");
      if (doc.status !== "Needs review") {
        if (
          !["receipt", "invoice"].includes(doc.type) ||
          edit.type !== doc.type
        )
          return s;
        if (
          JSON.stringify(doc.lines) !== JSON.stringify(edit.lines) ||
          doc.external_id !== edit.external_id ||
          doc.supplier_id !== edit.supplier_id
        )
          throw new Error(
            "Confirmed purchase quantities are immutable; enter a separate reviewed correction.",
          );
        if ((doc.paid && !edit.paid) || (doc.received && !edit.received))
          throw new Error(
            "Posted payment or stock cannot be undone by changing a checkbox; use a reconciliation.",
          );
        if (doc.paid === edit.paid && doc.received === edit.received) return s;
      }
      if (edit.type === "manual")
        throw new Error("Choose a document type and confirm its fields");
      for (const line of edit.lines)
        if (!s.ingredients.some((i) => i.id === line.ingredient_id))
          throw new Error("Confirm ingredient matches first");
      const duplicate = s.documents.find(
        (d) =>
          d.id !== doc.id &&
          d.external_id === edit.external_id &&
          d.status === "Confirmed",
      );
      if (duplicate) {
        if (
          ["receipt", "invoice"].includes(edit.type) &&
          ["receipt", "invoice"].includes(duplicate.type)
        ) {
          if (
            JSON.stringify(duplicate.lines) !== JSON.stringify(edit.lines) ||
            duplicate.supplier_id !== edit.supplier_id
          )
            throw new Error(
              "This purchase reference already has different reviewed details. Reconcile the original purchase before linking another source.",
            );
          // Later receipt evidence can complete an invoice. The canonical purchase
          // reference still gives payment and inventory events unique IDs.
          const updated = applyAction(s, {
            type: "review_document",
            document: {
              ...duplicate,
              paid: duplicate.paid || edit.paid,
              received: duplicate.received || edit.received,
            },
          });
          Object.assign(s, updated);
          const linked = s.documents.find((d) => d.id === doc.id)!;
          Object.assign(linked, edit, {
            status: "Linked",
            linked_purchase: duplicate.id,
          });
          audit(
            s,
            "Duplicate source linked",
            "Purchase evidence reconciled without duplicate stock or spending.",
          );
          break;
        }
        doc.status = "Linked";
        doc.linked_purchase = duplicate.id;
        audit(
          s,
          "Duplicate source linked",
          "No duplicate stock or spending posted.",
        );
        break;
      }
      if (edit.type === "recipe") {
        if (!edit.recipe)
          throw new Error("Recipe yield and ingredients are required");
        saveRecipe(s, edit.recipe);
      }
      if (edit.type === "statement") {
        const receipt = s.documents.find(
          (d) =>
            (d.id === edit.linked_purchase ||
              d.external_id === edit.linked_purchase) &&
            ["receipt", "invoice"].includes(d.type) &&
            d.status === "Confirmed",
        );
        if (!receipt)
          throw new Error(
            "Select a confirmed receipt to match; payment evidence cannot create stock",
          );
        doc.linked_purchase = receipt.id;
        doc.status = "Linked";
      }
      if (edit.type === "receipt" || edit.type === "invoice") {
        if (!edit.lines.length)
          throw new Error("Receipt requires at least one reviewed item");
        if (!s.suppliers.some((p) => p.id === edit.supplier_id))
          throw new Error("Select a known supplier");
        const key = `purchase:${edit.external_id}`;
        if (edit.paid && !s.expenses.some((e) => e.id === key))
          s.expenses.push({
            id: key,
            cents: edit.lines.reduce((n, l) => n + l.line_total_cents, 0),
            source: doc.id,
            occurred_at: s.clock,
          });
        if (edit.received)
          for (const [index, line] of edit.lines.entries()) {
            const eventId = `${key}:line:${index}`;
            if (s.inventory.some((e) => e.id === eventId)) continue;
            const i = s.ingredients.find((i) => i.id === line.ingredient_id)!;
            if (stockOf(s)[i.id] + line.quantity_base > i.max_storage_base)
              throw new Error("Receipt exceeds storage capacity");
            s.inventory.push({
              id: eventId,
              ingredient_id: line.ingredient_id,
              quantity_base: line.quantity_base,
              event_type: "receipt",
              source: doc.id,
              occurred_at: s.clock,
            });
          }
        invalidate(s);
      }
      Object.assign(doc, edit, {
        status: edit.type === "statement" ? "Linked" : "Confirmed",
      });
      audit(
        s,
        "Document reviewed",
        `${doc.name}: owner confirmed; payment and goods-received flags handled separately.`,
      );
      break;
    }
    case "confirm_opening": {
      if (s.kind !== "guided")
        throw new Error("Sample opening counts are already loaded");
      for (const r of fixtureOpening) {
        if (!s.inventory.some((e) => e.id === r.id))
          s.inventory.push({
            id: r.id,
            ingredient_id: r.ingredient_id,
            quantity_base: r.quantity_base,
            event_type: "opening_count",
            source: "Owner-confirmed sample starting count",
            occurred_at: s.clock,
          });
        s.ingredients.find((i) => i.id === r.ingredient_id)!.confidence =
          "confirmed";
      }
      invalidate(s);
      audit(
        s,
        "Starting counts confirmed",
        "Explicit sample physical counts; no stock inferred from recipe documents.",
      );
      break;
    }
  }
  if ("operation_key" in action) s.operation_keys.push(action.operation_key);
  s.revision++;
  if (budgetOf(s).spent < 0) throw new Error("Invalid expense total");
  return s;
}
export function contentHash(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex");
}
