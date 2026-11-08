"use client";
import { useState } from "react";
import { Plus, MapPin, Store } from "lucide-react";
import { useApp, Card, Button, Field, Note, Modal, Badge, money } from "./ui";
import {
  locationKey,
  locationLabel,
  localDateTime,
  foldForInstant,
  zonedInstant,
  US_TIMEZONES,
} from "../domain/location";
import {
  PACKAGE_UNITS,
  packageBaseQuantity,
  type PackageUnit,
} from "../domain/units";
import type { Supplier, Offer } from "../domain/types";
export default function LocalSupply() {
  const { state: s, openLocation } = useApp();
  const [edit, setEdit] = useState<Supplier | null | undefined>(undefined),
    [quoteSupplier, setQuoteSupplier] = useState<string | null>(null);
  const suppliers = s.suppliers.filter(
    (p) => p.is_sample === false && p.location_key === locationKey(s.location),
  );
  return (
    <Card className="local-supply-head">
      <div className="section-head">
        <div>
          <div className="eyebrow">
            {locationLabel(s.location).toUpperCase()} · YOUR LOCAL PRICES
          </div>
          <h2>Shop the places you know.</h2>
          <p>
            Add a supplier and the prices you’ve checked. beply compares
            packages, trip costs and arrival times.
          </p>
        </div>
        <Button
          onClick={() => (s.location.city ? setEdit(null) : openLocation())}
        >
          <Plus size={16} />
          Add local supplier
        </Button>
      </div>
      <Note>
        These are your own quotes, scoped to {locationLabel(s.location)}{" "}
        {s.location.postal_code}. No nearby-store search, live prices, automatic
        tax rates or routes are connected. Include any tax per pack and your
        estimated trip cost. The planning time is{" "}
        {localDateTime(s.clock, s.timezone).replace("T", " ")}.
      </Note>
      {s.price_mode === "sample" && (
        <div className="button-row">
          <Badge tone="warn">Planning still uses sample prices</Badge>
          <button className="text-button" onClick={openLocation}>
            Switch to local prices
          </button>
        </div>
      )}
      <div className="local-supply-list">
        {suppliers.map((p) => (
          <div key={p.id} className="local-supply-item">
            <div className="eyebrow">
              <Store size={13} />{" "}
              {p.mode === "online" ? "ONLINE · SIMULATED ORDERS" : "IN PERSON"}
            </div>
            <h3>{p.name}</h3>
            <p>
              <MapPin size={12} /> {p.address || locationLabel(s.location)}
            </p>
            <p>
              {s.offers.filter((o) => o.supplier_id === p.id).length} ingredient
              quotes · {money(p.estimated_trip_cash_cost_cents)} trip ·{" "}
              {money(p.shipping_cents ?? 0)} shipping
            </p>
            <div className="button-row">
              <Button
                variant="secondary"
                onClick={() => setQuoteSupplier(p.id)}
              >
                Add package quote
              </Button>
              <Button variant="ghost" onClick={() => setEdit(p)}>
                Edit supplier
              </Button>
            </div>
          </div>
        ))}
      </div>
      {!suppliers.length && (
        <div className="local-supply-empty">
          <strong>Your neighborhood starts here.</strong>
          <p>
            Add the market, wholesaler or online supplier you use, then enter a
            quote for each ingredient you need.
          </p>
        </div>
      )}
      {edit !== undefined && (
        <SupplierEditor
          supplier={edit ?? undefined}
          onClose={() => setEdit(undefined)}
        />
      )}
      {quoteSupplier && (
        <LocalQuoteEditor
          supplierId={quoteSupplier}
          onClose={() => setQuoteSupplier(null)}
        />
      )}
    </Card>
  );
}
function SupplierEditor({
  supplier: p,
  onClose,
}: {
  supplier?: Supplier;
  onClose: () => void;
}) {
  const { state: s, mutate, busy } = useApp();
  const [name, setName] = useState(p?.name ?? ""),
    [address, setAddress] = useState(p?.address ?? ""),
    [mode, setMode] = useState(p?.mode ?? "in_store"),
    [timezone, setTimezone] = useState(p?.timezone ?? s.timezone),
    [ready, setReady] = useState(
      localDateTime(p?.ready_at ?? s.clock, p?.timezone ?? s.timezone),
    ),
    [open, setOpen] = useState(p?.hours?.split(/[–-]/)[0] ?? "07:00"),
    [close, setClose] = useState(p?.hours?.split(/[–-]/)[1] ?? "20:00"),
    [trip, setTrip] = useState((p?.estimated_trip_cash_cost_cents ?? 0) / 100),
    [shipping, setShipping] = useState((p?.shipping_cents ?? 0) / 100),
    [minimum, setMinimum] = useState((p?.minimum_order_cents ?? 0) / 100),
    [fold, setFold] = useState<"earlier" | "later">(
      foldForInstant(p?.ready_at ?? s.clock, p?.timezone ?? s.timezone),
    ),
    [error, setError] = useState("");
  return (
    <Modal
      title={p ? "Edit local supplier" : "Add local supplier"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            if (
              await mutate({
                type: "local_supplier",
                supplier_id: p?.id,
                name,
                address,
                mode: mode as "in_store" | "online",
                timezone,
                ready_at: zonedInstant(ready, timezone, fold),
                hours: `${open}-${close}`,
                estimated_trip_cash_cost_cents: Math.round(trip * 100),
                shipping_cents: Math.round(shipping * 100),
                minimum_order_cents: Math.round(minimum * 100),
              })
            )
              onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {error && <Note tone="danger">{error}</Note>}
        <Note>
          Available to this business location only: {locationLabel(s.location)}{" "}
          {s.location.postal_code}. Enter confirmed information yourself.
        </Note>
        <Field label="Supplier name">
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Address or pickup instructions">
          <input
            maxLength={200}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Supplier type">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="in_store">In person</option>
              <option value="online">
                Online delivery · simulated ordering
              </option>
            </select>
          </Field>
          <Field label="Supplier timezone">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {US_TIMEZONES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label={
            mode === "in_store"
              ? "Earliest collection (supplier local time)"
              : "Delivery arrival (supplier local time)"
          }
        >
          <input
            required
            type="datetime-local"
            value={ready}
            onChange={(e) => setReady(e.target.value)}
          />
        </Field>
        {mode === "in_store" && (
          <div className="form-grid">
            <Field label="Daily opening time">
              <input
                required
                type="time"
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </Field>
            <Field label="Daily closing time">
              <input
                required
                type="time"
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="form-grid">
          <Field label="Estimated trip cost ($)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={trip}
              onChange={(e) => setTrip(+e.target.value)}
            />
          </Field>
          <Field label="Shipping charge ($)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={shipping}
              onChange={(e) => setShipping(+e.target.value)}
            />
          </Field>
          <Field label="Minimum package spend incl. tax ($)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={minimum}
              onChange={(e) => setMinimum(+e.target.value)}
            />
          </Field>
          <Field label="If the local hour repeats">
            <select
              value={fold}
              onChange={(e) => setFold(e.target.value as "earlier" | "later")}
            >
              <option value="earlier">First occurrence</option>
              <option value="later">Second occurrence</option>
            </select>
          </Field>
        </div>
        <p className="small-copy">
          Hours repeat daily. Closing earlier than opening means overnight;
          equal times mean 24 hours. Trip costs and shipping are owner
          estimates. Saving changes requires a new approval.
        </p>
        <div className="modal-actions">
          <Button disabled={busy}>Save local supplier</Button>
        </div>
      </form>
    </Modal>
  );
}
export function LocalQuoteEditor({
  supplierId,
  offer,
  onClose,
}: {
  supplierId: string;
  offer?: Offer;
  onClose: () => void;
}) {
  const { state: s, mutate, busy } = useApp();
  const [ingredient, setIngredient] = useState(offer?.ingredient_id ?? "flour"),
    [pack, setPack] = useState(
      offer?.input_quantity ?? offer?.pack_quantity_base ?? 1000,
    ),
    [unit, setUnit] = useState<PackageUnit>(
      (offer?.input_unit as PackageUnit) ??
        s.ingredients.find((i) => i.id === offer?.ingredient_id)?.base_unit ??
        "g",
    ),
    [price, setPrice] = useState((offer?.pack_price_cents ?? 0) / 100),
    [tax, setTax] = useState((offer?.tax_cents_per_pack ?? 0) / 100),
    [maximum, setMaximum] = useState(offer?.maximum_packs ?? 20),
    [availability, setAvailability] = useState(
      offer?.availability ?? "confirmed",
    ),
    [source, setSource] = useState(offer?.source_label ?? ""),
    [observed, setObserved] = useState(
      localDateTime(offer?.observed_at ?? s.clock, s.timezone),
    ),
    [valid, setValid] = useState(
      localDateTime(
        offer?.valid_until ?? s.production.prep_starts_at,
        s.timezone,
      ),
    ),
    [fold, setFold] = useState<"earlier" | "later">(
      foldForInstant(offer?.observed_at ?? s.clock, s.timezone),
    ),
    [validFold, setValidFold] = useState<"earlier" | "later">(
      foldForInstant(
        offer?.valid_until ?? s.production.prep_starts_at,
        s.timezone,
      ),
    ),
    [error, setError] = useState("");
  const item = s.ingredients.find((i) => i.id === ingredient)!;
  let converted = "—";
  try {
    converted = packageBaseQuantity(
      pack,
      unit,
      item.base_unit,
    ).toLocaleString();
  } catch {}
  return (
    <Modal
      title={offer ? "Edit local package quote" : "Add local package quote"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            if (
              await mutate({
                type: "local_quote",
                offer_id: offer?.id,
                supplier_id: supplierId,
                ingredient_id: ingredient,
                package_quantity: pack,
                package_unit: unit,
                pack_price_cents: Math.round(price * 100),
                tax_cents_per_pack: Math.round(tax * 100),
                maximum_packs: maximum,
                availability: availability as
                  "confirmed" | "unknown" | "out_of_stock",
                observed_at: zonedInstant(observed, s.timezone, fold),
                valid_until: zonedInstant(valid, s.timezone, validFold),
                source_label: source,
              })
            )
              onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {error && <Note tone="danger">{error}</Note>}
        <Note>
          {s.suppliers.find((p) => p.id === supplierId)?.name} ·{" "}
          {locationLabel(s.location)}. Confirm the ingredient specification and
          use the base unit shown. Saving an existing supplier/ingredient
          replaces its current quote and retains its price observations.
        </Note>
        <Field label="Quote ingredient">
          <select
            disabled={!!offer}
            value={ingredient}
            onChange={(e) => {
              setIngredient(e.target.value);
              setPack(
                s.ingredients.find((i) => i.id === e.target.value)
                  ?.base_unit === "each"
                  ? 1
                  : 1000,
              );
              setUnit(
                s.ingredients.find((i) => i.id === e.target.value)!.base_unit,
              );
            }}
          >
            {s.ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="small-copy">
          Required specification: {item.product_specification}. US weight and
          volume units are converted to whole grams or milliliters, rounded down
          so the plan never overstates available stock.
        </p>
        <div className="form-grid">
          <Field label="Package quantity">
            <input
              aria-label="Local package quantity"
              required
              type="number"
              min="0.001"
              step="any"
              value={pack}
              onChange={(e) => setPack(+e.target.value)}
            />
          </Field>
          <Field label="Package unit">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as PackageUnit)}
            >
              {Object.entries(PACKAGE_UNITS)
                .filter(([, u]) => u.base === item.base_unit)
                .map(([key, u]) => (
                  <option key={key} value={key}>
                    {u.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Local price per pack ($)">
            <input
              aria-label="Local price per pack"
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(+e.target.value)}
            />
          </Field>
          <Field label="Tax per pack ($)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={tax}
              onChange={(e) => setTax(+e.target.value)}
            />
          </Field>
          <Field label="Maximum packs available">
            <input
              required
              type="number"
              min="0"
              max="100"
              step="1"
              value={maximum}
              onChange={(e) => setMaximum(+e.target.value)}
            />
          </Field>
        </div>
        <p className="small-copy">
          Ledger package: {converted} {item.base_unit}. Tax is supplied by you,
          not estimated from ZIP.
        </p>
        <Field label="Quote availability">
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="confirmed">In stock · confirmed by me</option>
            <option value="unknown">Unknown</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </Field>
        <Field label="Quote source or note">
          <input
            required
            maxLength={200}
            placeholder="e.g. Shelf label checked by owner"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Observed at (business local time)">
            <input
              required
              type="datetime-local"
              value={observed}
              onChange={(e) => setObserved(e.target.value)}
            />
          </Field>
          <Field label="Valid until (business local time)">
            <input
              required
              type="datetime-local"
              value={valid}
              onChange={(e) => setValid(e.target.value)}
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
        <Field label="If the validity hour repeats">
          <select
            value={validFold}
            onChange={(e) =>
              setValidFold(e.target.value as "earlier" | "later")
            }
          >
            <option value="earlier">First occurrence</option>
            <option value="later">Second occurrence</option>
          </select>
        </Field>
        <p className="small-copy">
          Times use {s.timezone}. Current simulated time:{" "}
          {localDateTime(s.clock, s.timezone).replace("T", " ")}. Price history
          starts with your first saved quote; sample histories are kept
          separate.
        </p>
        <div className="modal-actions">
          <Button disabled={busy}>Save local quote & recalculate</Button>
        </div>
      </form>
    </Modal>
  );
}
