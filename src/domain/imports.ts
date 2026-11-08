import { actionSchema } from "./validation";
import { PACKAGE_UNITS } from "./units";
import type { State, Recipe } from "./types";
import { applyAction, contentHash } from "./service";
export type ImportKind = "recipes" | "purchases" | "production" | "quotes";
export type CsvPreview = {
  kind: ImportKind;
  rows: Record<string, string>[];
  errors: { row: number; message: string }[];
  hash: string;
};
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function normalizedQuantity(
  s: State,
  name: string,
  value: string,
  unit: string,
) {
  const ingredient = s.ingredients.find((i) =>
    [i.id, i.name, i.name_vi, ...(i.aliases ?? [])].some(
      (n) => n.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    ),
  );
  if (!ingredient)
    throw new Error(`Unmatched ingredient '${name}'; confirm an alias first`);
  const amount = Number(value);
  if (!value.trim() || !Number.isFinite(amount) || amount <= 0)
    throw new Error("Quantity must be positive");
  const conversion: Record<string, { base: string; factor: number }> = {
    g: { base: "g", factor: 1 },
    kg: { base: "g", factor: 1000 },
    ml: { base: "ml", factor: 1 },
    l: { base: "ml", factor: 1000 },
    each: { base: "each", factor: 1 },
    dozen: { base: "each", factor: 12 },
  };
  const known = conversion[unit.trim().toLowerCase()];
  if (!known)
    throw new Error(
      `Unknown package/unit '${unit}'; specify confirmed g, kg, ml, L, each or dozen`,
    );
  if (known.base !== ingredient.base_unit)
    throw new Error(
      "Mass/volume mismatch; ingredient-specific conversion is not confirmed",
    );
  const quantity = Math.round(amount * known.factor);
  if (
    Math.abs(quantity - amount * known.factor) > 0.000001 ||
    !Number.isSafeInteger(quantity)
  )
    throw new Error("Quantity must resolve to whole base units");
  return { ingredient_id: ingredient.id, quantity_base: quantity };
}

function quoteAction(s: State, r: Record<string, string>) {
  const item = s.ingredients.find((i) =>
    [i.id, i.name, i.name_vi, ...(i.aliases ?? [])].some(
      (n) => n.toLowerCase() === r.ingredient?.toLowerCase(),
    ),
  );
  const supplier = s.suppliers.find(
    (p) => p.id === r.supplier || p.name === r.supplier,
  );
  if (!item || !supplier)
    throw new Error("Match the stock item and a local supplier first.");
  if (
    !/^\d+(\.\d{1,2})?$/.test(r.pack_price_usd) ||
    !/^\d+(\.\d{1,2})?$/.test(r.tax_usd)
  )
    throw new Error(
      "Package price and tax must be nonnegative USD amounts with at most two decimals.",
    );
  if (!r.quantity || !r.maximum_packs || !Object.hasOwn(PACKAGE_UNITS, r.unit))
    throw new Error(
      "Confirm the package quantity, supported package unit and maximum packs.",
    );
  return actionSchema.parse({
    type: "local_quote",
    supplier_id: supplier.id,
    ingredient_id: item.id,
    package_quantity: Number(r.quantity),
    package_unit: r.unit,
    pack_price_cents: Math.round(Number(r.pack_price_usd) * 100),
    tax_cents_per_pack: Math.round(Number(r.tax_usd) * 100),
    maximum_packs: Number(r.maximum_packs),
    availability: r.availability,
    observed_at: r.observed_at,
    valid_until: r.valid_until,
    source_label: r.source_label,
  });
}

