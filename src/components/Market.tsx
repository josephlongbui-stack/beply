"use client";
import { useState, useMemo } from "react";
import {
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChartNoAxesCombined, Store } from "lucide-react";
import {
  useApp,
  Button,
  Card,
  Metric,
  Badge,
  Field,
  Note,
  Modal,
  money,
  qty,
  dateTime,
} from "./ui";
import LocalSupply, { LocalQuoteEditor } from "./LocalSupply";
import { LocationCard } from "./LocationSettings";
import {
  historyFor,
  referenceOffer,
  sourceReason,
  localDateTime,
} from "../domain/location";
import { forecast } from "../domain/forecast";
import { offerReason, stockConfidence } from "../domain/engine";
import type { Offer } from "../domain/types";
export default function Market() {
  const { state: s, derived: d, setView } = useApp();
  return (
    <>
      <section className="market-hero">
        <div>
          <div className="eyebrow">THE INGREDIENT EDIT</div>
          <h1>
            Your pantry.
            <br />
            <em>In perspective.</em>
          </h1>
          <p>Every price. Every ingredient. One continuous view.</p>
        </div>
        <div className="market-hero-aside">
          <Badge>
            {s.price_mode === "sample"
              ? "Illustrative sample prices"
              : "Your local price records"}
          </Badge>
          <p>
            No live feed. Charts use{" "}
            {s.price_mode === "sample"
              ? "the labeled sample history"
              : "the quotes you enter"}
            . Stock comes from your confirmed ledger.
          </p>
          <Button variant="secondary" onClick={() => setView("stock")}>
            Update stock counts
          </Button>
        </div>
      </section>
      <nav className="ingredient-jumps" aria-label="Jump to ingredient">
        {s.ingredients.map((i) => (
          <button
            key={i.id}
            onClick={() =>
              document
                .getElementById(`price-${i.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span>{i.name}</span>
            <span>↘</span>
          </button>
        ))}
      </nav>
      {s.price_mode === "local" && (
        <div className="feed-source-callout">
          <span>Prices are personal to your business’s location.</span>
          <button
            className="text-button"
            onClick={() =>
              document
                .getElementById("manage-suppliers")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Add or update supplier quotes ↗
          </button>
        </div>
      )}
      <div className="price-feed">
        {s.ingredients.map((i, index) => (
          <IngredientPrice key={i.id} selected={i.id} index={index} />
        ))}
      </div>
      <section id="manage-suppliers" className="supplier-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">THE NUMBERS BEHIND THE LINES</span>
            <h2>Your location & suppliers</h2>
          </div>
        </div>
        <LocationCard />
        <LocalSupply />
      </section>
      <div className="two-column">
        <Card>
          <div className="section-head">
            <div>
              <div className="eyebrow">FIXED BAKERY BASKET</div>
              <h2>Your private price index</h2>
            </div>
            <ChartNoAxesCombined size={22} className="muted" />
          </div>
          <div className="metrics-grid two">
            <Metric
              label={
                s.price_mode === "sample"
                  ? "Index · Aug 30 = 100"
                  : "Index · first quotes = 100"
              }
              value={
                d.purchasingPower.partial || !d.purchasingPower.hasHistory
                  ? "—"
                  : d.purchasingPower.index.toFixed(1)
              }
            />
            <Metric
              label="Current fixed basket"
              value={
                d.purchasingPower.partial
                  ? "Needs quotes"
                  : money(d.purchasingPower.currentCost)
              }
            />
          </div>
          <p>
            Fixed quantities and the same benchmark supplier for each ingredient
            are used throughout. {d.purchasingPower.basis}. Base basket:{" "}
            {d.purchasingPower.partial || !d.purchasingPower.hasHistory
              ? "incomplete"
              : money(d.purchasingPower.baseCost)}
            . No cross-business records are included.
          </p>
          <details>
            <summary>Show fixed basket composition</summary>
            <dl className="recipe-lines">
              {s.index_basket.map((b) => (
                <div key={b.ingredient_id}>
                  <dt>
                    {s.ingredients.find((i) => i.id === b.ingredient_id)?.name}
                  </dt>
                  <dd>
                    {qty(
                      b.quantity_base,
                      s.ingredients.find((i) => i.id === b.ingredient_id),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </Card>
        <Card>
          <div className="section-head">
            <div>
              <div className="eyebrow">PURCHASING POWER</div>
              <h2>What your available cash covers</h2>
            </div>
            <Store size={22} className="muted" />
          </div>
          <div className="power-value">
            {d.purchasingPower.partial
              ? "—"
              : d.purchasingPower.equivalents.toFixed(2)}{" "}
            <span>basket equivalents</span>
          </div>
          <p>
            {d.purchasingPower.partial
              ? "The basket is incomplete. Add current quotes for the missing ingredients before comparing how much your cash can buy."
              : `${money(d.plan.cash_available_cents)} spendable ÷ ${money(d.purchasingPower.currentCost)} per fixed basket. Your production requirements come from recipes and package optimization.`}
          </p>
          <Badge>
            {d.purchasingPower.partial
              ? "Add quotes for your basket ingredients"
              : d.purchasingPower.basis}
          </Badge>
        </Card>
      </div>
    </>
  );
}

function IngredientPrice({
  selected,
  index,
}: {
  selected: string;
  index: number;
}) {
  const { state: s, derived: d } = useApp(),
    [mode, setMode] = useState("all"),
    [usable, setUsable] = useState(false),
    [edit, setEdit] = useState<Offer | null>(null);
  const ingredient = s.ingredients.find((i) => i.id === selected)!,
    unit =
      ingredient.base_unit === "each"
        ? ingredient.id === "eggs"
          ? "egg"
          : "each"
        : ingredient.base_unit === "g"
          ? "kg"
          : "L",
    factor = ingredient.base_unit === "each" ? 1 : 1000;
  const benchmark = referenceOffer(s, selected);
  const allHistory = historyFor(s, selected);
  const observations = allHistory.filter(
    (p) =>
      p.supplier_id === (benchmark?.supplier_id ?? allHistory[0]?.supplier_id),
  );
  const projection = forecast(observations, localDateTime(s.clock, s.timezone));
  const chart = useMemo(
    () => [
      ...observations.map((p) => ({
        date: p.date.slice(5),
        observed: ((p.pack_price_cents / p.pack_quantity_base) * factor) / 100,
        forecast: undefined as number | undefined,
        range: undefined as number[] | undefined,
      })),
      ...projection.map((p) => ({
        date: p.date.slice(5),
        observed: undefined as number | undefined,
        forecast: (p.price * factor) / 100,
        range: [(p.low * factor) / 100, (p.high * factor) / 100],
      })),
    ],
    [observations, projection, factor],
  );
  const offers = s.offers.filter(
    (o) =>
      o.ingredient_id === selected &&
      !sourceReason(s, o) &&
      (mode === "all" ||
        s.suppliers.find((p) => p.id === o.supplier_id)?.mode === mode) &&
      (!usable || !offerReason(s, o)),
  );
  const last = observations.at(-1),
    first = observations[0],
    change =
      last && first && first.pack_price_cents > 0
        ? last.pack_price_cents /
            last.pack_quantity_base /
            (first.pack_price_cents / first.pack_quantity_base) -
          1
        : 0;
  return (
    <section
      className={`ingredient-feed-item ingredient-color-${index % 3}`}
      id={`price-${selected}`}
      aria-label={`${ingredient.name} prices and stock`}
    >
      <Card className="price-chart-card">
        <div className="price-card-topline">
          <span className="price-symbol">
            {ingredient.id.slice(0, 3).toUpperCase()}
          </span>
          <span>
            {s.price_mode === "sample" ? "SAMPLE DATA" : "YOUR RECORDED PRICES"}{" "}
            · USD / {unit}
          </span>
          <span>{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="price-stock-strip">
          <div>
            <span>Current benchmark / {unit}</span>
            <strong>
              {benchmark
                ? money(
                    ((benchmark.pack_price_cents +
                      (benchmark.tax_cents_per_pack ?? 0)) /
                      benchmark.pack_quantity_base) *
                      factor,
                  )
                : "—"}
            </strong>
          </div>
          <div>
            <span>On your shelves</span>
            <strong>
              {stockConfidence(s, selected) === "Needs checking"
                ? "Uncounted"
                : qty(d.stock[selected] ?? 0, ingredient)}
            </strong>
            <small>{stockConfidence(s, selected)}</small>
          </div>
          <div>
            <span>Needed for your plan</span>
            <strong>
              {s.production.items.some((i) => i.planned_units > 0)
                ? qty(d.plan.shortfalls[selected] ?? 0, ingredient)
                : "No plan yet"}
            </strong>
          </div>
        </div>

        <div className="section-head">
          <div>
            <div className="eyebrow">
              {ingredient.product_specification.toUpperCase()} · COMPARABLE UNIT
              PRICES
            </div>
            <h2>{ingredient.name} price history</h2>
            <p>
              {s.suppliers.find(
                (p) =>
                  p.id ===
                  (benchmark?.supplier_id ?? observations[0]?.supplier_id),
              )?.name ?? "No local observations yet"}{" "}
              · {observations[0]?.date ?? "—"} to{" "}
              {observations.at(-1)?.date ?? "—"}
            </p>
          </div>
          <div className="chart-stat">
            <strong>
              {observations.length > 1 && first.pack_price_cents > 0
                ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`
                : "—"}
            </strong>
            <small>change across recorded observations</small>
          </div>
        </div>
        <div className="chart-legend">
          <span>
            <i />{" "}
            {s.price_mode === "sample"
              ? "Historical sample observations"
              : "Owner-entered observations"}
          </span>
          <span>
            <i className="dashed" /> Illustrative outlook
          </span>
          <span>
            <i className="range" /> ±10% illustrative range
          </span>
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`${ingredient.name} ${s.price_mode === "sample" ? "synthetic" : "owner-entered"} history in dollars per ${unit}. Latest observed ${last ? money((last.pack_price_cents / last.pack_quantity_base) * factor) : "unavailable"}. Outlook is the trailing seven observation mean with an illustrative plus or minus ten percent range.`}
        >
          {!observations.length ? (
            <div className="chart-empty">
              <span className="empty-chart-line" />
              <strong>Your first price starts the line.</strong>
              <p>Add a local quote to start this ingredient’s history.</p>
              <button
                className="text-button"
                onClick={() =>
                  document
                    .getElementById("manage-suppliers")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Add your prices ↗
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <ComposedChart
                data={chart}
                margin={{ top: 15, right: 20, bottom: 10, left: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#e9ece5"
                />
                <XAxis
                  dataKey="date"
                  minTickGap={45}
                  tick={{ fontSize: 11, fill: "#718077" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                  tick={{ fontSize: 11, fill: "#718077" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(value) =>
                    Array.isArray(value)
                      ? `$${Number(value[0]).toFixed(2)}–$${Number(value[1]).toFixed(2)}/${unit}`
                      : `$${Number(value).toFixed(2)}/${unit}`
                  }
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #dfe4dc",
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  x={localDateTime(s.clock, s.timezone).slice(5, 10)}
                  stroke="#bbc6bd"
                  label={{
                    value: "Planning date",
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#718077",
                  }}
                />
                <Area
                  type="linear"
                  dataKey="range"
                  name="Illustrative range"
                  stroke="none"
                  fill="#d6e3d8"
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="observed"
                  name="Observed"
                  stroke="#2d614e"
                  strokeWidth={2}
                  dot={observations.length === 1 ? { r: 4 } : false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="forecast"
                  name="Illustrative outlook"
                  stroke="#678575"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={observations.length === 1 ? { r: 4 } : false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="caption">
          USD per {unit} · source:{" "}
          {s.price_mode === "sample"
            ? "synthetic Market observations"
            : "owner-entered local benchmark quotes"}
          . Current quotes observed{" "}
          {dateTime(benchmark?.observed_at ?? s.clock, s.timezone)} Editing a
          quote updates current costs. Saved local price observations remain in
          your history.
        </p>
        <Note>
          {projection.length
            ? "Outlook method: flat mean of the latest seven comparable observations. The ±10% range is illustrative, not a calibrated confidence interval. No future observations are used. Recheck a quote; never wait beyond preparation."
            : "Not enough comparable price history. At least seven dated observations are required."}
        </Note>
        <details>
          <summary>
            Accessible data table · recent observations and outlook
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="numeric">USD / {unit}</th>
                </tr>
              </thead>
              <tbody>
                {chart.slice(-14).map((p, index) => (
                  <tr key={`${p.date}-${index}`}>
                    <td>{p.date}</td>
                    <td>
                      {p.observed === undefined
                        ? "Illustrative outlook"
                        : s.price_mode === "sample"
                          ? "Sample observation"
                          : "Owner-entered quote"}
                    </td>
                    <td className="numeric">
                      {money((p.observed ?? p.forecast ?? 0) * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
      <Card>
        <div className="section-head">
          <div>
            <h2>Compare packages for {ingredient.name.toLowerCase()}</h2>
            <p>
              Eligibility uses your current production deadline and owner
              preferences.
            </p>
          </div>
          <div className="filter-row">
            <select
              aria-label="Offer mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="all">All suppliers</option>
              <option value="in_store">In-store</option>
              <option value="online">Online</option>
            </select>
            <label className="check-label">
              <input
                type="checkbox"
                checked={usable}
                onChange={(e) => setUsable(e.target.checked)}
              />
              Eligible only
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Supplier / specification</th>
                <th className="numeric">Pack size</th>
                <th className="numeric">Pack + tax</th>
                <th className="numeric">Per {unit}</th>
                <th>Eligibility</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const reason = offerReason(s, o);
                return (
                  <tr key={o.id}>
                    <th scope="row">
                      {s.suppliers.find((p) => p.id === o.supplier_id)?.name}
                      <small>{o.product_specification}</small>
                      <small>{o.source_label ?? "Sample fixture"}</small>
                    </th>
                    <td className="numeric">
                      {qty(o.pack_quantity_base, ingredient)}
                    </td>
                    <td className="numeric emph">
                      {money(o.pack_price_cents + (o.tax_cents_per_pack ?? 0))}
                    </td>
                    <td className="numeric">
                      {money(
                        ((o.pack_price_cents + (o.tax_cents_per_pack ?? 0)) /
                          o.pack_quantity_base) *
                          factor,
                      )}
                    </td>
                    <td>
                      <Badge tone={reason ? "warn" : "good"}>
                        {reason ??
                          (s.price_mode === "sample"
                            ? "Eligible sample quote"
                            : "Eligible owner quote")}
                      </Badge>
                      <small>
                        {o.valid_until
                          ? `Valid to ${dateTime(o.valid_until, s.timezone)}`
                          : "Validity unknown"}
                      </small>
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => setEdit(o)}>
                        Edit quote
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!offers.length && <p>No offers match these filters.</p>}
      </Card>
      {edit &&
        (s.suppliers.find((p) => p.id === edit.supplier_id)?.is_sample ===
        false ? (
          <LocalQuoteEditor
            key={edit.id}
            supplierId={edit.supplier_id}
            offer={edit}
            onClose={() => setEdit(null)}
          />
        ) : (
          <QuoteEditor
            key={edit.id}
            offer={edit}
            onClose={() => setEdit(null)}
          />
        ))}
    </section>
  );
}
function QuoteEditor({
  offer,
  onClose,
}: {
  offer: Offer;
  onClose: () => void;
}) {
  const { mutate, busy } = useApp(),
    [price, setPrice] = useState(offer.pack_price_cents),
    [availability, setAvailability] = useState(offer.availability);
  return (
    <Modal title="Edit sample supplier quote" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              type: "offer",
              offer_id: offer.id,
              pack_price_cents: price,
              availability: availability as
                "in_stock_demo" | "unknown" | "out_of_stock",
            })
          )
            onClose();
        }}
      >
        <Note>
          Editing a current quote recalculates your plan and costs, and
          invalidates unexecuted approval. Historical price observations remain
          unchanged.
        </Note>
        <Field label="Price per pack ($)">
          <input
            aria-label="Quote pack price"
            type="number"
            min="0"
            step="0.01"
            required
            value={price / 100}
            onChange={(e) => setPrice(Math.round(+e.target.value * 100))}
          />
        </Field>
        <Field label="Availability">
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="in_stock_demo">In stock · sample</option>
            <option value="unknown">Unknown / needs checking</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </Field>
        <div className="modal-actions">
          <Button disabled={busy}>Save quote & recalculate</Button>
        </div>
      </form>
    </Modal>
  );
}
