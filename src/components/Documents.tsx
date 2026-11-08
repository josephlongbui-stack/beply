"use client";
/* Source previews deliberately bypass optimization: private, authenticated uploads must not enter the public image cache. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import {
  Upload,
  FileText,
  Search,
  ArrowRight,
  Download,
  RotateCcw,
  ShieldCheck,
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
  dateTime,
} from "./ui";
import type { DocumentRecord, Recipe } from "../domain/types";
import type { CsvPreview, ImportKind } from "../domain/imports";
import { LocationCard } from "./LocationSettings";
import UploadIntake from "./UploadIntake";
import AccountPanel from "./AccountPanel";
import { RecipeFields } from "./Inventory";
export default function Documents() {
  const { state: s, mutate, busy, setNotice, setView } = useApp(),
    t = useT();
  const [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [resetOpen, setResetOpen] = useState(false),
    [manualOpen, setManualOpen] = useState(false);
  const doc = s.documents.find((d) => d.id === selected),
    documents = s.documents.filter((d) =>
      `${d.name} ${d.type} ${d.external_id} ${d.notes}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  async function sample(
    kind: "baguette" | "butter_bun" | "receipt" | "statement",
  ) {
    if (await mutate({ type: "sample", sample: kind }))
      setSelected(`sample_${kind}`);
  }
  return (
    <>
      <PageHeading
        eyebrow="FROM PAPER TO A PRIVATE OPERATING MODEL"
        title="Your records. Clearly understood."
        description="Review every quantity before it becomes a recipe, a payment or physical stock."
        action={
          <Button
            onClick={() => document.getElementById("document-upload")?.click()}
          >
            <Upload size={16} />
            {t.upload}
          </Button>
        }
      />
      <AccountPanel />
      <Card className="integration-card">
        <div className="section-head">
          <div>
            <div className="eyebrow">CONNECT THE RECORDS YOU ALREADY KEEP</div>
            <h2>Spreadsheet imports</h2>
          </div>
          <Badge tone="good">Available · CSV</Badge>
        </div>
        <p>
          Import recipes, purchases, production quantities and supplier price
          lists. Upload a CSV below, choose its template, review every row, then
          commit. Price lists update the same supplier comparison and ingredient
          charts.
        </p>
        <a
          className="button secondary"
          href="/templates/supplier-quotes.csv"
          download
        >
          Supplier price list template
        </a>
        <p className="caption">
          Use stock item and local supplier names already in this workspace.
          Availability, source, tax and validity are required. Square, Shopify,
          bank feeds and live supplier connections are not connected.
        </p>
      </Card>
      {s.kind === "guided" && (
        <Card className="guided-card">
          <Badge tone="good">Guided demo · isolated workspace</Badge>
          <h2>Build your bakery’s starting picture.</h2>
          <div className="guided-steps">
            <span className={s.recipes.length >= 2 ? "done" : ""}>
              1 · Review both recipes
            </span>
            <span
              className={
                s.ingredients.every((i) => i.confidence === "confirmed")
                  ? "done"
                  : ""
              }
            >
              2 · Confirm counts
            </span>
            <span className={s.production.items.length ? "done" : ""}>
              3 · Enter production
            </span>
          </div>
          <p>
            Recipe and receipt photos alone cannot tell us what is currently on
            your shelves. These sample opening counts are explicit observations:
            12 kg flour, 0.5 kg butter, 1 kg sugar, 12 eggs, 0.1 kg yeast and 1
            L milk.
          </p>
          <Button
            variant="secondary"
            disabled={
              busy || s.ingredients.every((i) => i.confidence === "confirmed")
            }
            onClick={() =>
              void mutate({
                type: "confirm_opening",
                operation_key: "guided-opening",
              })
            }
          >
            Confirm sample starting counts
          </Button>
        </Card>
      )}
      <div className="document-intake">
        <UploadIntake
          onUploaded={setSelected}
          onManual={() => setManualOpen(true)}
        />
        {s.kind !== "owner" ? (
          <Card>
            <div className="eyebrow">TRY THE WHOLE WORKFLOW</div>
            <h2>Use a clearly labeled sample.</h2>
            <p>
              These generated document images match the bundled fixtures. Sample
              extraction is deterministic, not live document analysis.
            </p>
            <div className="sample-buttons">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void sample("baguette")}
              >
                <FileText size={16} />
                Use sample recipe
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void sample("butter_bun")}
              >
                Butter bun recipe
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void sample("receipt")}
              >
                Use sample receipt
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void sample("statement")}
              >
                Payment statement
              </Button>
            </div>
          </Card>
        ) : (
          <div className="paper-guide">
            <span className="eyebrow">YOUR SOURCE OF TRUTH</span>
            <h2>
              One photo.
              <br />A clearer picture.
            </h2>
            <ol>
              <li>
                <strong>Recipes</strong>
                <p>Confirm the batch yield and ingredient quantities.</p>
              </li>
              <li>
                <strong>Invoices & receipts</strong>
                <p>
                  Review quantities and prices. Confirm payment and delivery
                  separately.
                </p>
              </li>
              <li>
                <strong>Stock observations</strong>
                <p>
                  Count what is actually on your shelves. A receipt alone cannot
                  tell us what is left.
                </p>
              </li>
            </ol>
            <Button variant="secondary" onClick={() => setView("stock")}>
              Enter a stock count <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>
      <Card>
        <div className="section-head">
          <div>
            <h2>Document library</h2>
            <p>Source files, reviewed facts and linked records.</p>
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search documents"
              placeholder="Search documents…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {documents.length ? (
          <div className="document-list">
            {documents.map((d) => (
              <button key={d.id} onClick={() => setSelected(d.id)}>
                <span className="document-icon">
                  <FileText size={23} />
                </span>
                <span>
                  <strong>{d.name}</strong>
                  <small>
                    {d.mode === "sample"
                      ? "Sample extraction"
                      : d.mode === "csv"
                        ? "CSV · explicit review"
                        : d.mode === "local_ocr"
                          ? "Text read locally · review required"
                          : "Manual entry · no AI extraction"}{" "}
                    · {d.type} · {dateTime(d.created_at, s.timezone)}
                  </small>
                </span>
                <Badge tone={d.status === "Needs review" ? "warn" : "good"}>
                  {d.status}
                </Badge>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title={
              query ? "No matching documents" : "No documents reviewed yet"
            }
          >
            {query
              ? "Try a different name or reference."
              : "Upload a source, enter it manually, or use one of the bundled samples above."}
          </Empty>
        )}
      </Card>
      <LocationCard />
      <div className="two-column">
        <Card>
          <div className="section-head">
            <h2>Import templates</h2>
            <Download size={20} className="muted" />
          </div>
          <p>
            Upload a filled CSV, preview row-level validation, then explicitly
            commit. Invalid rows block the import.
          </p>
          <div className="template-links">
            {["recipe", "purchase", "production"].map((kind) => (
              <a key={kind} href={`/templates/${kind}_import.csv`} download>
                <FileText size={17} />
                {kind.charAt(0).toUpperCase() + kind.slice(1)} CSV
                <Download size={15} />
              </a>
            ))}
          </div>
        </Card>
        <Card>
          <div className="section-head">
            <h2>Workspace & adapters</h2>
            <ShieldCheck size={20} className="muted" />
          </div>
          <dl className="adapter-list">
            <div>
              <dt>Storage</dt>
              <dd>Local server · SQLite + private files</dd>
            </div>
            <div>
              <dt>Document analysis</dt>
              <dd>Sample adapter / manual review</dd>
            </div>
            <div>
              <dt>Prices & histories</dt>
              <dd>
                {s.price_mode === "sample"
                  ? "Fictional sample records"
                  : "Your entered local quotes"}
              </dd>
            </div>
            <div>
              <dt>Online orders</dt>
              <dd>Demo adapter · no real orders</dd>
            </div>
          </dl>
          <div className="button-row">
            <a className="button secondary" href="/api/export?kind=json">
              Export workspace
            </a>
            <Button variant="ghost" onClick={() => setResetOpen(true)}>
              <RotateCcw size={15} />
              Reset demo
            </Button>
          </div>
        </Card>
      </div>
      <Card>
        <div className="section-head">
          <h2>Trip cash assumptions</h2>
          <Badge>Owner editable</Badge>
        </div>
        <div className="form-grid three">
          {s.suppliers
            .filter((p) => p.mode === "in_store")
            .map((p) => (
              <form
                key={`${p.id}-${p.estimated_trip_cash_cost_cents}`}
                className="trip-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await mutate({
                    type: "supplier",
                    supplier_id: p.id,
                    estimated_trip_cash_cost_cents: Math.round(
                      Number(f.get("trip")) * 100,
                    ),
                  });
                }}
              >
                <Field label={`${p.name} · $ / visit`}>
                  <input
                    name="trip"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={p.estimated_trip_cash_cost_cents / 100}
                  />
                </Field>
                <Button variant="secondary" disabled={busy}>
                  {t.save}
                </Button>
              </form>
            ))}
        </div>
        <p className="caption">
          Cash assumptions only. No route, mileage or travel-time calculation is
          implied.
        </p>
      </Card>
      <Card>
        <div className="section-head">
          <h2>Workspace audit</h2>
          <Badge>{s.audit.length} events</Badge>
        </div>
        <div className="audit-list">
          {s.audit.slice(0, 15).map((a) => (
            <div key={a.id}>
              <span className="audit-dot" />
              <div>
                <strong>{a.event}</strong>
                <p>{a.detail}</p>
              </div>
              <small>{dateTime(a.occurred_at, s.timezone)}</small>
            </div>
          ))}
        </div>
      </Card>
      {doc && (
        <DocumentReview
          key={doc.id}
          doc={doc}
          onClose={() => setSelected(null)}
        />
      )}{" "}
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} />}{" "}
      {manualOpen && (
        <Modal
          title="Enter a document manually"
          onClose={() => setManualOpen(false)}
        >
          <p>Create a review form. Enter only the facts you can verify.</p>
          <div className="button-row">
            {(["recipe", "invoice", "receipt", "statement"] as const).map(
              (kind) => (
                <Button
                  key={kind}
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (await mutate({ type: "manual_document", kind })) {
                      setManualOpen(false);
                      setNotice(
                        "Manual draft created. Open it in the document library.",
                      );
                    }
                  }}
                >
                  {kind}
                </Button>
              ),
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function DocumentReview({
  doc,
  onClose,
}: {
  doc: DocumentRecord;
  onClose: () => void;
}) {
  const { state: s, mutate, busy, setPayload } = useApp(),
    [draft, setDraft] = useState(doc);
  const [reading, setReading] = useState(false),
    [readError, setReadError] = useState("");
  if (doc.mime === "text/csv" && doc.storage_key)
    return <CsvReview doc={doc} onClose={onClose} />;
  const locked = doc.status !== "Needs review",
    receiptUpdate =
      locked &&
      doc.status === "Confirmed" &&
      ["receipt", "invoice"].includes(doc.type);
  const emptyRecipe: Recipe = {
    id: `recipe_${doc.id.replaceAll("-", "")}`,
    name: "",
    yield_units: 1,
    batch_scaling: "whole_batches",
    version: 1,
    ingredients: [],
    variable_labor_cents_per_batch: null,
    packaging_cents_per_unit: null,
    energy_cents_per_batch: null,
    allocated_overhead_cents_per_unit: 0,
    selling_price_cents: 0,
  };
  return (
    <Modal title={`Review · ${doc.name}`} onClose={onClose}>
      <div className="document-review">
        <div className="source-preview">
          {doc.sample_url ? (
            <img
              src={doc.sample_url}
              alt={`Labeled original ${doc.name} showing source quantities`}
            />
          ) : doc.storage_key && doc.mime.startsWith("image/") ? (
            <img
              src={`/api/documents/${doc.id}`}
              alt={`Original uploaded source: ${doc.name}`}
            />
          ) : doc.storage_key && doc.mime === "application/pdf" ? (
            <>
              <iframe
                title="Private source PDF preview"
                src={`/api/documents/${doc.id}`}
              />
              <a
                href={`/api/documents/${doc.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open source PDF
              </a>
            </>
          ) : (
            <div className="manual-source">
              <FileText size={40} />
              <h3>Manual record</h3>
              <p>
                No extracted text is available. Enter confirmed source facts.
              </p>
            </div>
          )}
          <Badge>
            {doc.mode === "sample"
              ? "Bundled sample extraction"
              : doc.mode === "csv"
                ? "Validated CSV"
                : doc.mode === "local_ocr"
                  ? "Text read on this Mac"
                  : "Manual review · no extraction"}
          </Badge>
          <p className="caption">{doc.notes}</p>
          {doc.storage_key &&
            [
              "image/png",
              "image/jpeg",
              "image/webp",
              "application/pdf",
            ].includes(doc.mime) && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={reading}
                  onClick={async () => {
                    setReading(true);
                    setReadError("");
                    try {
                      const res = await fetch(`/api/documents/${doc.id}/read`, {
                          method: "POST",
                        }),
                        data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setPayload(data);
                    } catch (e) {
                      setReadError((e as Error).message);
                    } finally {
                      setReading(false);
                    }
                  }}
                >
                  {reading
                    ? "Reading locally…"
                    : doc.recognized_text
                      ? "Read source again"
                      : "Read text on this computer"}
                </Button>
                <p className="caption">
                  Local Apple Vision / PDF text reading, when installed. No
                  external AI receives the file. Check the text, then confirm
                  fields on the right.
                </p>
              </>
            )}
          {readError && <Note tone="danger">{readError}</Note>}
          {doc.recognized_text && (
            <Field
              label="Recognized source text"
              hint="OCR may misread handwriting, numbers or units. Compare with the original."
            >
              <textarea
                className="recognized-text"
                rows={12}
                readOnly
                value={doc.recognized_text}
              />
            </Field>
          )}

          <small className="hash-label">
            Source hash: {doc.hash.slice(0, 20)}…
          </small>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutate({
                type: "review_document",
                document: {
                  ...draft,
                  notes: doc.mode === "local_ocr" ? doc.notes : draft.notes,
                  recipe:
                    draft.type === "recipe"
                      ? (draft.recipe ?? emptyRecipe)
                      : undefined,
                },
              })
            )
              onClose();
          }}
        >
          <fieldset disabled={locked && !receiptUpdate}>
            <Field label="Document type">
              <select
                disabled={locked}
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as DocumentRecord["type"],
                    recipe:
                      e.target.value === "recipe"
                        ? (draft.recipe ?? emptyRecipe)
                        : draft.recipe,
                  })
                }
              >
                <option value="manual">Choose a type…</option>
                <option value="recipe">Recipe</option>
                <option value="invoice">Invoice</option>
                <option value="receipt">Receipt</option>
                <option value="statement">Payment statement</option>
              </select>
            </Field>
            {draft.type === "recipe" && (
              <fieldset disabled={locked}>
                <RecipeFields
                  recipe={draft.recipe ?? emptyRecipe}
                  onChange={(r) => setDraft({ ...draft, recipe: r })}
                />
              </fieldset>
            )}
            {(draft.type === "receipt" || draft.type === "invoice") && (
              <>
                <Field
                  label="Underlying purchase reference"
                  hint="Use the same reference for receipt, invoice and payment evidence."
                >
                  <input
                    disabled={locked}
                    required
                    value={draft.external_id}
                    onChange={(e) =>
                      setDraft({ ...draft, external_id: e.target.value })
                    }
                  />
                </Field>
                <Field label="Supplier">
                  <select
                    disabled={locked}
                    value={draft.supplier_id}
                    onChange={(e) =>
                      setDraft({ ...draft, supplier_id: e.target.value })
                    }
                  >
                    <option value="unassigned">Choose a supplier…</option>
                    {s.suppliers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {!s.suppliers.length && (
                  <Note>
                    Add a supplier in Ingredient market before confirming this
                    purchase. Your upload is saved; you can return to it here.
                  </Note>
                )}
                <fieldset disabled={locked}>
                  {draft.lines.map((l, index) => (
                    <div className="receipt-line" key={index}>
                      <Field label="Confirmed ingredient">
                        <select
                          value={l.ingredient_id}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              lines: draft.lines.map((x, j) =>
                                index === j
                                  ? { ...x, ingredient_id: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          {s.ingredients.map((i) => (
                            <option value={i.id} key={i.id}>
                              {i.name} ({i.base_unit})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="form-grid">
                        <Field
                          label={`Quantity (${s.ingredients.find((i) => i.id === l.ingredient_id)?.base_unit})`}
                        >
                          <input
                            type="number"
                            required
                            min="1"
                            step="1"
                            value={l.quantity_base}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                lines: draft.lines.map((x, j) =>
                                  index === j
                                    ? { ...x, quantity_base: +e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Line total ($)">
                          <input
                            required
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.line_total_cents / 100}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                lines: draft.lines.map((x, j) =>
                                  index === j
                                    ? {
                                        ...x,
                                        line_total_cents: Math.round(
                                          +e.target.value * 100,
                                        ),
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.filter((_, j) => j !== index),
                          })
                        }
                      >
                        Remove line
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        lines: [
                          ...draft.lines,
                          {
                            ingredient_id: "flour",
                            quantity_base: 1,
                            line_total_cents: 0,
                          },
                        ],
                      })
                    }
                  >
                    Add reviewed item
                  </Button>
                </fieldset>
                <p>
                  <strong>
                    Reviewed total:{" "}
                    {money(
                      draft.lines.reduce((n, l) => n + l.line_total_cents, 0),
                    )}
                  </strong>
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    disabled={locked && doc.paid}
                    checked={draft.paid}
                    onChange={(e) =>
                      setDraft({ ...draft, paid: e.target.checked })
                    }
                  />
                  Payment already made
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    disabled={locked && doc.received}
                    checked={draft.received}
                    onChange={(e) =>
                      setDraft({ ...draft, received: e.target.checked })
                    }
                  />
                  Goods physically received
                </label>
                <Note>
                  Payment and receipt are separate. A paid, undelivered purchase
                  never becomes available stock. Reusing this purchase reference
                  prevents double posting.
                </Note>
              </>
            )}
            {draft.type === "statement" && (
              <>
                <Note>
                  Statements are payment evidence. They cannot reveal ingredient
                  quantities or create stock.
                </Note>
                <Field label="Match to a confirmed purchase">
                  <select
                    required
                    value={draft.linked_purchase ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, linked_purchase: e.target.value })
                    }
                  >
                    <option value="">Select a receipt…</option>
                    {s.documents
                      .filter(
                        (d) =>
                          ["receipt", "invoice"].includes(d.type) &&
                          d.status === "Confirmed",
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ·{" "}
                          {money(
                            d.lines.reduce((n, l) => n + l.line_total_cents, 0),
                          )}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
          </fieldset>
          {locked && !receiptUpdate ? (
            <Badge tone="good">
              {doc.status} · source linked to persistent records
            </Badge>
          ) : (
            <div className="modal-actions">
              <Button disabled={busy || draft.type === "manual"}>
                {receiptUpdate
                  ? "Update payment / receipt status"
                  : "Confirm reviewed record"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
}
function CsvReview({
  doc,
  onClose,
}: {
  doc: DocumentRecord;
  onClose: () => void;
}) {
  const { state: s, setPayload, setNotice } = useApp(),
    [kind, setKind] = useState<ImportKind>("purchases"),
    [preview, setPreview] = useState<CsvPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(commit: boolean) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            document_id: doc.id,
            commit,
            revision: s.revision,
          }),
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (commit) {
        setPayload(data);
        setNotice("Validated CSV rows committed once");
        onClose();
      } else setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Validate CSV · ${doc.name}`} onClose={onClose}>
      <Field label="Import template">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ImportKind);
            setPreview(null);
          }}
        >
          <option value="quotes">Supplier price lists</option>
          <option value="purchases">Purchases</option>
          <option value="recipes">Recipes</option>
          <option value="production">Production</option>
        </select>
      </Field>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void run(false)}
      >
        Validate & preview rows
      </Button>
      {error && <Note tone="danger">{error}</Note>}
      {preview && (
        <>
          <p>
            {preview.rows.length} rows · {preview.errors.length} errors
          </p>
          {preview.errors.map((e, i) => (
            <Note key={i} tone="warn">
              Row {e.row}: {e.message}
            </Note>
          ))}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {Object.keys(preview.rows[0] ?? {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <Button
              disabled={busy || preview.errors.length > 0}
              onClick={() => void run(true)}
            >
              Confirm & commit {preview.rows.length} rows
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
function ResetDialog({ onClose }: { onClose: () => void }) {
  const { state: s, setPayload, setNotice } = useApp(),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal title="Reset this demo workspace?" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await fetch("/api/state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "workspace",
                  kind: s.kind,
                  reset: true,
                  confirmation,
                }),
              }),
              data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPayload(data);
            setNotice("Current demo workspace reset");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <p>
          This resets edits and transactions in <strong>{s.name}</strong>. Your
          other workspaces are preserved. Export your records first if you want
          to keep them.
        </p>
        <Field label="Type RESET to confirm">
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
        {error && <Note tone="danger">{error}</Note>}
        <div className="modal-actions">
          <Button variant="danger" disabled={confirmation !== "RESET"}>
            Reset current workspace
          </Button>
        </div>
      </form>
    </Modal>
  );
}
