import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { session, errorResponse } from "../../../server/http";
import { repository } from "../../../server/repository";
import { optimize, stockOf } from "../../../domain/engine";
import { safeCsv } from "../../../domain/imports";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    const auth = await session(),
      s = repository().read(auth.id, auth.workspace),
      kind = req.nextUrl.searchParams.get("kind");
    if (kind === "json")
      return NextResponse.json(s, {
        headers: {
          "Content-Disposition": "attachment; filename=beply-workspace.json",
          "Cache-Control": "no-store",
        },
      });
    let rows: unknown[][];
    if (kind === "inventory") {
      const stock = stockOf(s);
      rows = [
        ["Ingredient", "On hand (base units)", "Base unit", "Source"],
        ...s.ingredients.map((i) => [
          i.name,
          stock[i.id],
          i.base_unit,
          "Private workspace ledger",
        ]),
      ];
    } else {
      const order = s.orders.find(
          (o) => o.id === req.nextUrl.searchParams.get("order"),
        ),
        plan = order?.plan ?? optimize(s);
      rows = [
        [
          "Supplier",
          "Ingredient",
          "Packs",
          "Quantity base",
          "Unit",
          "Goods USD",
          "Needed by",
          "Status",
        ],
        ...plan.lines.map((l) => [
          s.suppliers.find((p) => p.id === l.supplier_id)?.name,
          s.ingredients.find((i) => i.id === l.ingredient_id)?.name,
          l.packs,
          l.quantity_base,
          s.ingredients.find((i) => i.id === l.ingredient_id)?.base_unit,
          (l.line_cost_cents / 100).toFixed(2),
          order?.input_snapshot?.production.prep_starts_at ??
            s.production.prep_starts_at,
          order?.status ?? "Draft",
        ]),
        [
          "TOTAL GOODS",
          "",
          "",
          "",
          "",
          (plan.goods_cost_cents / 100).toFixed(2),
        ],
        [
          "ESTIMATED TRIP CASH",
          "",
          "",
          "",
          "",
          (plan.estimated_trip_cost_cents / 100).toFixed(2),
        ],
        ["SHIPPING", "", "", "", "", (plan.shipping_cents / 100).toFixed(2)],
        [
          "TOTAL CASH",
          "",
          "",
          "",
          "",
          (plan.total_cost_cents / 100).toFixed(2),
        ],
      ];
    }
    return new NextResponse(safeCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=beply-${kind ?? "shopping"}.csv`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
