"use client";
import {
  ArrowRight,
  Clock3,
  ShoppingBasket,
  Leaf,
  ArrowUpRight,
  Check,
  ClipboardCheck,
} from "lucide-react";
import {
  useApp,
  useT,
  PageHeading,
  Button,
  Card,
  Metric,
  Badge,
  ActionRow,
  money,
  qty,
  shortRecipe,
  Note,
} from "./ui";
import { locationLabel } from "../domain/location";
import StartHere from "./StartHere";
import { stockConfidence } from "../domain/engine";
export default function Today() {
  const { state: s, derived: d, setView, setPlanTab } = useApp(),
    t = useT(),
    p = d.plan;
  const active = s.orders.findLast(
    (o) =>
      o.status !== "Cancelled" &&
      o.status !== "Draft" &&
      o.input_snapshot?.production.id === s.production.id,
  );
  const total = active?.plan.total_cost_cents ?? p.total_cost_cents;
  const needCount = Object.values(p.shortfalls).filter((n) => n > 0).length;
  const difference = active
    ? active.baseline
      ? Math.max(
          0,
          active.baseline.total_cost_cents - active.plan.total_cost_cents,
        )
      : null
    : d.oneStore.status === "feasible"
      ? Math.max(0, d.oneStore.total_cost_cents - p.total_cost_cents)
      : null;
  const openPlan = () => {
    setPlanTab("plan");
    setView("plan");
  };
  if (
    s.kind === "owner" &&
    (!s.recipes.length || !s.production.items.some((i) => i.planned_units > 0))
  )
    return <StartHere />;
  return (
    <>
      <PageHeading
        eyebrow={`${new Intl.DateTimeFormat("en-US", { timeZone: s.timezone, weekday: "long", month: "long", day: "numeric" }).format(new Date(s.clock)).toUpperCase()} · SIMULATED DAY`}
        title={
          s.settings.locale === "vi"
            ? "Một ngày làm bánh thuận lợi."
            : "A little planning. A better bake."
        }
        description="You focus on the food. We handle the numbers."
        action={
          <button className="text-button" onClick={() => setView("documents")}>
            How this demo works <ArrowUpRight size={16} />
          </button>
        }
      />
      <section className="today-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="live-dot" /> YOUR NEXT DECISION
          </div>
          <h2>
            {s.production.status === "completed"
              ? "The next batch is ready."
              : "Ready for tonight’s prep?"}
          </h2>
          <p>
            {s.production.status === "completed" ? (
              "Production is recorded. Your ingredient ledger and finished goods are up to date."
            ) : s.production.items.length ? (
              <>
                You’re planning{" "}
                {s.production.items.map((i) => (
                  <strong key={i.recipe_id}>
                    {i.planned_units}{" "}
                    {s.recipes.find((r) => r.id === i.recipe_id)?.name ??
                      i.recipe_id}
                    {i !== s.production.items.at(-1) ? " and " : ""}
                  </strong>
                ))}
                .<br />
                {needCount
                  ? `${needCount} ingredients need topping up before preparation.`
                  : "Your planned supply is covered. Confirm physical receipt before baking."}
              </>
            ) : (
              "Start with your recipes and a physical stock count. Your first shopping plan will follow."
            )}
          </p>
          <div className="hero-tags">
            <span>
              <Clock3 size={15} /> Prep ·{" "}
              {new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: s.timezone,
              }).format(new Date(s.production.prep_starts_at))}
            </span>
            <span>
              <Leaf size={15} /> Whole-batch recipes
            </span>
          </div>
          <Button
            onClick={
              s.production.items.length ? openPlan : () => setView("documents")
            }
          >
            {s.production.items.length ? t.build : "Set up your business"}
            <ArrowRight size={17} />
          </Button>
        </div>
        <div className="hero-summary">
          <div>
            <ShoppingBasket size={21} />
            <span>{active ? active.status : "Recommended shopping plan"}</span>
          </div>
          <strong className="hero-amount">
            {!active && p.status === "no_supply_feasible_plan"
              ? "Needs quotes"
              : money(total)}
          </strong>
          <p>
            {active?.plan.supplier_ids.length ?? p.supplier_ids.length} stores ·
            goods + estimated trip costs
          </p>
          <div className="hero-line" />
          <div className="hero-saving">
            <span>
              {p.status === "budget_infeasible"
                ? "Funding gap"
                : difference !== null
                  ? "Estimated difference vs one store"
                  : "Plan status"}
            </span>
            <strong>
              {p.status === "budget_infeasible"
                ? money(p.funding_gap_cents)
                : difference !== null
                  ? money(difference)
                  : "Review needed"}
            </strong>
          </div>
          <small>
            {p.status === "budget_infeasible"
              ? "Protected reserve stays untouched."
              : "Lowest calculated cost among compared eligible offers."}
          </small>
        </div>
      </section>
      <div className="metrics-grid">
        <Metric
          label={t.money}
          value={money(p.cash_available_cents)}
          detail={`${money(s.settings.cash_reserve_cents)} reserve protected`}
        />
        <Metric
          label="Ingredients to buy"
          value={
            <>
              {needCount}
              <span className="metric-unit"> / {s.ingredients.length}</span>
            </>
          }
          detail="After stock and confirmed incoming"
        />
        <Metric
          label="Current shopping plan"
          value={
            !active && p.status === "no_supply_feasible_plan"
              ? "Needs quotes"
              : money(total)
          }
          detail={active ? active.status : "Includes estimated travel cash"}
        />
        <Metric
          label="Purchasing power"
          value={
            <>
              {d.purchasingPower.partial
                ? "—"
                : d.purchasingPower.equivalents.toFixed(2)}
              <span className="metric-unit"> baskets</span>
            </>
          }
          detail="Same fixed ingredient basket"
        />
      </div>
      {s.kind === "guided" && (
        <Note>
          Guided workspace starts empty. Review both sample recipes, confirm
          starting counts, then enter production in Purchase plan. Your sample
          business stays separate.
        </Note>
      )}
      <div className="two-column">
        <Card>
          <div className="section-head">
            <div>
              <div className="eyebrow">KEEP THINGS MOVING</div>
              <h2>Next on your list</h2>
            </div>
            <Badge>
              {s.documents.filter((d) => d.status === "Needs review").length} to
              review
            </Badge>
          </div>
          <ActionRow
            title="Review your source records"
            detail="Recipe photos, receipts and CSVs stay linked to the ledger."
            onClick={() => setView("documents")}
            done={s.documents.some((d) => d.status === "Confirmed")}
          />
          <ActionRow
            title={
              needCount
                ? "Check tonight’s ingredient needs"
                : "Check your available ingredients"
            }
            detail="Opening counts are owner-confirmed sample observations."
            onClick={() => setView("stock")}
          />
          <ActionRow
            title={
              active
                ? "Confirm what arrived"
                : "Review and approve a shopping plan"
            }
            detail={
              active
                ? "Receipt updates stock. Approval and payment do not."
                : "Compare packages and stores before you commit."
            }
            onClick={() => {
              setPlanTab(active ? "shopping" : "plan");
              setView("plan");
            }}
            done={!!active}
          />
        </Card>
        <Card>
          <div className="section-head">
            <div>
              <div className="eyebrow">BEFORE THE OVENS GO ON</div>
              <h2>Ingredient readiness</h2>
            </div>
            <ClipboardCheck size={21} className="muted" />
          </div>
          <div className="readiness-list">
            {s.ingredients.map((i) => (
              <div key={i.id}>
                <div>
                  <span className="ingredient-initial">{i.name.charAt(0)}</span>
                  <span>
                    <strong>
                      {s.settings.locale === "vi" ? i.name_vi : i.name}
                    </strong>
                    <small>
                      {qty(p.stock[i.id], i)} on hand ·{" "}
                      {stockConfidence(s, i.id).toLowerCase()}
                    </small>
                  </span>
                </div>
                <Badge tone={p.shortfalls[i.id] > 0 ? "warn" : "good"}>
                  {p.shortfalls[i.id] > 0 ? (
                    `Need ${qty(p.shortfalls[i.id], i)}`
                  ) : (
                    <>
                      <Check size={12} /> Covered
                    </>
                  )}
                </Badge>
              </div>
            ))}
          </div>
          <button className="card-link" onClick={() => setView("stock")}>
            Open stock ledger <ArrowRight size={16} />
          </button>
        </Card>
      </div>
      <div className="bottom-insight">
        <span className="insight-icon">
          <ChartIcon />
        </span>
        <div>
          <h3>A familiar basket, a clearer view of costs.</h3>
          <p>
            {d.purchasingPower.partial
              ? "Add current local quotes for the ingredients in your fixed basket to calculate a complete basket and purchasing-power comparison."
              : `Your fixed ingredient basket costs ${money(d.purchasingPower.currentCost)}. Index ${d.purchasingPower.index.toFixed(1)} against its first observations. ${d.purchasingPower.basis}. This compares your own basket over time.`}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setView("market")}>
          View ingredient prices <ArrowUpRight size={16} />
        </Button>
      </div>
      <div className="quiet-meta">
        {s.production.items.map((i) => (
          <span key={i.recipe_id}>
            {shortRecipe(
              s.recipes.find((r) => r.id === i.recipe_id)?.name ?? i.recipe_id,
            )}
          </span>
        ))}
        <span>
          {locationLabel(s.location)} · {s.timezone} ·{" "}
          {s.clock_mode === "live"
            ? "current planning time"
            : "fixed demo clock"}
        </span>
      </div>
    </>
  );
}
function ChartIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4v16h16M7 15l4-5 4 2 5-7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
