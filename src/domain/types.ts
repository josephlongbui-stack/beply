import type { BusinessType } from "./business";
export type QuantityMap = Record<string, number>;
export type BusinessLocation = {
  country: "US";
  city: string;
  state: string;
  postal_code: string;
};
export type Ingredient = {
  category?: "ingredient" | "packaging" | "resale" | "supply";
  count_unit?: string;
  reorder_point_base?: number;
  id: string;
  name: string;
  name_vi: string;
  base_unit: "g" | "ml" | "each";
  max_storage_base: number;
  product_specification: string;
  aliases?: string[];
  approved_substitutions?: string[];
  expires_at?: string;
  confidence?: "confirmed" | "needs_checking";
};
export type Recipe = {
  id: string;
  name: string;
  yield_units: number;
  batch_scaling: "whole_batches";
  version: number;
  ingredients: { ingredient_id: string; quantity_base: number }[];
  variable_labor_cents_per_batch: number | null;
  packaging_cents_per_unit: number | null;
  energy_cents_per_batch: number | null;
  allocated_overhead_cents_per_unit: number;
  selling_price_cents: number;
  confirmed?: boolean;
};
export type Supplier = {
  id: string;
  name: string;
  mode: string;
  estimated_trip_cash_cost_cents: number;
  minimum_order_cents: number;
  shipping_cents?: number;
  hours?: string;
  ready_at: string;
  excluded?: boolean;
  is_sample?: boolean;
  timezone?: string;
  location_key?: string;
  address?: string;
};
export type Offer = {
  input_quantity?: number;
  input_unit?: string;
  id: string;
  supplier_id: string;
  ingredient_id: string;
  pack_quantity_base: number;
  pack_price_cents: number;
  currency: string;
  tax_cents_per_pack?: number;
  product_specification: string;
  availability: string;
  membership_required?: boolean;
  coupon_required?: boolean;
  observed_at?: string;
  valid_until?: string;
  available_at?: string;
  source_label?: string;
  source_type: string;
  base_unit?: string;
  maximum_packs?: number;
};
export type PriceObservation = {
  ingredient_id: string;
  supplier_id: string;
  date: string;
  pack_quantity_base: number;
  pack_price_cents: number;
  source_type: string;
  label: string;
  location_key?: string;
};
export type StockLot = {
  id: string;
  ingredient_id: string;
  label: string;
  remaining_base: number;
  use_by: string;
  recorded_at: string;
};
export type Production = {
  label?: string;
  id: string;
  prep_starts_at: string;
  ready_for_sale_at: string;
  status: string;
  items: { recipe_id: string; planned_units: number }[];
  completed_snapshot?: Recipe[];
};
export type Settings = {
  budget_cents: number;
  cash_reserve_cents: number;
  maximum_in_person_stops: number;
  mode: "mixed" | "in_store" | "online";
  locale: "en" | "vi";
  excluded_suppliers: string[];
  owner_time_value_cents_per_hour: number;
};
export type InventoryEvent = {
  id: string;
  ingredient_id: string;
  quantity_base: number;
  event_type: string;
  source: string;
  occurred_at: string;
};
export type Expense = {
  id: string;
  cents: number;
  source: string;
  occurred_at: string;
};
export type PlanLine = {
  ingredient_id: string;
  offer_id: string;
  supplier_id: string;
  packs: number;
  quantity_base: number;
  line_cost_cents: number;
};
export type Plan = {
  status:
    | "feasible"
    | "budget_infeasible"
    | "no_supply_feasible_plan"
    | "needs_review";
  lines: PlanLine[];
  total_cost_cents: number;
  goods_cost_cents: number;
  estimated_trip_cost_cents: number;
  shipping_cents: number;
  supplier_ids: string[];
  required: QuantityMap;
  shortfalls: QuantityMap;
  stock: QuantityMap;
  incoming: QuantityMap;
  leftovers: QuantityMap;
  cash_available_cents: number;
  funding_gap_cents: number;
  exclusions: { offer_id: string; reason: string }[];
  issues: string[];
  batches: {
    recipe_id: string;
    batches: number;
    units: number;
    extra: number;
  }[];
  calculated_at: string;
  input_version: number;
};
export type Order = {
  id: string;
  status:
    | "Draft"
    | "Approved"
    | "Simulated order submitted"
    | "Partially received"
    | "Received"
    | "Cancelled";
  plan: Plan;
  input_version: number;
  stale: boolean;
  paid: boolean;
  received: QuantityMap;
  checked: Record<string, boolean>;
  created_at: string;
  simulated_reference?: string;
  baseline?: { name: string; total_cost_cents: number };
  input_snapshot?: {
    location?: BusinessLocation;
    timezone?: string;
    price_mode?: "sample" | "local";
    suppliers?: Supplier[];
    settings: Settings;
    production: Production;
    recipes: Recipe[];
    offers: Offer[];
    inventory: InventoryEvent[];
  };
};
export type DocumentLine = {
  ingredient_id: string;
  quantity_base: number;
  line_total_cents: number;
};
export type DocumentRecord = {
  id: string;
  name: string;
  hash: string;
  mime: string;
  type: "recipe" | "receipt" | "invoice" | "statement" | "manual";
  mode: "sample" | "manual" | "csv" | "local_ocr";
  recognized_text?: string;
  extraction_status?: "complete" | "empty" | "failed";
  status: "Needs review" | "Confirmed" | "Linked";
  storage_key?: string;
  sample_url?: string;
  lines: DocumentLine[];
  recipe?: Recipe;
  external_id: string;
  paid: boolean;
  received: boolean;
  supplier_id: string;
  created_at: string;
  linked_purchase?: string;
  notes: string;
};
export type Audit = {
  id: string;
  event: string;
  detail: string;
  occurred_at: string;
};
export type FinishedEvent = {
  id: string;
  recipe_id: string;
  quantity: number;
  kind: string;
  source: string;
  occurred_at: string;
};
export type State = {
  business_type?: BusinessType;
  clock_mode?: "live" | "demo";
  lots?: StockLot[];
  production_queue?: Production[];
  production_history?: Production[];
  id: string;
  name: string;
  kind: "sample" | "guided" | "owner";
  revision: number;
  plan_version: number;
  clock: string;
  timezone: string;
  location: BusinessLocation;
  price_mode: "sample" | "local";
  settings: Settings;
  ingredients: Ingredient[];
  recipes: Recipe[];
  recipe_versions: Recipe[];
  production: Production;
  suppliers: Supplier[];
  offers: Offer[];
  price_history: PriceObservation[];
  index_basket: {
    ingredient_id: string;
    quantity_base: number;
    comparison_supplier_id: string;
  }[];
  inventory: InventoryEvent[];
  expenses: Expense[];
  orders: Order[];
  documents: DocumentRecord[];
  finished: FinishedEvent[];
  audit: Audit[];
  operation_keys: string[];
};
export type Derived = {
  plan: Plan;
  oneStore: Plan;
  online: Plan;
  stock: QuantityMap;
  finished: QuantityMap;
  spent: number;
  commitments: number;
  purchasingPower: {
    baseCost: number;
    currentCost: number;
    index: number;
    equivalents: number;
    baseDate: string;
    currentDate: string;
    partial: boolean;
    hasHistory: boolean;
    basis: string;
  };
  costs: Record<string, RecipeCost>;
};
export type RecipeCost = {
  ingredientCents: number;
  variableCents: number;
  allocatedCents: number;
  contributionCents: number;
  margin: number;
  partial: boolean;
};
