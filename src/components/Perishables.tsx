"use client";
import { useState } from "react";
import {
  useApp,
  Card,
  Button,
  Badge,
  Field,
  Modal,
  Note,
  qty,
  dateTime,
} from "./ui";
import { assignedQuantity } from "../domain/perishables";
import { localDateTime, zonedInstant } from "../domain/location";

export default function Perishables() {
  const { state: s, derived: d, mutate, busy } = useApp();
  const [open, setOpen] = useState(false),
    [item, setItem] = useState(s.ingredients[0]?.id ?? ""),
    [label, setLabel] = useState(""),
    [quantity, setQuantity] = useState(""),
    [date, setDate] = useState(""),
    [fold, setFold] = useState<"earlier" | "later">("earlier");
  const ingredient = s.ingredients.find((i) => i.id === item);
  const unlabelled = (d.stock[item] ?? 0) - assignedQuantity(s, item);
  let instant = "",
    error = "";
  if (date) {
    try {
      instant = zonedInstant(date, s.timezone, fold);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const lots = (s.lots ?? [])
    .filter((l) => l.remaining_base > 0)
    .toSorted((a, b) => Date.parse(a.use_by) - Date.parse(b.use_by));
  return (
    <Card className="perishables-card">
      <div className="section-head">
        <div>
          <div className="eyebrow">USE WHAT YOU HAVE, IN TIME</div>
          <h2>Perishable lots</h2>
          <p>
            Label stock already on your shelves with its actual use-by date.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Label a lot
        </Button>
      </div>
      {!lots.length ? (
        <p>
          No dated lots yet. Dates come from your labels and checks; beply does
          not invent shelf lives.
        </p>
      ) : (
        <div className="lot-grid">
          {lots.map((l) => {
            const expired = Date.parse(l.use_by) < Date.parse(s.clock),
              beforePrep =
                Date.parse(l.use_by) < Date.parse(s.production.prep_starts_at);
            return (
              <article className="lot-tile" key={l.id}>
                <Badge tone={beforePrep ? "warn" : "good"}>
                  {expired
                    ? "Past use-by"
                    : beforePrep
                      ? "Use before next prep"
                      : "Dated stock"}
                </Badge>
                <h3>
                  {s.ingredients.find((i) => i.id === l.ingredient_id)?.name}
                </h3>
                <strong>
                  {qty(
                    l.remaining_base,
                    s.ingredients.find((i) => i.id === l.ingredient_id),
                  )}
                </strong>
                <p>{l.label}</p>
                <small>Use by {dateTime(l.use_by, s.timezone)}</small>
              </article>
            );
          })}
        </div>
      )}
      <Note>
        Lots past their use-by at preparation are excluded from usable stock.
        Production uses dated lots earliest first. Record discarded stock with
        Waste; expiry alone does not remove physical inventory. A fresh count
        clears lot labels for that item.
      </Note>
      {open && (
        <Modal title="Label existing stock" onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate({
                  type: "lot",
                  ingredient_id: item,
                  label,
                  quantity_base: Number(quantity),
                  use_by: instant,
                  operation_key: crypto.randomUUID(),
                })
              ) {
                setOpen(false);
                setLabel("");
                setQuantity("");
              }
            }}
          >
            <Field label="Stock item">
              <select value={item} onChange={(e) => setItem(e.target.value)}>
                {s.ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <p>
              Without a lot label:{" "}
              <strong>{qty(unlabelled, ingredient)}</strong>. This action adds
              no stock.
            </p>
            <Field label="Lot or container label">
              <input
                required
                maxLength={100}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Supplier lot, delivery date, container label"
              />
            </Field>
            <Field
              label={`Quantity in this lot (${ingredient?.base_unit ?? "units"})`}
            >
              <input
                required
                type="number"
                min="1"
                max={unlabelled}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Use-by date and time">
              <input
                required
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={localDateTime("2000-01-01T00:00:00Z", s.timezone)}
              />
            </Field>
            <Field label="If the use-by hour repeats">
              <select
                value={fold}
                onChange={(e) => setFold(e.target.value as "earlier" | "later")}
              >
                <option value="earlier">First occurrence</option>
                <option value="later">Second occurrence</option>
              </select>
            </Field>
            <p className="caption">
              {s.timezone}. Use the source label and your own handling
              assessment.
            </p>
            {error && <Note tone="danger">{error}</Note>}
            <div className="modal-actions">
              <Button disabled={busy || !instant || !!error || unlabelled <= 0}>
                Save lot label
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
