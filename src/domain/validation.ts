import { z } from "zod";
import { PACKAGE_UNITS } from "./units";
import { US_STATES, US_TIMEZONES } from "./location";
const int = z.number().int().nonnegative().max(100000000);
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_:.-]+$/)
  .refine(
    (v) => !["__proto__", "constructor", "prototype"].includes(v),
    "Reserved identifier",
  );
const date = z.string().datetime({ offset: true });
const timezone = z
  .string()
  .refine(
    (v) => US_TIMEZONES.some(([zone]) => zone === v),
    "Choose a supported US timezone",
  );
export const locationSchema = z.object({
  country: z.literal("US"),
  city: z.string().trim().min(1).max(100),
  state: z
    .string()
    .refine(
      (v) => US_STATES.some(([code]) => code === v),
      "Choose a US state or territory",
    ),
  postal_code: z
    .string()
    .regex(/^\d{5}(?:-\d{4})?$/, "Use a five-digit ZIP or ZIP+4"),
});
export const recipeSchema = z.object({
  id,
  name: z.string().trim().min(1).max(140),
  yield_units: int.min(1).max(10000),
  batch_scaling: z.literal("whole_batches"),
  version: int.min(1),
  ingredients: z
    .array(z.object({ ingredient_id: id, quantity_base: int.min(1) }))
    .min(1)
    .max(30),
  variable_labor_cents_per_batch: int.nullable(),
  packaging_cents_per_unit: int.nullable(),
  energy_cents_per_batch: int.nullable(),
  allocated_overhead_cents_per_unit: int,
  selling_price_cents: int,
  confirmed: z.boolean().optional(),
});
export const documentSchema = z.object({
  id,
  type: z.enum(["recipe", "receipt", "invoice", "statement", "manual"]),
  external_id: id,
  supplier_id: id,
  paid: z.boolean(),
  received: z.boolean(),
  lines: z
    .array(
      z.object({
        ingredient_id: id,
        quantity_base: int.min(1),
        line_total_cents: int,
      }),
    )
    .max(50),
  recipe: recipeSchema.optional(),
  notes: z.string().max(2000).optional(),
  linked_purchase: z.string().max(160).optional(),
});
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lot"),
    ingredient_id: id,
    label: z.string().trim().min(1).max(100),
    quantity_base: int.min(1),
    use_by: date,
    operation_key: id,
  }),
  z.object({
    type: z.literal("queue_production"),
    label: z.string().trim().min(1).max(100),
    items: z
      .array(z.object({ recipe_id: id, planned_units: int.min(1).max(2000) }))
      .min(1)
      .max(10),
    prep_starts_at: date,
    ready_for_sale_at: date,
    operation_key: id,
  }),
  z.object({ type: z.literal("activate_production"), production_id: id }),
  z.object({ type: z.literal("remove_queued_production"), production_id: id }),

  z.object({
    type: z.literal("catalog_item"),
    name: z.string().trim().min(1).max(100),
    name_vi: z.string().trim().max(100),
    category: z.enum(["ingredient", "packaging", "resale", "supply"]),
    base_unit: z.enum(["g", "ml", "each"]),
    count_unit: z.string().trim().min(1).max(30),
    product_specification: z.string().trim().min(1).max(200),
    max_storage_base: int.min(1),
    reorder_point_base: int,
    operation_key: id,
  }),
  z.object({
    type: z.literal("location"),
    business_type: z
      .enum(["bakery", "cafe", "restaurant", "food_truck", "caterer"])
      .optional(),
    name: z.string().trim().min(1).max(120),
    location: locationSchema,
    timezone,
    price_mode: z.enum(["sample", "local"]),
  }),
  z.object({
    type: z.literal("local_supplier"),
    supplier_id: id.optional(),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(200),
    mode: z.enum(["in_store", "online"]),
    ready_at: date,
    timezone,
    hours: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/),
    estimated_trip_cash_cost_cents: int,
    minimum_order_cents: int,
    shipping_cents: int,
  }),
  z.object({
    type: z.literal("local_quote"),
    offer_id: id.optional(),
    supplier_id: id,
    ingredient_id: id,
    package_quantity: z.number().positive().max(100000000),
    package_unit: z.enum(
      Object.keys(PACKAGE_UNITS) as [
        keyof typeof PACKAGE_UNITS,
        ...(keyof typeof PACKAGE_UNITS)[],
      ],
    ),
    pack_price_cents: int,
    tax_cents_per_pack: int,
    maximum_packs: int.max(100),
    availability: z.enum(["confirmed", "unknown", "out_of_stock"]),
    observed_at: date,
    valid_until: date,
    source_label: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("manual_document"),
    kind: z.enum(["recipe", "receipt", "invoice", "statement"]),
  }),
  z.object({
    type: z.literal("settings"),
    settings: z.object({
      budget_cents: int,
      cash_reserve_cents: int,
      maximum_in_person_stops: int.max(3),
      mode: z.enum(["mixed", "in_store", "online"]),
      locale: z.enum(["en", "vi"]),
      excluded_suppliers: z.array(id).max(20),
      owner_time_value_cents_per_hour: int,
    }),
  }),
  z.object({
    type: z.literal("production"),
    items: z
      .array(z.object({ recipe_id: id, planned_units: int.max(2000) }))
      .max(10),
    prep_starts_at: date,
    ready_for_sale_at: date,
  }),
  z.object({ type: z.literal("recipe"), recipe: recipeSchema }),
  z.object({
    type: z.literal("count"),
    ingredient_id: id,
    quantity_base: int,
    observed_at: date,
    operation_key: id,
  }),
  z.object({
    type: z.literal("waste"),
    ingredient_id: id,
    quantity_base: int.min(1),
    operation_key: id,
  }),
  z.object({
    type: z.literal("ingredient"),
    ingredient_id: id,
    reorder_point_base: int.optional(),
    max_storage_base: int,
    aliases: z.array(z.string().min(1).max(100)).max(20),
    expires_at: date.optional(),
    approved_substitutions: z.array(z.string().max(200)).max(10),
    confidence: z.enum(["confirmed", "needs_checking"]),
  }),
  z.object({
    type: z.literal("offer"),
    offer_id: id,
    pack_price_cents: int,
    availability: z.enum([
      "in_stock_demo",
      "confirmed",
      "unknown",
      "out_of_stock",
    ]),
  }),
  z.object({
    type: z.literal("supplier"),
    supplier_id: id,
    estimated_trip_cash_cost_cents: int,
  }),
  z.object({
    type: z.literal("approve"),
    plan_version: int,
    operation_key: id,
  }),
  z.object({ type: z.literal("draft"), plan_version: int, operation_key: id }),
  z.object({ type: z.literal("submit"), order_id: id }),
  z.object({ type: z.literal("pay"), order_id: id }),
  z.object({ type: z.literal("cancel"), order_id: id }),
  z.object({
    type: z.literal("receive"),
    order_id: id,
    quantities: z.record(z.string(), int),
    operation_key: id,
  }),
  z.object({
    type: z.literal("check"),
    order_id: id,
    offer_id: id,
    checked: z.boolean(),
  }),
  z.object({ type: z.literal("complete_production"), operation_key: id }),
  z.object({
    type: z.literal("sell"),
    recipe_id: id,
    quantity: int.min(1),
    operation_key: id,
  }),
  z.object({
    type: z.literal("sample"),
    sample: z.enum(["baguette", "butter_bun", "receipt", "statement"]),
  }),
  z.object({ type: z.literal("review_document"), document: documentSchema }),
  z.object({ type: z.literal("confirm_opening"), operation_key: id }),
]);
export type Action = z.infer<typeof actionSchema>;
