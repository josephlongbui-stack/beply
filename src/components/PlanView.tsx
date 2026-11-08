"use client";
import { expiredQuantity } from "../domain/perishables";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Store,
  Truck,
  Clock3,
  Printer,
  Download,
  Info,
  CalendarDays,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";
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
import { optimize, stockConfidence } from "../domain/engine";
import {
  localDateTime,
  foldForInstant,
  zonedInstant,
  collectionTime,
} from "../domain/location";
import type { Order, Plan } from "../domain/types";
export default function PlanView() {
  const { state: s, planTab, setPlanTab } = useApp(),
    t = useT();
  return (
    <>
      <PageHeading
        eyebrow="PURCHASING · YOUR NEXT PRODUCTION CYCLE"
        title="A plan that earns its place."
        description="The right ingredients, in time for prep, within the cash you choose to spend."
      />
      <div className="tabs" role="tablist" aria-label="Purchasing views">
        {[
          ["plan", t.plan],
          ["shopping", t.shopping],
          ["calendar", t.calendar],
        ].map(([id, label]) => (
          <button
            role="tab"
            aria-selected={planTab === id}
            className={planTab === id ? "active" : ""}
            key={id}
            onClick={() => setPlanTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {planTab === "plan" ? (
        <PlanInputs key={`${s.id}-${s.plan_version}`} />
      ) : planTab === "shopping" ? (
        <Shopping />
      ) : (
        <Calendar />
      )}
    </>
  );
}
function PlanInputs() {
  const { state: s, derived: d, mutate, busy, setPlanTab } = useApp(),
    t = useT();
  const [settings, setSettings] = useState(s.settings),
    [productionOpen, setProductionOpen] = useState(false),
    [approvalOpen, setApprovalOpen] = useState(false);
  const dirty = JSON.stringify(settings) !== JSON.stringify(s.settings);
  const replacement = s.orders.findLast(
    (o) =>
      !o.paid && !o.stale && (o.status === "Approved" || o.status === "Draft"),
  );
  const preview = useMemo(
    () => optimize({ ...s, settings }, { replacingOrder: replacement?.id }),
    [s, settings, replacement?.id],
  );
  const baseline = useMemo(
    () =>
      optimize(
        { ...s, settings },
        { maxStops: 1, mode: "in_store", replacingOrder: replacement?.id },
      ),
    [s, settings, replacement?.id],
  );
  const change = (key: keyof typeof settings, value: unknown) =>
    setSettings({ ...settings, [key]: value });
  return (
    <>
      <div className="plan-layout">
        <div className="plan-main">
          <Card>
            <div className="section-head">
              <div>
                <div className="eyebrow">01 · WHAT YOU’RE MAKING</div>
                <h2>Tonight’s preparation</h2>
              </div>
              <Button
                variant="secondary"
                onClick={() => setProductionOpen(true)}
              >
                Edit production
              </Button>
            </div>
            <div className="production-chips">
              {s.production.items.length ? (
                s.production.items.map((i) => (
                  <div key={i.recipe_id}>
                    <span>
                      {shortRecipe(
                        s.recipes.find((r) => r.id === i.recipe_id)?.name ??
                          i.recipe_id,
                      )}
                    </span>
                    <strong>
                      {i.planned_units}
                      <small> units</small>
                    </strong>
                    <small>
                      {preview.batches.find((b) => b.recipe_id === i.recipe_id)
                        ?.batches ?? 0}{" "}
                      whole batches
                      {(preview.batches.find((b) => b.recipe_id === i.recipe_id)
                        ?.extra ?? 0) > 0
                        ? ` · ${preview.batches.find((b) => b.recipe_id === i.recipe_id)?.extra} extra units`
                        : ""}
                    </small>
                  </div>
                ))
              ) : (
                <Empty title="Add your production">
                  Confirm a recipe, then tell us how many units you plan to
                  bake.
                </Empty>
              )}
            </div>
            <div className="deadline-line">
              <Clock3 size={16} />
              <span>
                Ingredients needed by{" "}
                <strong>
                  {dateTime(s.production.prep_starts_at, s.timezone)}
                </strong>
              </span>
              <span>
                Ready for sale{" "}
                {dateTime(s.production.ready_for_sale_at, s.timezone)}
              </span>
            </div>
          </Card>
          <Card>
            <div className="section-head">
              <div>
                <div className="eyebrow">02 · YOUR BOUNDARIES</div>
                <h2>Make it work for your business</h2>
              </div>
              {dirty && <Badge tone="warn">Unsaved preview</Badge>}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await mutate({ type: "settings", settings });
              }}
            >
              <div className="form-grid four">
                <Field label="Total purchasing budget ($)">
                  <input
                    aria-label="Total purchasing budget"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={settings.budget_cents / 100}
                    onChange={(e) =>
                      change("budget_cents", Math.round(+e.target.value * 100))
                    }
                  />
                </Field>
                <Field label="Protected reserve ($)">
                  <input
                    aria-label="Protected reserve"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={settings.cash_reserve_cents / 100}
                    onChange={(e) =>
                      change(
                        "cash_reserve_cents",
                        Math.round(+e.target.value * 100),
                      )
                    }
                  />
                </Field>
                <Field label="Maximum stores">
                  <select
                    aria-label="Maximum stores"
                    value={settings.maximum_in_person_stops}
                    onChange={(e) =>
                      change("maximum_in_person_stops", +e.target.value)
                    }
                  >
                    <option value="0">0 · online only</option>
                    <option value="1">1 store</option>
                    <option value="2">2 stores</option>
                    <option value="3">3 stores</option>
                  </select>
                </Field>
                <Field label="Shopping mode">
                  <select
                    value={settings.mode}
                    onChange={(e) => change("mode", e.target.value)}
                  >
                    <option value="mixed">Compare all</option>
                    <option value="in_store">In-store</option>
                    <option value="online">Online</option>
                  </select>
                </Field>
              </div>
              <div className="budget-equation">
                <span>{money(settings.budget_cents)} budget</span>
                <span>− {money(settings.cash_reserve_cents)} reserve</span>
                <span>− {money(d.spent)} paid</span>
                <span>
                  −{" "}
                  {money(
                    replacement
                      ? Math.max(
                          0,
                          d.commitments - replacement.plan.total_cost_cents,
                        )
                      : d.commitments,
                  )}{" "}
                  other commitments
                </span>
                <strong>
                  = {money(preview.cash_available_cents)} available
                </strong>
              </div>
              <details>
                <summary>Supplier preferences & trip assumptions</summary>
                <div className="supplier-preferences">
                  {s.suppliers.map((supplier) => (
                    <label className="check-label" key={supplier.id}>
                      <input
                        type="checkbox"
                        checked={
                          !settings.excluded_suppliers.includes(supplier.id)
                        }
                        onChange={(e) =>
                          change(
                            "excluded_suppliers",
                            e.target.checked
                              ? settings.excluded_suppliers.filter(
                                  (id) => id !== supplier.id,
                                )
                              : [...settings.excluded_suppliers, supplier.id],
                          )
                        }
                      />
                      <span>
                        {supplier.name}
                        <small>
                          {money(supplier.estimated_trip_cash_cost_cents)}{" "}
                          estimated trip cash ·{" "}
                          {supplier.hours ??
                            `arrival ${dateTime(new Date(collectionTime(s, supplier) || Date.parse(supplier.ready_at)).toISOString(), s.timezone)}`}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="caption">
                  Edit trip costs in Documents & settings. Time value is
                  separate from cash. Zero fixture tax; not a general tax rule.
                </p>
              </details>
              <div className="form-footer">
                <span>
                  {replacement
                    ? "Recalculating replaces this unexecuted plan’s own commitment."
                    : "Changes recalculate the preview immediately."}
                </span>
                <Button disabled={!dirty || busy} type="submit">
                  {t.save}
                </Button>
              </div>
            </form>
          </Card>
          <Card>
            <div className="section-head">
              <div>
                <div className="eyebrow">03 · THE INGREDIENT MATH</div>
                <h2>From recipes to shopping bags</h2>
              </div>
              <Badge>Base units normalized</Badge>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th className="numeric">Needed</th>
                    <th className="numeric">On hand</th>
                    <th className="numeric">To buy</th>
                    <th className="numeric">After prep</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ingredients.map((i) => (
                    <tr key={i.id}>
                      <th scope="row">
                        {i.name}
                        <small>{stockConfidence(s, i.id)}</small>
                      </th>
                      <td className="numeric">
                        {qty(preview.required[i.id], i)}
                      </td>
                      <td className="numeric">
                        {qty(preview.stock[i.id], i)}
                        {expiredQuantity(s, i.id, s.production.prep_starts_at) >
                          0 && (
                          <small>
                            {qty(
                              expiredQuantity(
                                s,
                                i.id,
                                s.production.prep_starts_at,
                              ),
                              i,
                            )}{" "}
                            past use-by at prep
                          </small>
                        )}
                        {preview.incoming[i.id] > 0 && (
                          <small>
                            +{qty(preview.incoming[i.id], i)} incoming
                          </small>
                        )}
                      </td>
                      <td className="numeric emph">
                        {qty(preview.shortfalls[i.id], i)}
                      </td>
                      <td className="numeric">
                        {qty(preview.leftovers[i.id], i)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">
              The target cycle’s reservation is not subtracted twice. Incoming
              goods remain separate until physically received.
            </p>
          </Card>
          <Card>
            <div className="section-head">
              <h2>Why this plan?</h2>
              <Info size={19} className="muted" />
            </div>
            {s.ingredients
              .filter(
                (i) =>
                  preview.lines.filter((l) => l.ingredient_id === i.id).length >
                  1,
              )
              .map((i) => (
                <Note key={i.id} tone="good">
                  For {i.name.toLowerCase()},{" "}
                  {preview.lines
                    .filter((l) => l.ingredient_id === i.id)
                    .map(
                      (l) =>
                        `${qty(l.quantity_base, i)} from ${s.suppliers.find((p) => p.id === l.supplier_id)?.name.replace(" — Demo", "")}`,
                    )
                    .join(" + ")}{" "}
                  covers the {qty(preview.shortfalls[i.id], i)} shortfall at the
                  lowest calculated cash cost.
                </Note>
              ))}
            <div className="comparison">
              <div>
                <span>Current store limit</span>
                <strong>
                  {preview.status === "no_supply_feasible_plan"
                    ? "Unavailable"
                    : money(preview.total_cost_cents)}
                </strong>
                <small>
                  {preview.supplier_ids.length} suppliers ·{" "}
                  {preview.status.replaceAll("_", " ")}
                </small>
              </div>
              <div>
                <span>Best one-store comparison</span>
                <strong>
                  {baseline.lines.length
                    ? money(baseline.total_cost_cents)
                    : "Unavailable"}
                </strong>
                <small>
                  {baseline.status === "feasible"
                    ? s.suppliers.find((x) => x.id === baseline.supplier_ids[0])
                        ?.name
                    : baseline.status.replaceAll("_", " ")}
                </small>
              </div>
              <div>
                <span>Estimated difference</span>
                <strong>
                  {baseline.status === "feasible" &&
                  preview.status === "feasible"
                    ? money(
                        Math.max(
                          0,
                          baseline.total_cost_cents - preview.total_cost_cents,
                        ),
                      )
                    : "—"}
                </strong>
                <small>Same needs, stock and deadline</small>
              </div>
            </div>
            <details>
              <summary>
                {preview.exclusions.length} offers excluded · see reasons
              </summary>
              <ul className="exclusion-list">
                {preview.exclusions.map((e) => (
                  <li key={e.offer_id}>
                    <strong>
                      {
                        s.offers.find((o) => o.id === e.offer_id)
                          ?.product_specification
                      }{" "}
                      ·{" "}
                      {
                        s.suppliers.find(
                          (p) =>
                            p.id ===
                            s.offers.find((o) => o.id === e.offer_id)
                              ?.supplier_id,
                        )?.name
                      }
                    </strong>
                    <span>{e.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        </div>
        <aside className="plan-summary">
          <Card>
            <div className="eyebrow">YOUR CALCULATED PLAN</div>
            <h2>
              {preview.status === "feasible"
                ? "A good fit for this batch."
                : preview.status === "budget_infeasible"
                  ? "A small gap to resolve."
                  : "A few things need review."}
            </h2>
            <Badge tone={preview.status === "feasible" ? "good" : "warn"}>
              {preview.status === "feasible"
                ? "Eligible & within budget"
                : preview.status === "budget_infeasible"
                  ? "Over available cash"
                  : "Review required"}
            </Badge>
            <div className="total-price" data-testid="plan-total">
              {s.production.items.some((i) => i.planned_units > 0)
                ? money(preview.total_cost_cents)
                : "Add production"}
            </div>
            <dl className="totals">
              <div>
                <dt>Ingredients</dt>
                <dd>{money(preview.goods_cost_cents)}</dd>
              </div>
              <div>
                <dt>Estimated trips</dt>
                <dd>{money(preview.estimated_trip_cost_cents)}</dd>
              </div>
              {preview.shipping_cents > 0 && (
                <div>
                  <dt>Shipping</dt>
                  <dd>{money(preview.shipping_cents)}</dd>
                </div>
              )}
              <div className="total-rule">
                <dt>
                  {preview.funding_gap_cents
                    ? "Funding gap"
                    : "Cash left after this plan"}
                </dt>
                <dd data-testid="cash-result">
                  {money(
                    preview.funding_gap_cents ||
                      preview.cash_available_cents - preview.total_cost_cents,
                  )}
                </dd>
              </div>
            </dl>
            {preview.funding_gap_cents > 0 && (
              <Note tone="warn">
                Add {money(preview.funding_gap_cents)} to the budget or
                explicitly revise production. Your reserve remains protected.
              </Note>
            )}
            {preview.issues.map((issue) => (
              <Note key={issue} tone="warn">
                {issue}
              </Note>
            ))}
            <Button
              className="full-width"
              disabled={
                dirty ||
                busy ||
                preview.status !== "feasible" ||
                !preview.lines.length
              }
              onClick={() => setApprovalOpen(true)}
            >
              <ShieldCheck size={17} />
              {t.approve}
            </Button>
            <Button
              variant="ghost"
              className="full-width"
              disabled={
                dirty ||
                busy ||
                preview.status !== "feasible" ||
                !preview.lines.length
              }
              onClick={() =>
                void mutate({
                  type: "draft",
                  plan_version: s.plan_version,
                  operation_key: crypto.randomUUID(),
                })
              }
            >
              Save draft
            </Button>
            <p className="caption">
              Approval reserves cash. It never adds physical stock or sends a
              real order.
            </p>
            {dirty && (
              <p className="unsaved-hint">Save your changes before approval.</p>
            )}
          </Card>
          <div className="summary-foot">
            <Clock3 size={16} />
            <p>
              Calculated from your current inputs.
              <br />
              {dateTime(s.clock, s.timezone)} · version {s.plan_version}
            </p>
          </div>
        </aside>
      </div>
      {productionOpen && (
        <ProductionEditor onClose={() => setProductionOpen(false)} />
      )}
      {approvalOpen && (
        <Modal title="Review & approve" onClose={() => setApprovalOpen(false)}>
          <p>
            You’re approving {money(preview.total_cost_cents)} across{" "}
            {preview.supplier_ids.length} suppliers for preparation on{" "}
            {dateTime(s.production.prep_starts_at, s.timezone)}.
          </p>
          <PlanGroups plan={preview} />
          <Note>
            This records an unpaid commitment. Shopping, payment and physical
            receipt are separate confirmations.
          </Note>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setApprovalOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  await mutate({
                    type: "approve",
                    plan_version: s.plan_version,
                    operation_key: crypto.randomUUID(),
                  })
                ) {
                  setApprovalOpen(false);
                  setPlanTab("shopping");
                }
              }}
            >
              Confirm approval
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ProductionEditor({
  onClose,
  queued = false,
}: {
  onClose: () => void;
  queued?: boolean;
}) {
  const { state: s, mutate, busy } = useApp();
  const [label, setLabel] = useState("");
  const [operationKey] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState(
      Object.fromEntries(
        s.recipes.map((r) => [
          r.id,
          s.production.items.find((i) => i.recipe_id === r.id)?.planned_units ??
            0,
        ]),
      ),
    ),
    [prep, setPrep] = useState(
      localDateTime(s.production.prep_starts_at, s.timezone),
    ),
    [ready, setReady] = useState(
      localDateTime(s.production.ready_for_sale_at, s.timezone),
    );
  const [fold, setFold] = useState<"earlier" | "later">(
    foldForInstant(s.production.prep_starts_at, s.timezone),
  );
  const [readyFold, setReadyFold] = useState<"earlier" | "later">(
    foldForInstant(s.production.ready_for_sale_at, s.timezone),
  );
  let prepInstant = "",
    readyInstant = "",
    dateError = "";
  try {
    prepInstant = zonedInstant(prep, s.timezone, fold);
    readyInstant = zonedInstant(ready, s.timezone, readyFold);
  } catch (e) {
    dateError = (e as Error).message;
  }
  return (
    <Modal
      title={queued ? "Save upcoming prep" : "Plan production"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              ...(queued
                ? {
                    type: "queue_production" as const,
                    label,
                    operation_key: operationKey,
                  }
                : { type: "production" as const }),
              items: Object.entries(quantities)
                .filter(([, q]) => q > 0)
                .map(([recipe_id, planned_units]) => ({
                  recipe_id,
                  planned_units,
                })),
              prep_starts_at: prepInstant,
              ready_for_sale_at: readyInstant,
            })
          )
            onClose();
        }}
      >
        <Note>
          Times use {s.timezone}, including daylight saving rules. Whole batches
          round up; ingredients are needed at preparation, not sale time.
        </Note>
        {queued && (
          <Field label="Service or event name">
            <input
              required
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Friday lunch, café opening, wedding service…"
            />
          </Field>
        )}
        {queued && (
          <Note>
            This saves an upcoming plan. It reserves no stock or cash until you
            activate it after the current cycle.
          </Note>
        )}
        {s.recipes.length ? (
          s.recipes.map((r) => (
            <Field
              key={r.id}
              label={`${shortRecipe(r.name)} · ${r.yield_units} per batch`}
            >
              <input
                aria-label={`${r.id} production units`}
                type="number"
                min="0"
                max="2000"
                step="1"
                value={quantities[r.id]}
                onChange={(e) =>
                  setQuantities({ ...quantities, [r.id]: +e.target.value })
                }
              />
            </Field>
          ))
        ) : (
          <Empty title="No recipes confirmed">
            Review a recipe in Documents first.
          </Empty>
        )}
        <div className="form-grid">
          <Field label="Preparation starts (local time)">
            <input
              type="datetime-local"
              required
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
            />
          </Field>
          <Field label="Ready for sale (local time)">
            <input
              type="datetime-local"
              required
              value={ready}
              onChange={(e) => setReady(e.target.value)}
            />
          </Field>
        </div>
        <Field label="If the local hour repeats">
          <select
            value={fold}
            onChange={(e) => setFold(e.target.value as "earlier" | "later")}
          >
            <option value="earlier">First occurrence</option>
            <option value="later">Second occurrence</option>
          </select>
        </Field>
        <Field label="If the ready-for-sale hour repeats">
          <select
            value={readyFold}
            onChange={(e) =>
              setReadyFold(e.target.value as "earlier" | "later")
            }
          >
            <option value="earlier">First occurrence</option>
            <option value="later">Second occurrence</option>
          </select>
        </Field>
        {dateError && <Note tone="danger">{dateError}</Note>}
        <div className="modal-actions">
          <Button disabled={busy || !s.recipes.length || !!dateError}>
            Save production plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function PlanGroups({ plan, order }: { plan: Plan; order?: Order }) {
  const { state: s, mutate, busy } = useApp();
  return (
    <div className="store-groups">
      {plan.supplier_ids.map((id) => {
        const supplier =
            order?.input_snapshot?.suppliers?.find((p) => p.id === id) ??
            s.suppliers.find((p) => p.id === id)!,
          lines = plan.lines.filter((l) => l.supplier_id === id);
        return (
          <div className="store-group" key={id}>
            <div className="store-head">
              <span className="store-icon">
                {supplier.mode === "online" ? (
                  <Truck size={20} />
                ) : (
                  <Store size={20} />
                )}
              </span>
              <div>
                <h3>{supplier.name.replace(" — Demo", "")}</h3>
                <small>
                  {supplier.mode === "online"
                    ? "Demo online adapter"
                    : `In-store · ${supplier.hours}`}{" "}
                  · {money(supplier.estimated_trip_cash_cost_cents)} trip
                </small>
                {supplier.address && <small>{supplier.address}</small>}
              </div>
              <strong>
                {money(lines.reduce((n, l) => n + l.line_cost_cents, 0))}
              </strong>
            </div>
            {lines.map((l) => {
              const i = s.ingredients.find((i) => i.id === l.ingredient_id)!,
                o =
                  order?.input_snapshot?.offers.find(
                    (o) => o.id === l.offer_id,
                  ) ?? s.offers.find((o) => o.id === l.offer_id)!;
              return (
                <div
                  className={`shopping-row ${order?.checked[l.offer_id] ? "checked" : ""}`}
                  key={l.offer_id}
                >
                  {order && (
                    <input
                      aria-label={`Picked ${i.name} at ${supplier.name}`}
                      type="checkbox"
                      disabled={busy || order.status === "Cancelled"}
                      checked={order.checked[l.offer_id] ?? false}
                      onChange={(e) =>
                        void mutate({
                          type: "check",
                          order_id: order.id,
                          offer_id: l.offer_id,
                          checked: e.target.checked,
                        })
                      }
                    />
                  )}
                  <span>
                    <strong>{i.name}</strong>
                    <small>
                      {l.packs} ×{" "}
                      {o.input_quantity && o.input_unit
                        ? `${o.input_quantity} ${o.input_unit.replaceAll("_", " ")}`
                        : qty(o.pack_quantity_base, i)}{" "}
                      · {qty(l.quantity_base, i)} total
                      {order?.received[l.offer_id]
                        ? ` · ${qty(order.received[l.offer_id], i)} received`
                        : ""}
                    </small>
                  </span>
                  <strong>{money(l.line_cost_cents)}</strong>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
function Shopping() {
  const { state: s, derived: d, mutate, busy, setPlanTab } = useApp(),
    t = useT();
  const [selected, setSelected] = useState(""),
    [receiveOpen, setReceiveOpen] = useState(false);
  const order =
      s.orders.find((o) => o.id === selected) ??
      s.orders.findLast((o) => o.status !== "Cancelled") ??
      s.orders.at(-1),
    plan = order?.plan ?? d.plan;
  return (
    <>
      <div className="shopping-title">
        <div>
          <h2>Take this list with you.</h2>
          <p>
            Check off items in the store. Confirm actual receipt when they reach
            your kitchen.
          </p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            {t.print}
          </Button>
          <a
            className="button secondary"
            href={`/api/export?kind=shopping${order ? `&order=${order.id}` : ""}`}
          >
            <Download size={16} />
            {t.export}
          </a>
        </div>
      </div>
      {s.orders.length > 1 && (
        <Field label="Purchase history">
          <select
            value={order?.id}
            onChange={(e) => setSelected(e.target.value)}
          >
            {s.orders.toReversed().map((o) => (
              <option key={o.id} value={o.id}>
                {o.status} · {money(o.plan.total_cost_cents)} ·{" "}
                {o.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!order && (
        <Note>
          Preview list. Approve the current plan to save checkboxes and record
          receipts.{" "}
          <button className="text-button" onClick={() => setPlanTab("plan")}>
            Review plan <ArrowRight size={14} />
          </button>
        </Note>
      )}
      {order && (
        <div className="order-status">
          <Badge
            tone={
              order.status === "Received"
                ? "good"
                : order.status === "Cancelled"
                  ? "danger"
                  : "neutral"
            }
          >
            {order.status}
          </Badge>
          <span>
            {order.paid ? "Payment recorded" : "Payment not recorded"}
          </span>
          <span>Approval version {order.input_version}</span>
          {order.stale && (
            <Badge tone="warn">Inputs changed · review history</Badge>
          )}
        </div>
      )}
      <div className="shopping-layout">
        <div>
          {plan.lines.length ? (
            <PlanGroups plan={plan} order={order} />
          ) : (
            <Empty title="Nothing to shop for yet">
              Build an eligible plan from your production and stock records.
            </Empty>
          )}
        </div>
        <Card className="shopping-actions">
          <div className="eyebrow">PURCHASE CHECKPOINT</div>
          <h2>{money(plan.total_cost_cents)}</h2>
          <dl className="totals">
            <div>
              <dt>Goods</dt>
              <dd>{money(plan.goods_cost_cents)}</dd>
            </div>
            <div>
              <dt>Estimated trips</dt>
              <dd>{money(plan.estimated_trip_cost_cents)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{money(plan.shipping_cents)}</dd>
            </div>
          </dl>
          {order && order.status !== "Cancelled" && order.status !== "Draft" ? (
            <>
              <Button
                className="full-width"
                disabled={busy || order.status === "Received"}
                onClick={() => setReceiveOpen(true)}
              >
                <PackageCheck size={17} />
                {order.status === "Received" ? "All goods received" : t.receipt}
              </Button>
              <Button
                variant="secondary"
                className="full-width"
                disabled={busy || order.paid}
                onClick={() => void mutate({ type: "pay", order_id: order.id })}
              >
                {order.paid ? "Payment recorded" : "Record payment separately"}
              </Button>
              {order.plan.supplier_ids.some(
                (id) => s.suppliers.find((p) => p.id === id)?.mode === "online",
              ) && (
                <Button
                  variant="secondary"
                  className="full-width"
                  disabled={busy || order.status !== "Approved" || order.stale}
                  onClick={() =>
                    void mutate({ type: "submit", order_id: order.id })
                  }
                >
                  Submit simulated online order
                </Button>
              )}
              <Button
                variant="ghost"
                className="full-width"
                disabled={
                  busy ||
                  order.paid ||
                  Object.values(order.received).some(Boolean)
                }
                onClick={() =>
                  void mutate({ type: "cancel", order_id: order.id })
                }
              >
                Cancel unreceived order
              </Button>
            </>
          ) : (
            <Button onClick={() => setPlanTab("plan")} className="full-width">
              Review & approve plan
            </Button>
          )}
          <p className="caption">
            Payment includes the stated trip estimate. No real payment is made.
            Checked items do not become stock until received.
          </p>
          {order?.simulated_reference && (
            <Badge>Demo adapter · {order.simulated_reference}</Badge>
          )}
        </Card>
      </div>
      {receiveOpen && order && (
        <ReceiveEditor order={order} onClose={() => setReceiveOpen(false)} />
      )}
    </>
  );
}
function ReceiveEditor({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { state: s, mutate, busy } = useApp();
  const [quantities, setQuantities] = useState(
    Object.fromEntries(
      order.plan.lines.map((l) => [l.offer_id, l.quantity_base]),
    ),
  );
  return (
    <Modal title="Confirm actual goods received" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              type: "receive",
              order_id: order.id,
              quantities,
              operation_key: crypto.randomUUID(),
            })
          )
            onClose();
        }}
      >
        <Note>
          Enter cumulative received quantities in base units. For a partial
          delivery, reduce a total to the amount actually received. Repeating
          the same totals won’t add stock twice.
        </Note>
        {order.plan.lines.map((l) => {
          const i = s.ingredients.find((i) => i.id === l.ingredient_id)!;
          return (
            <Field
              key={l.offer_id}
              label={`${i.name} · ${s.suppliers.find((p) => p.id === l.supplier_id)?.name} (${i.base_unit})`}
              hint={`Ordered ${l.quantity_base} ${i.base_unit}; already received ${order.received[l.offer_id] ?? 0}`}
            >
              <input
                aria-label={`Receive ${l.offer_id}`}
                type="number"
                min={order.received[l.offer_id] ?? 0}
                max={l.quantity_base}
                step="1"
                required
                value={quantities[l.offer_id]}
                onChange={(e) =>
                  setQuantities({
                    ...quantities,
                    [l.offer_id]: +e.target.value,
                  })
                }
              />
            </Field>
          );
        })}
        <div className="modal-actions">
          <Button disabled={busy}>Post received quantities</Button>
        </div>
      </form>
    </Modal>
  );
}
function Calendar() {
  const { state: s, derived: d, setPlanTab } = useApp();
  const order = s.orders.findLast(
      (o) => o.status !== "Cancelled" && o.status !== "Draft",
    ),
    p = order?.plan ?? d.plan;
  const day = localDateTime(s.clock, s.timezone).slice(0, 10),
    days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${day}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);
      return date;
    });
  return (
    <>
      <div className="shopping-title">
        <div>
          <h2>Buy before preparation begins.</h2>
          <p>
            Purchase time, arrival time and ingredient deadlines are separate.
          </p>
        </div>
        <Badge>
          <CalendarDays size={13} /> Next 7 days ·{" "}
          {s.timezone.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="week-strip">
        {days.map((day, i) => (
          <div key={i} className={i === 0 ? "selected" : ""}>
            <span>
              {day.toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              })}
            </span>
            <strong>{day.getUTCDate()}</strong>
            <small>
              {[
                ...(day.toISOString().slice(0, 10) ===
                localDateTime(s.clock, s.timezone).slice(0, 10)
                  ? ["Today"]
                  : []),
                ...(day.toISOString().slice(0, 10) ===
                localDateTime(s.production.prep_starts_at, s.timezone).slice(
                  0,
                  10,
                )
                  ? ["Prep"]
                  : []),
                ...(day.toISOString().slice(0, 10) ===
                localDateTime(s.production.ready_for_sale_at, s.timezone).slice(
                  0,
                  10,
                )
                  ? ["Ready"]
                  : []),
              ].join(" · ") || "—"}
            </small>
          </div>
        ))}
      </div>
      <Card>
        <div className="section-head">
          <h2>Schedule from this plan</h2>
          <Badge tone="good">Derived from constraints</Badge>
        </div>
        <div className="timeline">
          {p.supplier_ids.map((id) => {
            const supplier = s.suppliers.find((p) => p.id === id)!;
            return (
              <div key={id}>
                <span className="timeline-dot">
                  <Store size={17} />
                </span>
                <div>
                  <span className="eyebrow">
                    {dateTime(supplier.ready_at, s.timezone)}
                  </span>
                  <h3>
                    {supplier.mode === "online"
                      ? "Expected arrival"
                      : "Collect from"}{" "}
                    · {supplier.name}
                  </h3>
                  <p>
                    Purchase on{" "}
                    {localDateTime(s.clock, s.timezone).slice(0, 10)};{" "}
                    {supplier.hours
                      ? `store hours ${supplier.hours} (${supplier.timezone}).`
                      : "sample shipping applies."}{" "}
                    {p.lines.filter((l) => l.supplier_id === id).length}{" "}
                    ingredient lines. {order?.status ?? "Awaiting approval"}.
                  </p>
                  <small>
                    Quotes expire{" "}
                    {dateTime(
                      s.offers.find(
                        (o) =>
                          o.id ===
                          p.lines.find((l) => l.supplier_id === id)?.offer_id,
                      )?.valid_until ?? s.clock,
                      s.timezone,
                    )}{" "}
                    Forecasts do not delay this purchase.
                  </small>
                </div>
              </div>
            );
          })}
          <div>
            <span className="timeline-dot">
              <Clock3 size={17} />
            </span>
            <div>
              <span className="eyebrow">
                {dateTime(s.production.prep_starts_at, s.timezone)}
              </span>
              <h3>Preparation starts</h3>
              <p>
                All ingredients must be physically available. Incoming
                commitments alone are not ready stock.
              </p>
            </div>
          </div>
          <div>
            <span className="timeline-dot">
              <CheckCircle2 size={17} />
            </span>
            <div>
              <span className="eyebrow">
                {dateTime(s.production.ready_for_sale_at, s.timezone)}
              </span>
              <h3>Finished goods ready for sale</h3>
              <p>
                Production consumes ingredients; selling these goods will not
                consume them again.
              </p>
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setPlanTab("shopping")}>
          Open shopping list <ArrowRight size={16} />
        </Button>
      </Card>
      <Note>
        {s.price_mode === "sample" ? (
          <>
            Online sample offers arrive{" "}
            {dateTime(
              s.suppliers.find(
                (x) => x.is_sample !== false && x.mode === "online",
              )!.ready_at,
              s.timezone,
            )}
            .{" "}
            {d.online.status === "no_supply_feasible_plan"
              ? "They cannot cover this cycle under its current deadline and constraints."
              : "Eligible online offers include shipping and the supplier minimum."}
          </>
        ) : (
          <>
            Your local suppliers’ entered arrival times, daily hours and order
            minimums determine eligibility. Recheck these with each supplier
            before shopping.
          </>
        )}{" "}
        This calendar schedules the current production cycle; it does not
        predict demand for unplanned days.
      </Note>
    </>
  );
}
