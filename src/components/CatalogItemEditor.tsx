"use client";
import { useState } from "react";
import { useApp, Modal, Field, Button, Note } from "./ui";
import type { Ingredient } from "../domain/types";
export default function CatalogItemEditor({
  onClose,
}: {
  onClose: () => void;
}) {
  const { mutate, busy } = useApp();
  const [name, setName] = useState(""),
    [translation, setTranslation] = useState(""),
    [category, setCategory] =
      useState<NonNullable<Ingredient["category"]>>("ingredient"),
    [unit, setUnit] = useState<Ingredient["base_unit"]>("g"),
    [countUnit, setCountUnit] = useState("units"),
    [spec, setSpec] = useState(""),
    [capacity, setCapacity] = useState(""),
    [reorder, setReorder] = useState(""),
    [operationKey] = useState(() => crypto.randomUUID());
  return (
    <Modal title="Add a stock item" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutate({
              type: "catalog_item",
              name,
              name_vi: translation,
              category,
              base_unit: unit,
              count_unit: countUnit,
              product_specification: spec,
              max_storage_base: Number(capacity),
              reorder_point_base: Number(reorder || 0),
              operation_key: operationKey,
            })
          )
            onClose();
        }}
      >
        <p>
          Add what your business actually uses or sells. Then enter a count and
          supplier quote to bring it into your plan.
        </p>
        <div className="form-grid">
          <Field label="Item name">
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Coffee beans, rice, takeaway cups…"
            />
          </Field>
          <Field label="Vietnamese name (optional)">
            <input
              maxLength={100}
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Item category">
            <select
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value as NonNullable<Ingredient["category"]>,
                )
              }
            >
              <option value="ingredient">Ingredient</option>
              <option value="packaging">Packaging</option>
              <option value="resale">Resale goods</option>
              <option value="supply">Operating supply</option>
            </select>
          </Field>
          <Field label="Track quantities by">
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value as Ingredient["base_unit"]);
                setCapacity("");
                setReorder("");
              }}
            >
              <option value="g">Weight · grams</option>
              <option value="ml">Volume · milliliters</option>
              <option value="each">Count · each</option>
            </select>
          </Field>
        </div>
        {unit === "each" && (
          <Field
            label="Count label"
            hint="How counts appear, for example cups, bottles or pieces."
          >
            <input
              required
              maxLength={30}
              value={countUnit}
              onChange={(e) => setCountUnit(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Product specification"
          hint="Keep grades, sizes and variants distinct for supplier comparisons."
        >
          <input
            required
            maxLength={200}
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="12 oz compostable hot cup"
          />
        </Field>
        <div className="form-grid">
          <Field label={`Storage capacity (${unit})`}>
            <input
              required
              type="number"
              min={1}
              max={100000000}
              step={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field
            label={`Low-stock reminder at (${unit})`}
            hint="Optional. Reminds you after a confirmed count; it does not automatically place an order."
          >
            <input
              type="number"
              min={0}
              max={capacity || 100000000}
              step={1}
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </Field>
        </div>
        <Note>
          Adding an item creates no physical stock or price history. Include
          packaging in a recipe when it should be purchased and consumed with
          production; avoid also including that same packaging cost in the
          recipe’s separate cost allowance.
        </Note>
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>Save stock item</Button>
        </div>
      </form>
    </Modal>
  );
}
