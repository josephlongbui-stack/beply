"use client";
import { useState } from "react";
import { BookOpen, Package, Download, Plus, CheckCircle2 } from "lucide-react";
import type { Recipe, Ingredient } from "../domain/types";
import {
  useApp,
  useT,
  PageHeading,
  Button,
  Card,
  Badge,
  Field,
  Note,
  Modal,
  Empty,
  money,
  qty,
  dateTime,
  shortRecipe,
} from "./ui";
import { localDateTime, zonedInstant } from "../domain/location";
import Perishables from "./Perishables";
import PrepQueue from "./PrepQueue";
import CatalogItemEditor from "./CatalogItemEditor";
import { ProductionEditor } from "./PlanView";
import { expiredQuantity } from "../domain/perishables";
import { stockConfidence } from "../domain/engine";
export default function Inventory() {
  const { state: s, derived: d, mutate, busy, setView } = useApp(),
    t = useT();
  const [tab, setTab] = useState("stock"),
    [catalogOpen, setCatalogOpen] = useState(false),
    [recipe, setRecipe] = useState<Recipe | null>(null),
    [stockEdit, setStockEdit] = useState<{
      ingredient: Ingredient;
      mode: "count" | "waste" | "rules";
    } | null>(null),
    [confirmProduce, setConfirmProduce] = useState(false),
    [productionOpen, setProductionOpen] = useState(false),
    [sale, setSale] = useState<string | null>(null);
  return (
    <>
      <PageHeading
        eyebrow="PRIVATE FOOD BUSINESS LEDGER"
        title="Know what’s on your shelves."
        description="Recipes describe what you use. Confirmed events tell you what you have."
        action={
          <Button variant="secondary" onClick={() => setView("documents")}>
            <Plus size={16} />
            Add recipe or receipt
          </Button>
        }
      />
      <div className="tabs" role="tablist" aria-label="Recipes and inventory">
        <button
          role="tab"
          aria-selected={tab === "stock"}
          className={tab === "stock" ? "active" : ""}
          onClick={() => setTab("stock")}
        >
          <Package size={16} />
          Stock ledger
        </button>
        <button
          role="tab"
          aria-selected={tab === "recipes"}
          className={tab === "recipes" ? "active" : ""}
          onClick={() => setTab("recipes")}
        >
          <BookOpen size={16} />
          Recipes
        </button>
      </div>
      {tab === "recipes" ? (
        <div className="recipe-grid">
          {s.recipes.map((r) => (
            <Card key={r.id}>
              <div className="section-head">
                <span className="recipe-symbol">
                  <BookOpen size={25} />
                </span>
                <Badge>Version {r.version}</Badge>
              </div>
              <h2>{shortRecipe(r.name)}</h2>
              <p>{r.yield_units} units per whole batch · owner reviewed</p>
              <dl className="recipe-lines">
                {r.ingredients.map((l) => (
                  <div key={l.ingredient_id}>
                    <dt>
                      {
                        s.ingredients.find((i) => i.id === l.ingredient_id)
                          ?.name
                      }
                    </dt>
                    <dd>
                      {qty(
                        l.quantity_base,
                        s.ingredients.find((i) => i.id === l.ingredient_id),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="recipe-cost">
                <span>Ingredient cost / unit</span>
                <strong>
                  {money(d.costs[r.id].ingredientCents)}
                  {d.costs[r.id].partial ? " · partial" : ""}
                </strong>
              </div>
              <p className="caption">
                {d.purchasingPower.basis} · {dateTime(s.clock, s.timezone)}.
                {s.kind !== "owner"
                  ? "Simplified software fixture, not a complete recipe."
                  : "Calculated from your confirmed recipe and supplier quotes."}
              </p>
              <Button
                variant="secondary"
                className="full-width"
                onClick={() => setRecipe(r)}
              >
                Review & edit recipe
              </Button>
            </Card>
          ))}
          {!s.recipes.length && (
            <Empty title="Your recipe book starts here">
              Review a sample recipe or enter one in Documents. No ingredients
              are inferred from an empty recipe book.
            </Empty>
          )}
        </div>
      ) : (
        <>
          <Card>
            <div className="section-head">
              <div>
                <h2>Ingredients & supplies</h2>
                <p>All quantities come from the same stock ledger.</p>
              </div>
              <div className="button-row">
                <Button onClick={() => setCatalogOpen(true)}>
                  <Plus size={16} />
                  Add stock item
                </Button>
                <a
                  className="button secondary"
                  href="/api/export?kind=inventory"
                >
                  <Download size={16} />
                  Export stock
                </a>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th className="numeric">On hand</th>
                    <th className="numeric">Reserved</th>
                    <th className="numeric">Usable free</th>
                    <th className="numeric">Incoming</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ingredients.map((i) => {
                    const usable = Math.max(
                      0,
                      d.stock[i.id] -
                        expiredQuantity(s, i.id, s.production.prep_starts_at),
                    );
                    const reserved = Math.min(usable, d.plan.required[i.id]);
                    return (
                      <tr key={i.id}>
                        <th scope="row">
                          {s.settings.locale === "vi" ? i.name_vi : i.name}
                          <small>
                            {stockConfidence(s, i.id)} ·{" "}
                            {i.category ?? "ingredient"}
                          </small>
                          {i.confidence === "confirmed" &&
                            (i.reorder_point_base ?? 0) > 0 &&
                            d.stock[i.id] <= i.reorder_point_base! && (
                              <Badge tone="warn">
                                At or below reorder point
                              </Badge>
                            )}
                          <small>
                            Last count:{" "}
                            {s.inventory.findLast(
                              (e) =>
                                e.ingredient_id === i.id &&
                                [
                                  "opening_count",
                                  "count_reconciliation",
                                ].includes(e.event_type),
                            )?.occurred_at
                              ? dateTime(
                                  s.inventory.findLast(
                                    (e) =>
                                      e.ingredient_id === i.id &&
                                      [
                                        "opening_count",
                                        "count_reconciliation",
                                      ].includes(e.event_type),
                                  )!.occurred_at,
                                  s.timezone,
                                )
                              : "Not confirmed"}
                          </small>
                        </th>
                        <td className="numeric emph">
                          {i.confidence === "needs_checking"
                            ? "Uncounted"
                            : qty(d.stock[i.id], i)}
                        </td>
                        <td className="numeric">{qty(reserved, i)}</td>
                        <td className="numeric">{qty(usable - reserved, i)}</td>
                        <td className="numeric">
                          {qty(d.plan.incoming[i.id] ?? 0, i)}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() =>
                                setStockEdit({ ingredient: i, mode: "count" })
                              }
                            >
                              Count
                            </button>
                            <button
                              onClick={() =>
                                setStockEdit({ ingredient: i, mode: "waste" })
                              }
                            >
                              Waste
                            </button>
                            <button
                              onClick={() =>
                                setStockEdit({ ingredient: i, mode: "rules" })
                              }
                            >
                              Rules
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="caption">
              Reserved stock is allocated to the current production cycle. It is
              still on hand and is consumed only when production is recorded.
            </p>
          </Card>
          <Perishables />
          <PrepQueue />
          <div className="two-column">
            <Card>
              <div className="section-head">
                <div>
                  <div className="eyebrow">CLOSE THE PRODUCTION LOOP</div>
                  <h2>From ingredients to finished goods</h2>
                </div>
                <CheckCircle2 className="muted" size={22} />
              </div>
              <p>
                Recording production consumes the confirmed recipe quantities
                once and creates the whole-batch yield.
              </p>
              <div className="button-row">
                <Button
                  disabled={
                    busy ||
                    s.production.status === "completed" ||
                    !s.production.items.length
                  }
                  onClick={() => setConfirmProduce(true)}
                >
                  {s.production.status === "completed"
                    ? "Production recorded"
                    : t.production}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setProductionOpen(true)}
                >
                  Plan next cycle
                </Button>
              </div>
              <Note>
                Sample completion uses scheduled times; owner records use actual
                confirmation time. Selling finished goods never consumes raw
                stock again.
              </Note>
            </Card>
            <Card>
              <div className="section-head">
                <h2>Finished goods</h2>
                <Badge>
                  {Object.values(d.finished).reduce((a, b) => a + b, 0)} units
                </Badge>
              </div>
              {s.recipes.map((r) => (
                <div className="finished-row" key={r.id}>
                  <span>
                    <strong>{shortRecipe(r.name)}</strong>
                    <small>{d.finished[r.id] ?? 0} units available</small>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!(d.finished[r.id] > 0)}
                    onClick={() => setSale(r.id)}
                  >
                    Record sale
                  </Button>
                </div>
              ))}
            </Card>
          </div>
          <Card>
            <div className="section-head">
              <h2>Inventory movement history</h2>
              <Badge>Append-only events</Badge>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Ingredient</th>
                    <th className="numeric">Change</th>
                    <th>Source</th>
                    <th>Recorded time</th>
                  </tr>
                </thead>
                <tbody>
                  {s.inventory
                    .toReversed()
                    .slice(0, 30)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.event_type.replaceAll("_", " ")}</td>
                        <td>
                          {
                            s.ingredients.find((i) => i.id === e.ingredient_id)
                              ?.name
                          }
                        </td>
                        <td className="numeric">
                          {e.quantity_base > 0 ? "+" : ""}
                          {qty(
                            e.quantity_base,
                            s.ingredients.find((i) => i.id === e.ingredient_id),
                          )}
                        </td>
                        <td className="source-cell">{e.source}</td>
                        <td>{dateTime(e.occurred_at, s.timezone)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!s.inventory.length && (
              <Empty title="No confirmed stock">
                Enter current counts or confirm the explicit sample opening
                counts in the guided demo.
              </Empty>
            )}
          </Card>
        </>
      )}
      {recipe && (
        <RecipeEditor recipe={recipe} onClose={() => setRecipe(null)} />
      )}{" "}
      {catalogOpen && (
        <CatalogItemEditor onClose={() => setCatalogOpen(false)} />
      )}
      {stockEdit && (
        <StockEditor
          ingredient={stockEdit.ingredient}
          mode={stockEdit.mode}
          onClose={() => setStockEdit(null)}
        />
      )}
      {confirmProduce && (
        <Modal
          title="Confirm production completed"
          onClose={() => setConfirmProduce(false)}
        >
          <p>
            Record the actual completion of{" "}
            {s.production.items
              .map(
                (i) =>
                  `${i.planned_units} ${shortRecipe(s.recipes.find((r) => r.id === i.recipe_id)?.name ?? i.recipe_id)}`,
              )
              .join(" and ")}{" "}
            using the current recipe versions.
          </p>
          <Note>
            Stock must be physically received and usable. This demo records the
            scheduled quantities; it cannot infer actual oven output.
          </Note>
          <div className="modal-actions">
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate({
                    type: "complete_production",
                    operation_key: crypto.randomUUID(),
                  })
                )
                  setConfirmProduce(false);
              }}
            >
              Complete production
            </Button>
          </div>
        </Modal>
      )}
      {productionOpen && (
        <ProductionEditor onClose={() => setProductionOpen(false)} />
      )}{" "}
      {sale && <SaleEditor recipeId={sale} onClose={() => setSale(null)} />}
    </>
  );
}
export function RecipeFields({
  recipe: r,
  onChange,
}: {
  recipe: Recipe;
  onChange: (r: Recipe) => void;
}) {
  const { state: s } = useApp();
  return (
    <>
      <div className="form-grid">
        <Field label="Recipe name">
          <input
            required
            maxLength={140}
            value={r.name}
            onChange={(e) => onChange({ ...r, name: e.target.value })}
          />
        </Field>
        <Field label="Yield per whole batch">
          <input
            aria-label="Recipe yield"
            required
            type="number"
            min="1"
            max="10000"
            value={r.yield_units}
            onChange={(e) => onChange({ ...r, yield_units: +e.target.value })}
          />
        </Field>
      </div>
      <h3>Ingredients per batch</h3>
      {r.ingredients.map((line, index) => (
        <div className="ingredient-edit" key={index}>
          <Field label="Confirmed ingredient">
            <select
              value={line.ingredient_id}
              onChange={(e) =>
                onChange({
                  ...r,
                  ingredients: r.ingredients.map((l, j) =>
                    j === index ? { ...l, ingredient_id: e.target.value } : l,
                  ),
                })
              }
            >
              {s.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.base_unit})
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Quantity (${s.ingredients.find((i) => i.id === line.ingredient_id)?.base_unit})`}
          >
            <input
              required
              type="number"
              min="1"
              step="1"
              value={line.quantity_base}
              onChange={(e) =>
                onChange({
                  ...r,
                  ingredients: r.ingredients.map((l, j) =>
                    j === index ? { ...l, quantity_base: +e.target.value } : l,
                  ),
                })
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onChange({
                ...r,
                ingredients: r.ingredients.filter((_, j) => j !== index),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange({
            ...r,
            ingredients: [
              ...r.ingredients,
              {
                ingredient_id:
                  s.ingredients.find(
                    (i) => !r.ingredients.some((l) => l.ingredient_id === i.id),
                  )?.id ?? "flour",
                quantity_base: 1,
              },
            ],
          })
        }
      >
        Add ingredient
      </Button>
      <details>
        <summary>Cost assumptions · USD</summary>
        <div className="form-grid">
          {[
            ["variable_labor_cents_per_batch", "Variable labor / batch"],
            ["packaging_cents_per_unit", "Packaging / unit"],
            ["energy_cents_per_batch", "Variable energy / batch"],
            ["allocated_overhead_cents_per_unit", "Allocated overhead / unit"],
            ["selling_price_cents", "Current selling price / unit"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              hint="Leave labor, packaging or energy empty for a partial estimate."
            >
              <input
                type="number"
                step="0.01"
                min="0"
                value={
                  r[key as keyof Recipe] === null
                    ? ""
                    : Number(r[key as keyof Recipe]) / 100
                }
                onChange={(e) =>
                  onChange({
                    ...r,
                    [key]:
                      e.target.value === "" &&
                      [
                        "variable_labor_cents_per_batch",
                        "packaging_cents_per_unit",
                        "energy_cents_per_batch",
                      ].includes(key)
                        ? null
                        : Math.round(+e.target.value * 100),
                  })
                }
              />
            </Field>
          ))}
        </div>
      </details>
    </>
  );
}
function RecipeEditor({
  recipe,
  onClose,
}: {
  recipe: Recipe;
  onClose: () => void;
}) {
  const { mutate, busy } = useApp(),
    [r, setR] = useState(recipe);
  return (
    <Modal title="Review recipe version" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await mutate({ type: "recipe", recipe: r })) onClose();
        }}
      >
        <RecipeFields recipe={r} onChange={setR} />
        <Note>
          Saving creates a new recipe version. Completed production retains its
          original recipe snapshot. Ingredient specifications are never silently
          substituted.
        </Note>
        <div className="modal-actions">
          <Button disabled={busy}>Confirm recipe version</Button>
        </div>
      </form>
    </Modal>
  );
}
function StockEditor({
  ingredient: i,
  mode,
  onClose,
}: {
  ingredient: Ingredient;
  mode: "count" | "waste" | "rules";
  onClose: () => void;
}) {
  const { state: s, derived: d, mutate, busy } = useApp(),
    [amount, setAmount] = useState(mode === "count" ? d.stock[i.id] : 0),
    [rules, setRules] = useState(i),
    [aliases, setAliases] = useState((i.aliases ?? []).join(", ")),
    [substitutes, setSubstitutes] = useState(
      (i.approved_substitutions ?? []).join("\n"),
    ),
    [expiry, setExpiry] = useState(
      i.expires_at ? localDateTime(i.expires_at, s.timezone) : "",
    );
  let expiryInstant: string | undefined,
    dateError = "";
  try {
    expiryInstant = expiry
      ? zonedInstant(expiry, s.timezone, "earlier")
      : undefined;
  } catch (e) {
    dateError = (e as Error).message;
  }
  return (
    <Modal
      title={`${mode === "rules" ? "Storage & matching" : mode === "count" ? "Confirm physical count" : "Record waste"} · ${i.name}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok =
            mode === "rules"
              ? await mutate({
                  type: "ingredient",
                  ingredient_id: i.id,
                  max_storage_base: rules.max_storage_base,
                  reorder_point_base: rules.reorder_point_base ?? 0,
                  aliases: aliases
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  approved_substitutions: substitutes
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  expires_at: expiryInstant,
                  confidence: rules.confidence ?? "confirmed",
                })
              : await mutate(
                  mode === "count"
                    ? {
                        type: "count",
                        ingredient_id: i.id,
                        quantity_base: amount,
                        observed_at: s.clock,
                        operation_key: crypto.randomUUID(),
                      }
                    : {
                        type: "waste",
                        ingredient_id: i.id,
                        quantity_base: amount,
                        operation_key: crypto.randomUUID(),
                      },
                );
          if (ok) onClose();
        }}
      >
        {mode === "rules" ? (
          <>
            <Field label={`Storage capacity (${i.base_unit})`}>
              <input
                type="number"
                min="0"
                step="1"
                value={rules.max_storage_base}
                onChange={(e) =>
                  setRules({ ...rules, max_storage_base: +e.target.value })
                }
              />
            </Field>
            <Field
              label={`Low-stock reminder at (${i.base_unit})`}
              hint="A reminder only. Purchasing still follows your confirmed plan."
            >
              <input
                type="number"
                min="0"
                max={rules.max_storage_base}
                step="1"
                value={rules.reorder_point_base ?? 0}
                onChange={(e) =>
                  setRules({ ...rules, reorder_point_base: +e.target.value })
                }
              />
            </Field>
            <Field label="Ingredient aliases, separated by commas">
              <input
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </Field>
            <Field label="Owner-approved substitute specifications (one per line)">
              <textarea
                value={substitutes}
                onChange={(e) => setSubstitutes(e.target.value)}
              />
            </Field>
            <Note>
              Confirm allergens and recipe suitability yourself before approving
              a substitution. The demo makes no food-safety assessment.
            </Note>
            <Field label="Current stock expires at (optional, local time)">
              <input
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </Field>
            <Field label="Stock certainty">
              <select
                value={rules.confidence ?? "confirmed"}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    confidence: e.target.value as
                      "confirmed" | "needs_checking",
                  })
                }
              >
                <option value="confirmed">Owner confirmed</option>
                <option value="needs_checking">Needs checking</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <p>
              Current on hand: <strong>{qty(d.stock[i.id], i)}</strong>. This
              posts a ledger event and recalculates your plan.
            </p>
            <Field
              label={`${mode === "count" ? "Actual current count" : "Amount wasted"} (${i.base_unit})`}
            >
              <input
                required
                type="number"
                min={mode === "count" ? 0 : 1}
                max={mode === "count" ? i.max_storage_base : d.stock[i.id]}
                step="1"
                value={amount}
                onChange={(e) => setAmount(+e.target.value)}
              />
            </Field>
            <p className="caption">
              Planning time: {dateTime(s.clock, s.timezone)}. A new count clears
              this item’s lot labels; relabel the counted stock below.
            </p>
          </>
        )}
        {dateError && <Note tone="danger">{dateError}</Note>}
        <p className="small-copy">
          Times use {s.timezone}. Repeated fall-back hours use their first
          occurrence.
        </p>
        <div className="modal-actions">
          <Button disabled={busy || !!dateError}>Confirm {mode}</Button>
        </div>
      </form>
    </Modal>
  );
}
function SaleEditor({
  recipeId,
  onClose,
}: {
  recipeId: string;
  onClose: () => void;
}) {
  const { derived: d, mutate, busy } = useApp(),
    [q, setQ] = useState(1);
  return (
    <Modal title="Record finished-goods sale" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              type: "sell",
              recipe_id: recipeId,
              quantity: q,
              operation_key: crypto.randomUUID(),
            })
          )
            onClose();
        }}
      >
        <Field label="Units sold">
          <input
            type="number"
            min="1"
            max={d.finished[recipeId]}
            required
            value={q}
            onChange={(e) => setQ(+e.target.value)}
          />
        </Field>
        <Note>
          This reduces finished goods only. Revenue is not added to the
          purchasing budget; no payment is processed.
        </Note>
        <div className="modal-actions">
          <Button disabled={busy}>Confirm sale</Button>
        </div>
      </form>
    </Modal>
  );
}