export function previewCsv(
  s: State,
  text: string,
  kind: ImportKind,
): CsvPreview {
  const all = parseCsv(text);
  if (all.length < 2)
    throw new Error("CSV needs a header and at least one data row");
  if (all.length > 501) throw new Error("Limit CSV imports to 500 rows");
  const headers = all[0].map((h) => h.trim()),
    required = {
      quotes: [
        "supplier",
        "ingredient",
        "quantity",
        "unit",
        "pack_price_usd",
        "tax_usd",
        "maximum_packs",
        "availability",
        "observed_at",
        "valid_until",
        "source_label",
      ],
      recipes: [
        "recipe_name",
        "recipe_yield_units",
        "ingredient",
        "quantity",
        "unit",
      ],
      purchases: [
        "external_id",
        "supplier",
        "purchase_date",
        "ingredient",
        "quantity",
        "unit",
        "line_total_usd",
        "payment_status",
        "received",
      ],
      production: [
        "external_id",
        "recipe_name",
        "planned_units",
        "prep_starts_at",
        "ready_for_sale_at",
        "status",
      ],
    }[kind];
  const errors: CsvPreview["errors"] = [];
  for (const h of required)
    if (!headers.includes(h))
      errors.push({ row: 1, message: `Missing column ${h}` });
  const rows = all
    .slice(1)
    .map((cols) =>
      Object.fromEntries(headers.map((h, i) => [h, cols[i]?.trim() ?? ""])),
    );
  rows.forEach((r, index) => {
    try {
      if (all[index + 1].length !== headers.length)
        throw new Error("Column count does not match header");
      if (kind === "quotes") applyAction(s, quoteAction(s, r));
      if (kind !== "production" && kind !== "quotes")
        normalizedQuantity(s, r.ingredient, r.quantity, r.unit);
      if (kind === "recipes") {
        if (
          !r.recipe_name ||
          !Number.isInteger(+r.recipe_yield_units) ||
          +r.recipe_yield_units <= 0
        )
          throw new Error("Recipe name and positive whole yield required");
      }
      if (kind === "purchases") {
        if (!r.external_id || !/^[\w:.-]+$/.test(r.external_id))
          throw new Error("A stable external purchase ID is required");
        if (
          !s.suppliers.some((p) => p.name === r.supplier || p.id === r.supplier)
        )
          throw new Error("Unknown supplier");
        if (!/^\d+(\.\d{1,2})?$/.test(r.line_total_usd))
          throw new Error(
            "Line total must be a nonnegative USD amount with at most two decimals",
          );
        if (
          !["paid_cash", "paid", "unpaid"].includes(r.payment_status) ||
          !["true", "false"].includes(r.received)
        )
          throw new Error(
            "Use paid_cash/paid/unpaid and true/false for receipt status",
          );
        if (r.purchase_date !== s.clock.slice(0, 10))
          throw new Error(
            "Backdated purchases need manual reconciliation; demo CSV imports use the current simulated date",
          );
      }
      if (kind === "production") {
        if (!s.recipes.some((x) => x.name === r.recipe_name))
          throw new Error("Confirm recipe before production import");
        if (
          !r.planned_units ||
          !Number.isInteger(+r.planned_units) ||
          +r.planned_units < 0 ||
          +r.planned_units > 2000
        )
          throw new Error(
            "Planned units must be a whole number from 0 to 2000",
          );
        if (
          !Number.isFinite(Date.parse(r.prep_starts_at)) ||
          Date.parse(r.prep_starts_at) < Date.parse(s.clock) ||
          Date.parse(r.ready_for_sale_at) <= Date.parse(r.prep_starts_at)
        )
          throw new Error("Invalid preparation or sale deadline");
        if (r.status !== "planned")
          throw new Error(
            "CSV can plan production only; completion needs owner confirmation",
          );
      }
    } catch (e) {
      errors.push({ row: index + 2, message: (e as Error).message });
    }
  });
  if (
    kind === "production" &&
    rows.some(
      (r) =>
        r.prep_starts_at !== rows[0].prep_starts_at ||
        r.ready_for_sale_at !== rows[0].ready_for_sale_at,
    )
  )
    errors.push({
      row: 1,
      message: "Import one production cycle with common deadlines at a time",
    });
  if (kind === "quotes") {
    const pairs = rows.map((r) =>
      `${r.supplier}::${r.ingredient}`.toLowerCase(),
    );
    if (new Set(pairs).size !== pairs.length)
      errors.push({
        row: 1,
        message:
          "Use one package quote per supplier and stock item in each import.",
      });
  }
  if (kind === "recipes")
    for (const name of new Set(rows.map((r) => r.recipe_name))) {
      const group = rows.filter((r) => r.recipe_name === name);
      if (
        group.some((r) => r.recipe_yield_units !== group[0].recipe_yield_units)
      )
        errors.push({ row: 1, message: `Conflicting yields for ${name}` });
    }
  return { kind, rows, errors, hash: contentHash(`${kind}:${text}`) };
}
export function commitCsv(
  original: State,
  text: string,
  kind: ImportKind,
  documentId: string,
): State {
  const preview = previewCsv(original, text, kind);
  if (preview.errors.length)
    throw new Error("Resolve all CSV row errors before committing");
  if (original.operation_keys.includes(`csv:${preview.hash}`)) return original;
  let s = structuredClone(original);
  const rows = preview.rows;
  if (kind === "quotes")
    for (const row of rows) s = applyAction(s, quoteAction(s, row));
  if (kind === "recipes")
    for (const name of new Set(rows.map((r) => r.recipe_name))) {
      const group = rows.filter((r) => r.recipe_name === name),
        existing = s.recipes.find((r) => r.name === name);
      const recipe: Recipe = {
        id: existing?.id ?? `recipe_${contentHash(name).slice(0, 12)}`,
        name,
        yield_units: +group[0].recipe_yield_units,
        version: 1,
        batch_scaling: "whole_batches",
        ingredients: group.map((r) =>
          normalizedQuantity(s, r.ingredient, r.quantity, r.unit),
        ),
        variable_labor_cents_per_batch:
          existing?.variable_labor_cents_per_batch ?? null,
        packaging_cents_per_unit: existing?.packaging_cents_per_unit ?? null,
        energy_cents_per_batch: existing?.energy_cents_per_batch ?? null,
        allocated_overhead_cents_per_unit:
          existing?.allocated_overhead_cents_per_unit ?? 0,
        selling_price_cents: existing?.selling_price_cents ?? 0,
      };
      s = applyAction(s, { type: "recipe", recipe });
    }
  if (kind === "production")
    s = applyAction(s, {
      type: "production",
      items: rows.map((r) => ({
        recipe_id: s.recipes.find((x) => x.name === r.recipe_name)!.id,
        planned_units: +r.planned_units,
      })),
      prep_starts_at: rows[0].prep_starts_at,
      ready_for_sale_at: rows[0].ready_for_sale_at,
    });
  if (kind === "purchases")
    for (const external_id of new Set(rows.map((r) => r.external_id))) {
      const group = rows.filter((r) => r.external_id === external_id),
        r = group[0];
      if (
        group.some(
          (x) =>
            x.supplier !== r.supplier ||
            x.payment_status !== r.payment_status ||
            x.received !== r.received,
        )
      )
        throw new Error(
          "Conflicting purchase metadata for the same external ID",
        );
      const id = `csv_${contentHash(external_id).slice(0, 12)}`;
      if (!s.documents.some((d) => d.id === id))
        s.documents.push({
          id,
          name: `CSV purchase ${external_id}`,
          hash: preview.hash,
          mime: "text/csv",
          type: "receipt",
          mode: "csv",
          status: "Needs review",
          external_id,
          supplier_id: s.suppliers.find(
            (p) => p.name === r.supplier || p.id === r.supplier,
          )!.id,
          paid: r.payment_status !== "unpaid",
          received: r.received === "true",
          lines: group.map((x) => ({
            ...normalizedQuantity(s, x.ingredient, x.quantity, x.unit),
            line_total_cents: Math.round(+x.line_total_usd * 100),
          })),
          created_at: s.clock,
          notes: `Imported from ${documentId}`,
        });
      s = applyAction(s, {
        type: "review_document",
        document: s.documents.find((d) => d.id === id)!,
      });
    }
  const doc = s.documents.find((d) => d.id === documentId);
  if (doc) {
    doc.status = "Confirmed";
    doc.notes = `${rows.length} validated ${kind} CSV rows committed.`;
  }
  s.operation_keys.push(`csv:${preview.hash}`);
  s.revision++;
  return s;
}
export function safeCsv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          let value = String(v ?? "");
          if (/^[\s]*[=+@-]/.test(value)) value = "'" + value;
          return '"' + value.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
