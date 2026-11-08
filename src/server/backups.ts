import { z } from "zod";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { State } from "../domain/types";
import type { Repository } from "./repository";
import { stockOf } from "../domain/engine";
import { assignedQuantity } from "../domain/perishables";
import { recipeSchema } from "../domain/validation";

const id = z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9_:.-]+$/),
  str = z.string().max(2000),
  integer = z.number().int().safe(),
  positive = integer.nonnegative(),
  date = z.string().datetime({ offset: true });
const quantities = z.record(id, positive),
  collection = <T extends z.ZodType>(schema: T) => z.array(schema).max(20000);
const ingredient = z.object({
  id,
  name: str,
  name_vi: str,
  base_unit: z.enum(["g", "ml", "each"]),
  max_storage_base: positive,
  product_specification: str,
  aliases: z.array(str).optional(),
  approved_substitutions: z.array(str).optional(),
  expires_at: date.optional(),
  confidence: z.enum(["confirmed", "needs_checking"]).optional(),
  category: z.enum(["ingredient", "packaging", "resale", "supply"]).optional(),
  count_unit: str.optional(),
  reorder_point_base: positive.optional(),
});
const production = z.object({
  id,
  label: str.optional(),
  prep_starts_at: date,
  ready_for_sale_at: date,
  status: str,
  items: z
    .array(z.object({ recipe_id: id, planned_units: positive.max(2000) }))
    .max(10),
  completed_snapshot: z.array(recipeSchema).optional(),
});
const plan = z.object({
  status: z.enum([
    "feasible",
    "budget_infeasible",
    "no_supply_feasible_plan",
    "needs_review",
  ]),
  lines: z.array(
    z.object({
      ingredient_id: id,
      offer_id: id,
      supplier_id: id,
      packs: positive,
      quantity_base: positive,
      line_cost_cents: positive,
    }),
  ),
  total_cost_cents: positive,
  goods_cost_cents: positive,
  estimated_trip_cost_cents: positive,
  shipping_cents: positive,
  supplier_ids: z.array(id),
  required: quantities,
  shortfalls: quantities,
  stock: quantities,
  incoming: quantities,
  leftovers: quantities,
  cash_available_cents: integer,
  funding_gap_cents: positive,
  exclusions: z.array(z.object({ offer_id: id, reason: str })),
  issues: z.array(str),
  batches: z.array(
    z.object({
      recipe_id: id,
      batches: positive,
      units: positive,
      extra: positive,
    }),
  ),
  calculated_at: date,
  input_version: positive,
});
const stateSchema = z.object({
  id,
  name: str,
  kind: z.enum(["owner", "guided", "sample"]),
  revision: positive,
  plan_version: positive,
  clock: date,
  clock_mode: z.enum(["live", "demo"]).optional(),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  business_type: z
    .enum(["bakery", "cafe", "restaurant", "food_truck", "caterer"])
    .optional(),
  location: z.object({
    country: z.literal("US"),
    city: str,
    state: str,
    postal_code: str,
  }),
  price_mode: z.enum(["sample", "local"]),
  settings: z.object({
    budget_cents: positive,
    cash_reserve_cents: positive,
    maximum_in_person_stops: positive.max(3),
    mode: z.enum(["mixed", "in_store", "online"]),
    locale: z.enum(["en", "vi"]),
    excluded_suppliers: z.array(id),
    owner_time_value_cents_per_hour: positive,
  }),
  ingredients: z.array(ingredient).max(100),
  recipes: z.array(recipeSchema).max(100),
  recipe_versions: collection(recipeSchema),
  production,
  production_queue: z.array(production).max(30).optional(),
  production_history: collection(production).optional(),
  lots: collection(
    z.object({
      id,
      ingredient_id: id,
      label: str,
      remaining_base: positive,
      use_by: date,
      recorded_at: date,
    }),
  ).optional(),
  suppliers: z
    .array(
      z.object({
        id,
        name: str,
        mode: str,
        estimated_trip_cash_cost_cents: positive,
        minimum_order_cents: positive,
        shipping_cents: positive.optional(),
        hours: str.optional(),
        ready_at: date,
        excluded: z.boolean().optional(),
        is_sample: z.boolean().optional(),
        timezone: str.optional(),
        location_key: str.optional(),
        address: str.optional(),
      }),
    )
    .max(16),
  offers: z
    .array(
      z.object({
        id,
        supplier_id: id,
        ingredient_id: id,
        pack_quantity_base: positive.min(1),
        pack_price_cents: positive,
        currency: str,
        tax_cents_per_pack: positive.optional(),
        product_specification: str,
        availability: str,
        membership_required: z.boolean().optional(),
        coupon_required: z.boolean().optional(),
        observed_at: date.optional(),
        valid_until: date.optional(),
        available_at: date.optional(),
        source_label: str.optional(),
        source_type: str,
        base_unit: str.optional(),
        maximum_packs: positive.optional(),
        input_quantity: z.number().positive().optional(),
        input_unit: str.optional(),
      }),
    )
    .max(2000),
  price_history: collection(
    z.object({
      ingredient_id: id,
      supplier_id: id,
      date: str,
      pack_quantity_base: positive.min(1),
      pack_price_cents: positive,
      source_type: str,
      label: str,
      location_key: str.optional(),
    }),
  ),
  index_basket: z.array(
    z.object({
      ingredient_id: id,
      quantity_base: positive,
      comparison_supplier_id: id,
    }),
  ),
  inventory: collection(
    z.object({
      id,
      ingredient_id: id,
      quantity_base: integer,
      event_type: str,
      source: str,
      occurred_at: date,
    }),
  ),
  expenses: collection(
    z.object({ id, cents: integer, source: str, occurred_at: date }),
  ),
  orders: collection(
    z.object({
      id,
      status: z.enum([
        "Draft",
        "Approved",
        "Simulated order submitted",
        "Partially received",
        "Received",
        "Cancelled",
      ]),
      plan,
      input_version: positive,
      stale: z.boolean(),
      paid: z.boolean(),
      received: quantities,
      checked: z.record(id, z.boolean()),
      created_at: date,
      simulated_reference: str.optional(),
      baseline: z.object({ name: str, total_cost_cents: positive }).optional(),
      input_snapshot: z
        .object({
          production,
          recipes: z.array(recipeSchema),
          settings: z.object({
            budget_cents: positive,
            cash_reserve_cents: positive,
            maximum_in_person_stops: positive,
            mode: str,
            locale: str,
            excluded_suppliers: z.array(id),
            owner_time_value_cents_per_hour: positive,
          }),
          offers: z.array(
            z
              .object({
                id,
                supplier_id: id,
                ingredient_id: id,
                pack_quantity_base: positive,
                pack_price_cents: positive,
                product_specification: str,
              })
              .passthrough(),
          ),
          inventory: z.array(
            z
              .object({ id, ingredient_id: id, quantity_base: integer })
              .passthrough(),
          ),
          location: z
            .object({ country: str, city: str, state: str, postal_code: str })
            .optional(),
          timezone: str.optional(),
          price_mode: z.enum(["sample", "local"]).optional(),
          suppliers: z
            .array(z.object({ id, name: str }).passthrough())
            .optional(),
        })
        .optional(),
    }),
  ),
  documents: collection(
    z.object({
      id,
      name: str,
      hash: str,
      mime: z.enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
        "text/csv",
        "text/plain",
      ]),
      type: z.enum(["recipe", "receipt", "invoice", "statement", "manual"]),
      mode: z.enum(["sample", "manual", "csv", "local_ocr"]),
      status: z.enum(["Needs review", "Confirmed", "Linked"]),
      storage_key: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+\.bin$/)
        .optional(),
      sample_url: z
        .string()
        .regex(/^\/samples\/(baguette|butter_bun|receipt|statement)\.svg$/)
        .optional(),
      lines: z.array(
        z.object({
          ingredient_id: id,
          quantity_base: positive,
          line_total_cents: positive,
        }),
      ),
      recipe: recipeSchema.optional(),
      external_id: id,
      paid: z.boolean(),
      received: z.boolean(),
      supplier_id: id,
      created_at: date,
      linked_purchase: str.optional(),
      notes: str,
      recognized_text: z.string().max(100000).optional(),
      extraction_status: z.enum(["complete", "empty", "failed"]).optional(),
    }),
  ),
  finished: collection(
    z.object({
      id,
      recipe_id: id,
      quantity: integer,
      kind: str,
      source: str,
      occurred_at: date,
    }),
  ),
  audit: collection(
    z.object({ id, event: str, detail: str, occurred_at: date }),
  ),
  operation_keys: z.array(id).max(20000),
});
const envelope = z.object({
  format: z.literal("beply-workspace"),
  version: z.literal(1),
  created_at: date,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.object({
    state: stateSchema,
    files: z
      .array(
        z.object({
          key: z.string().regex(/^[a-zA-Z0-9_-]+\.bin$/),
          base64: z.string().max(12 * 1024 * 1024),
        }),
      )
      .max(100),
  }),
});
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function createBackup(state: State, root: string) {
  const files = state.documents
    .filter((d) => d.storage_key)
    .map((d) => ({
      key: d.storage_key!,
      base64: readFileSync(
        join(root, "uploads", state.id, d.storage_key!),
      ).toString("base64"),
    }));
  const payload = { state, files };
  const text = JSON.stringify({
    format: "beply-workspace",
    version: 1,
    created_at: new Date().toISOString(),
    checksum: digest(payload),
    payload,
  });
  if (Buffer.byteLength(text) > 32 * 1024 * 1024)
    throw new Error(
      "Workspace backup exceeds the 32 MB pilot limit; use a full server backup.",
    );
  return text;
}
export function validateBackup(text: string) {
  if (Buffer.byteLength(text) > 32 * 1024 * 1024)
    throw new Error("Backup limit is 32 MB.");
  const raw = JSON.parse(text);
  if (raw?.checksum !== digest(raw?.payload))
    throw new Error(
      "Backup checksum mismatch. The file is incomplete or changed.",
    );
  const parsed = envelope.parse(raw),
    s = parsed.payload.state as State;
  for (const key of [
    "ingredients",
    "recipes",
    "suppliers",
    "offers",
    "inventory",
    "expenses",
    "orders",
    "documents",
    "finished",
    "audit",
  ] as const) {
    if (new Set(s[key].map((r) => r.id)).size !== s[key].length)
      throw new Error(`Duplicate ${key} identifiers in backup.`);
  }
  const itemIds = new Set(s.ingredients.map((i) => i.id)),
    recipeIds = new Set(s.recipes.map((r) => r.id)),
    supplierIds = new Set(s.suppliers.map((p) => p.id));
  if (
    s.inventory.some((e) => !itemIds.has(e.ingredient_id)) ||
    s.recipes.some((r) =>
      r.ingredients.some((l) => !itemIds.has(l.ingredient_id)),
    ) ||
    s.offers.some(
      (o) => !itemIds.has(o.ingredient_id) || !supplierIds.has(o.supplier_id),
    ) ||
    [s.production, ...(s.production_queue ?? [])].some((p) =>
      p.items.some((i) => !recipeIds.has(i.recipe_id)),
    ) ||
    s.finished.some((f) => !recipeIds.has(f.recipe_id))
  )
    throw new Error("Backup contains broken record references.");
  const stock = stockOf(s);
  if (
    s.ingredients.some(
      (i) => stock[i.id] < 0 || assignedQuantity(s, i.id) > stock[i.id],
    )
  )
    throw new Error("Backup has inconsistent stock or lot quantities.");
  const files = new Map(
    parsed.payload.files.map((f) => [f.key, Buffer.from(f.base64, "base64")]),
  );
  for (const d of s.documents)
    if (d.storage_key) {
      const bytes = files.get(d.storage_key);
      if (
        !bytes ||
        bytes.length > 8 * 1024 * 1024 ||
        createHash("sha256").update(bytes).digest("hex") !== d.hash
      )
        throw new Error(
          "Backup source file is missing or its hash does not match.",
        );
    }
  return { state: s, files };
}
export function restoreBackup(
  db: Repository,
  owner: string,
  text: string,
  root: string,
) {
  const { state: s, files } = validateBackup(text),
    id = randomUUID();
  for (const o of s.orders)
    if (!["Cancelled", "Received"].includes(o.status)) {
      o.stale = true;
      if (
        !o.paid &&
        !Object.values(o.received).some(Boolean) &&
        o.status !== "Simulated order submitted"
      )
        o.status = "Cancelled";
    }
  s.id = id;
  s.name = `${s.name.slice(0, 95)} · restored`;
  s.revision++;
  s.plan_version++;
  s.audit.unshift({
    id: randomUUID(),
    event: "Workspace restored",
    detail:
      "Restored into a separate workspace; source workspace unchanged. Review existing orders before acting.",
    occurred_at: new Date().toISOString(),
  });
  const dir = join(root, "uploads", id);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const d of s.documents)
      if (d.storage_key)
        writeFileSync(join(dir, d.storage_key), files.get(d.storage_key)!, {
          mode: 0o600,
        });
    db.transaction(() => {
      db.save(owner, s);
      db.db
        .prepare("UPDATE sessions SET active_workspace=? WHERE id=?")
        .run(id, owner);
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return db.read(owner, id);
}
export function writeAutomaticBackup(state: State, root: string) {
  const dir = join(root, "backups", state.id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `${String(Date.now())}-${String(state.revision).padStart(12, "0")}-${randomUUID()}.json`,
    temp = join(dir, `.${name}.tmp`);
  writeFileSync(temp, createBackup(state, root), { mode: 0o600 });
  renameSync(temp, join(dir, name));
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .reverse();
  for (const old of names.slice(5)) unlinkSync(join(dir, old));
  return name;
}
