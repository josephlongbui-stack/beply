"use client";
import { useState } from "react";
import { useApp, Card, Button, Badge, dateTime, Note } from "./ui";
import { ProductionEditor } from "./PlanView";
export default function PrepQueue() {
  const { state: s, mutate, busy } = useApp();
  const [open, setOpen] = useState(false);
  const canActivate =
    s.production.status === "completed" ||
    !s.production.items.some((i) => i.planned_units > 0);
  return (
    <Card className="prep-queue">
      <div className="section-head">
        <div>
          <div className="eyebrow">BREAKFAST, LUNCH, OR THE NEXT EVENT</div>
          <h2>Upcoming prep</h2>
          <p>
            Save service and catering plans, then activate one cycle at a time.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!s.recipes.length}>
          Save a prep plan
        </Button>
      </div>
      {(s.production_queue ?? []).map((p) => (
        <div className="prep-row" key={p.id}>
          <div>
            <h3>{p.label}</h3>
            <p>
              Prep {dateTime(p.prep_starts_at, s.timezone)} · ready{" "}
              {dateTime(p.ready_for_sale_at, s.timezone)}
            </p>
            <small>
              {p.items
                .map(
                  (i) =>
                    `${i.planned_units} × ${s.recipes.find((r) => r.id === i.recipe_id)?.name}`,
                )
                .join(" · ")}
            </small>
          </div>
          <div className="button-row">
            <Button
              disabled={busy || !canActivate}
              onClick={() =>
                void mutate({
                  type: "activate_production",
                  production_id: p.id,
                })
              }
            >
              Activate & recalculate
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void mutate({
                  type: "remove_queued_production",
                  production_id: p.id,
                })
              }
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      {!(s.production_queue ?? []).length && (
        <p>
          No upcoming prep saved. Add your recipes first, then schedule the next
          service.
        </p>
      )}
      <Note>
        Saved plans reserve no ingredients or cash. Finish the active cycle,
        then activate the next plan to calculate purchasing from the remaining
        stock and latest recipe versions.
      </Note>
      {!!s.production_history?.length && (
        <details>
          <summary>
            Previous production plans · {s.production_history.length}
          </summary>
          {s.production_history
            .toReversed()
            .slice(0, 10)
            .map((p, index) => (
              <p key={`${p.id}-${index}`}>
                <Badge>{p.status}</Badge> {p.label ?? "Production cycle"} ·{" "}
                {dateTime(p.prep_starts_at, s.timezone)}
              </p>
            ))}
        </details>
      )}
      {open && <ProductionEditor queued onClose={() => setOpen(false)} />}
    </Card>
  );
}
