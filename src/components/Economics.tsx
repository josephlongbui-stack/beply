"use client";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  FlaskConical,
  Calculator,
  Scale,
  Info,
} from "lucide-react";
import {
  useApp,
  PageHeading,
  Button,
  Card,
  Metric,
  Badge,
  Field,
  Note,
  money,
  qty,
  shortRecipe,
} from "./ui";
import { sourceReason } from "../domain/location";
import { scenario, suggestedPrice, offerReason } from "../domain/engine";
export default function Economics() {
  const [tab, setTab] = useState("scenarios");
  const { state: s, setView } = useApp();
  if (s.kind === "owner" && !s.recipes.length)
    return (
      <>
        <PageHeading
          eyebrow="ECONOMICS, CONNECTED TO YOUR KITCHEN"
          title="Your decisions start with your ingredients."
          description="Add a recipe and local supplier quotes to calculate costs, compare changes and explore menu prices."
        />
        <Card>
          <h2>Build your starting picture.</h2>
          <p>
            There are no sample costs in your workspace. Your entered quantities
            and prices drive every comparison.
          </p>
          <Button onClick={() => setView("documents")}>
            Add your first recipe <ArrowRight size={16} />
          </Button>
        </Card>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="ECONOMICS, CONNECTED TO YOUR KITCHEN"
        title="Try a change before making one."
        description="Same recipes, stock and prices. Explicit assumptions. Decisions stay with you."
      />
      <div className="tabs" role="tablist" aria-label="Economic tools">
        {[
          ["scenarios", "Scenarios", FlaskConical],
          ["opportunity", "Opportunity cost", Scale],
          ["pricing", "Menu pricing", Calculator],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Calculator;
          return (
            <button
              key={String(id)}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(String(id))}
            >
              <I size={16} />
              {String(label)}
            </button>
          );
        })}
      </div>
      {tab === "scenarios" ? (
        <ScenarioTool />
      ) : tab === "opportunity" ? (
        <OpportunityTool />
      ) : (
        <PricingTool />
      )}
    </>
  );
}
function ScenarioTool() {
  const { state: s, derived: d } = useApp(),
    [priceChange, setPriceChange] = useState(20),
    [ingredientId, setIngredientId] = useState(
      s.ingredients.find((i) => i.id === "butter")?.id ??
        s.ingredients[0]?.id ??
        "",
    ),
    [production, setProduction] = useState(0),
    [stops, setStops] = useState(s.settings.maximum_in_person_stops),
    [budget, setBudget] = useState(s.settings.budget_cents);
  const result = useMemo(
      () => scenario(s, priceChange, production, stops, budget, ingredientId),
      [s, priceChange, production, stops, budget, ingredientId],
    ),
    p = result.result.plan;
  return (
    <>
      <div className="two-column">
        <Card>
          <div className="section-head">
            <div>
              <div className="eyebrow">ISOLATED WHAT-IF</div>
              <h2>What if your input costs change?</h2>
            </div>
            <Badge>Hypothetical</Badge>
          </div>
          <p>
            Adjust the assumptions below. The actual ledger, quotes and approved
            orders stay unchanged.
          </p>
          <div className="form-grid">
            <Field label="Stock item to adjust">
              <select
                value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}
              >
                {s.ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quote change (%)">
              <input
                aria-label={
                  ingredientId === "butter"
                    ? "Butter price scenario"
                    : "Item price scenario"
                }
                type="number"
                min="-90"
                max="200"
                value={priceChange}
                onChange={(e) =>
                  setPriceChange(Math.max(-90, Math.min(200, +e.target.value)))
                }
              />
            </Field>
            <Field label="Production quantity change (%)">
              <input
                type="number"
                min="-100"
                max="100"
                value={production}
                onChange={(e) =>
                  setProduction(Math.max(-100, Math.min(100, +e.target.value)))
                }
              />
            </Field>
            <Field label="Scenario maximum stores">
              <select value={stops} onChange={(e) => setStops(+e.target.value)}>
                <option value="1">1 store</option>
                <option value="2">2 stores</option>
              </select>
            </Field>
            <Field label="Scenario budget ($)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={budget / 100}
                onChange={(e) =>
                  setBudget(Math.max(0, Math.round(+e.target.value * 100)))
                }
              />
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setPriceChange(0);
              setProduction(0);
              setStops(s.settings.maximum_in_person_stops);
              setBudget(s.settings.budget_cents);
            }}
          >
            Reset assumptions
          </Button>
        </Card>
        <Card className="scenario-result">
          <div className="eyebrow">RECALCULATED, NOT APPLIED</div>
          <h2>
            {p.status === "feasible"
              ? "A feasible alternative."
              : "This alternative needs review."}
          </h2>
          <div className="comparison">
            <div>
              <span>Actual plan</span>
              <strong>{money(d.plan.total_cost_cents)}</strong>
            </div>
            <ArrowRight size={20} />
            <div>
              <span>Scenario plan</span>
              <strong data-testid="scenario-total">
                {money(p.total_cost_cents)}
              </strong>
            </div>
          </div>
          <dl className="totals">
            <div>
              <dt>Change in planned cash</dt>
              <dd>{money(p.total_cost_cents - d.plan.total_cost_cents)}</dd>
            </div>
            <div>
              <dt>Cash left after scenario</dt>
              <dd>{money(p.cash_available_cents - p.total_cost_cents)}</dd>
            </div>
            <div>
              <dt>Funding gap</dt>
              <dd>{money(p.funding_gap_cents)}</dd>
            </div>
            <div>
              <dt>Ingredients with shortfalls before shopping</dt>
              <dd>{Object.values(p.shortfalls).filter((q) => q > 0).length}</dd>
            </div>
          </dl>
          <Badge tone={p.status === "feasible" ? "good" : "warn"}>
            {p.status.replaceAll("_", " ")}
          </Badge>
          <p className="caption">
            Whole batches round up. These changes are assumptions, not a demand
            forecast or a promise of inflation.
          </p>
        </Card>
      </div>
      <Card>
        <div className="section-head">
          <h2>Impact on the same recipes</h2>
          <Info size={19} className="muted" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="numeric">Actual ingredient / unit</th>
                <th className="numeric">Scenario ingredient / unit</th>
                <th className="numeric">Scenario variable / unit</th>
                <th className="numeric">Contribution at current price</th>
              </tr>
            </thead>
            <tbody>
              {s.recipes.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{shortRecipe(r.name)}</th>
                  <td className="numeric">
                    {money(d.costs[r.id].ingredientCents)}
                  </td>
                  <td className="numeric">
                    {money(result.result.costs[r.id].ingredientCents)}
                  </td>
                  <td className="numeric">
                    {money(result.result.costs[r.id].variableCents)}
                  </td>
                  <td className="numeric">
                    {money(result.result.costs[r.id].contributionCents)}
                    <small>
                      {(result.result.costs[r.id].margin * 100).toFixed(1)}% ·{" "}
                      {result.result.costs[r.id].partial
                        ? "partial cost"
                        : "fixture inputs"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ingredient</th>
                <th className="numeric">Actual required</th>
                <th className="numeric">Scenario required</th>
                <th className="numeric">Scenario shortfall</th>
              </tr>
            </thead>
            <tbody>
              {s.ingredients.map((i) => (
                <tr key={i.id}>
                  <th>{i.name}</th>
                  <td className="numeric">{qty(d.plan.required[i.id], i)}</td>
                  <td className="numeric">{qty(p.required[i.id], i)}</td>
                  <td className="numeric">{qty(p.shortfalls[i.id], i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        To adopt a real change, edit and save the actual production plan, budget
        or quote, then review approval again. This sandbox never mutates those
        records.
      </Note>
    </>
  );
}
function PricingTool() {
  const { state: s, derived: d } = useApp(),
    [recipeId, setRecipeId] = useState(s.recipes[0]?.id ?? ""),
    [margin, setMargin] = useState(50),
    [round, setRound] = useState(25),
    [volume, setVolume] = useState(100);
  const r = s.recipes.find((r) => r.id === recipeId);
  if (!r)
    return (
      <Card>
        <h2>Confirm a recipe first</h2>
        <p>Cost-based pricing needs an ingredient list and yield.</p>
      </Card>
    );
  const cost = d.costs[r.id],
    suggestion = suggestedPrice(cost.variableCents, margin / 100, round),
    units =
      s.production.items.find((i) => i.recipe_id === r.id)?.planned_units ??
      100,
    proposedUnits = Math.round((units * volume) / 100);
  return (
    <>
      <div className="two-column">
        <Card>
          <div className="section-head">
            <h2>A price grounded in your costs.</h2>
            <Badge tone={cost.partial ? "warn" : "neutral"}>
              {cost.partial
                ? "Partial cost estimate"
                : s.price_mode === "sample"
                  ? "Illustrative fixture costs"
                  : "Local quotes · recipe cost assumptions"}
            </Badge>
          </div>
          <Field label="Recipe">
            <select
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
            >
              {s.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {shortRecipe(r.name)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Target contribution margin (%)">
              <input
                aria-label="Target contribution margin"
                type="number"
                min="0"
                max="99"
                value={margin}
                onChange={(e) =>
                  setMargin(Math.max(0, Math.min(99, +e.target.value)))
                }
              />
            </Field>
            <Field label="Round suggestion up to">
              <select value={round} onChange={(e) => setRound(+e.target.value)}>
                <option value="5">Nearest $0.05</option>
                <option value="10">Nearest $0.10</option>
                <option value="25">Nearest $0.25</option>
                <option value="50">Nearest $0.50</option>
              </select>
            </Field>
          </div>
          <dl className="totals">
            <div>
              <dt>Ingredient cost / unit</dt>
              <dd>{money(cost.ingredientCents)}</dd>
            </div>
            <div>
              <dt>Variable labor / unit</dt>
              <dd>
                {r.variable_labor_cents_per_batch === null
                  ? "Missing"
                  : money(r.variable_labor_cents_per_batch / r.yield_units)}
              </dd>
            </div>
            <div>
              <dt>Packaging / unit</dt>
              <dd>
                {r.packaging_cents_per_unit === null
                  ? "Missing"
                  : money(r.packaging_cents_per_unit)}
              </dd>
            </div>
            <div>
              <dt>Variable energy / unit</dt>
              <dd>
                {r.energy_cents_per_batch === null
                  ? "Missing"
                  : money(r.energy_cents_per_batch / r.yield_units)}
              </dd>
            </div>
            <div className="total-rule">
              <dt>Total variable cost / unit</dt>
              <dd>{money(cost.variableCents)}</dd>
            </div>
            <div>
              <dt>Allocated fixed overhead / unit</dt>
              <dd>{money(r.allocated_overhead_cents_per_unit)}</dd>
            </div>
            <div>
              <dt>Illustrative fully allocated cost</dt>
              <dd>{money(cost.allocatedCents)}</dd>
            </div>
          </dl>
          <p className="caption">
            Ingredient basis: {d.purchasingPower.basis} at the planning time.
            Consumption cost, not the cash price of whole shopping packs. Edit
            labor and packaging in Recipes.
          </p>
        </Card>
        <Card className="price-result">
          <div className="eyebrow">COST-BASED PRICE SCENARIO</div>
          <div className="suggested-price">
            {cost.partial ? "Incomplete" : money(suggestion)}
          </div>
          <p>per {shortRecipe(r.name).toLowerCase().replace(/s$/, "")}</p>
          <div className="formula">
            {money(cost.variableCents)} ÷ (1 − {margin}%)
            <small>rounded up to {money(round)}</small>
          </div>
          <dl className="totals">
            <div>
              <dt>Current selling price</dt>
              <dd>{money(r.selling_price_cents)}</dd>
            </div>
            <div>
              <dt>Current contribution / unit</dt>
              <dd>{money(cost.contributionCents)}</dd>
            </div>
            <div>
              <dt>Scenario contribution / unit</dt>
              <dd>{money(suggestion - cost.variableCents)}</dd>
            </div>
          </dl>
          <Note>
            Contribution is not net profit. This does not establish willingness
            to pay or an optimal selling price. No menu price is published
            automatically.
          </Note>
        </Card>
      </div>
      <Card>
        <div className="section-head">
          <h2>What if sales volume changes?</h2>
          <Badge>Owner-entered assumption</Badge>
        </div>
        <Field
          label={`Scenario sales volume: ${volume}% of ${units} planned units`}
        >
          <input
            aria-label="Sales volume sensitivity"
            type="range"
            min="0"
            max="150"
            value={volume}
            onChange={(e) => setVolume(+e.target.value)}
          />
        </Field>
        <div className="metrics-grid three">
          <Metric label="Scenario units sold" value={proposedUnits} />
          <Metric
            label="Current-volume contribution"
            value={money(units * cost.contributionCents)}
          />
          <Metric
            label="Scenario-volume contribution"
            value={money(proposedUnits * (suggestion - cost.variableCents))}
          />
        </div>
        <p className="caption">
          A sensitivity comparison only. No price elasticity, unsold inventory,
          additional production or demand is inferred.
        </p>
      </Card>
    </>
  );
}
function OpportunityTool() {
  const { state: s, derived: d } = useApp(),
    [offerId, setOfferId] = useState("market_a_butter"),
    [futureNeed, setFutureNeed] = useState(0),
    [useDate, setUseDate] = useState("2026-10-28"),
    [expiry, setExpiry] = useState(""),
    [futureChange, setFutureChange] = useState(0),
    [extraMinutes, setExtraMinutes] = useState(30),
    [hourly, setHourly] = useState(20);
  const choices = s.offers.filter(
    (o) =>
      !sourceReason(s, o) &&
      (s.price_mode === "local" || o.supplier_id === "market_a"),
  );
  const offer = choices.find((o) => o.id === offerId) ?? choices[0];
  if (!offer)
    return (
      <Card>
        <h2>Add a local quote first</h2>
        <p>
          An opportunity-cost comparison needs a package price for your business
          location.
        </p>
      </Card>
    );
  const ingredient = s.ingredients.find((i) => i.id === offer.ingredient_id)!,
    supplier = s.suppliers.find((p) => p.id === offer.supplier_id)!,
    plan = d.plan;
  const extraTrip = plan.supplier_ids.includes(offer.supplier_id)
      ? 0
      : supplier.estimated_trip_cash_cost_cents +
        (supplier.shipping_cents ?? 0),
    extraCash =
      offer.pack_price_cents + (offer.tax_cents_per_pack ?? 0) + extraTrip,
    leftover = plan.leftovers[ingredient.id] ?? 0,
    neededExtra = Math.max(0, futureNeed - leftover),
    used = Math.min(neededExtra, offer.pack_quantity_base),
    surplus = offer.pack_quantity_base - used;
  const reason = offerReason(s, offer),
    storageOk =
      (plan.stock[ingredient.id] ?? 0) +
        plan.lines
          .filter((l) => l.ingredient_id === ingredient.id)
          .reduce((n, l) => n + l.quantity_base, 0) +
        offer.pack_quantity_base <=
      ingredient.max_storage_base;
  const ready =
    !!futureNeed &&
    !!expiry &&
    expiry >= useDate &&
    storageOk &&
    !reason &&
    extraCash <= plan.cash_available_cents - plan.total_cost_cents;
  return (
    <>
      <div className="two-column">
        <Card>
          <div className="section-head">
            <h2>Buy one extra pack now?</h2>
            <Badge>Comparison only</Badge>
          </div>
          <Field label="Extra package">
            <select
              value={offer.id}
              onChange={(e) => {
                setOfferId(e.target.value);
                setFutureNeed(0);
              }}
            >
              {choices.map((o) => (
                <option key={o.id} value={o.id}>
                  {s.ingredients.find((i) => i.id === o.ingredient_id)?.name} ·{" "}
                  {qty(
                    o.pack_quantity_base,
                    s.ingredients.find((i) => i.id === o.ingredient_id),
                  )}{" "}
                  · {money(o.pack_price_cents)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field
              label={`Confirmed next-cycle need (${ingredient.base_unit})`}
            >
              <input
                type="number"
                min="0"
                step="1"
                value={futureNeed}
                onChange={(e) => setFutureNeed(Math.max(0, +e.target.value))}
              />
            </Field>
            <Field label="Expected use date">
              <input
                type="date"
                min={s.clock.slice(0, 10)}
                value={useDate}
                onChange={(e) => setUseDate(e.target.value)}
              />
            </Field>
            <Field label="Owner-confirmed usable-through date">
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </Field>
            <Field label="Assumed future quote change (%)">
              <input
                type="number"
                min="-90"
                max="200"
                value={futureChange}
                onChange={(e) =>
                  setFutureChange(Math.max(-90, Math.min(200, +e.target.value)))
                }
              />
            </Field>
          </div>
          <Note>
            Only a confirmed use case can justify tying up extra cash. These
            assumptions are local to this comparison and never add purchases
            automatically.
          </Note>
        </Card>
        <Card>
          <div className="eyebrow">CASH & STORAGE TRADE-OFF</div>
          <h2>
            {ready
              ? "The assumptions fit this comparison."
              : "More evidence before buying extra."}
          </h2>
          <dl className="totals">
            <div>
              <dt>Buy only current need</dt>
              <dd>{money(plan.total_cost_cents)}</dd>
            </div>
            <div>
              <dt>Buy current need + extra pack</dt>
              <dd>{money(plan.total_cost_cents + extraCash)}</dd>
            </div>
            <div>
              <dt>Additional cash tied up</dt>
              <dd>{money(extraCash)}</dd>
            </div>
            <div>
              <dt>Extra storage used</dt>
              <dd>{qty(offer.pack_quantity_base, ingredient)}</dd>
            </div>
            <div>
              <dt>Extra amount used by {useDate}</dt>
              <dd>{qty(used, ingredient)}</dd>
            </div>
            <div>
              <dt>Extra pack left unused</dt>
              <dd>{qty(surplus, ingredient)}</dd>
            </div>
            <div>
              <dt>Assumed avoided price difference</dt>
              <dd>
                {futureNeed && expiry && used === offer.pack_quantity_base
                  ? money(
                      Math.round(
                        (offer.pack_price_cents * futureChange) / 100,
                      ) - extraTrip,
                    )
                  : "Not supported yet"}
              </dd>
            </div>
          </dl>
          <Badge tone={ready ? "good" : "warn"}>
            {!futureNeed
              ? "Confirmed future need missing"
              : !expiry
                ? "Expiry needs confirmation"
                : expiry < useDate
                  ? "Expires before use"
                  : !storageOk
                    ? "Storage limit exceeded"
                    : reason
                      ? reason
                      : extraCash >
                          plan.cash_available_cents - plan.total_cost_cents
                        ? "Insufficient uncommitted cash"
                        : "Fits entered assumptions"}
          </Badge>
          <p className="caption">
            Future price change is an assumption, not a forecast. Cost
            difference is compared for the extra pack only and shown only if it
            is fully consumed.
          </p>
        </Card>
      </div>
      <Card>
        <div className="section-head">
          <h2>What is an extra stop worth to you?</h2>
          <Badge>Time value is not cash spending</Badge>
        </div>
        <div className="form-grid three">
          <Field label="Owner-estimated extra travel time (minutes)">
            <input
              type="number"
              min="0"
              value={extraMinutes}
              onChange={(e) => setExtraMinutes(Math.max(0, +e.target.value))}
            />
          </Field>
          <Field label="Owner’s time value ($ / hour)">
            <input
              type="number"
              min="0"
              value={hourly}
              onChange={(e) => setHourly(Math.max(0, +e.target.value))}
            />
          </Field>
          <Metric
            label="Illustrative time cost"
            value={money(Math.round((extraMinutes / 60) * hourly * 100))}
          />
        </div>
        <p>
          One-store cash cost:{" "}
          {d.oneStore.lines.length
            ? money(d.oneStore.total_cost_cents)
            : "unavailable"}
          . Current plan cash cost: {money(plan.total_cost_cents)}. Compare any
          cash difference with your entered time value; no route or duration is
          inferred.
        </p>
      </Card>
    </>
  );
}
