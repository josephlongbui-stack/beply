import {
  cloudEnabled,
  cloudRequest,
} from "../../../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { join } from "node:path";
import { repository, dataDir } from "../../../../../server/repository";
import {
  session,
  checkOrigin,
  errorResponse,
  response,
} from "../../../../../server/http";
import { ocrAvailable, readLocalText } from "../../../../../server/ocr";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  return NextResponse.json(
    { available: ocrAvailable(), local: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    const auth = await session(),
      { id } = await ctx.params,
      db = repository();
    const state = db.read(auth.id, auth.workspace),
      doc = state.documents.find((d) => d.id === id);
    if (
      !doc?.storage_key ||
      !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
        doc.mime,
      )
    )
      throw new Error(
        "Choose your uploaded image or PDF. Sample extraction and CSV imports have separate review flows.",
      );
    const result = await readLocalText(
      join(dataDir, "uploads", state.id, doc.storage_key),
      doc.mime,
    );
    return response(
      db.mutate(auth.id, auth.workspace, (s) => {
        const current = s.documents.find((d) => d.id === id);
        if (!current)
          throw new Error("Document changed while reading; reopen the source.");
        current.recognized_text = result.text;
        current.extraction_status = result.text.trim() ? "complete" : "empty";
        current.mode = "local_ocr";
        current.notes = result.text.trim()
          ? `Text read locally from ${result.pages} page(s). Check it against the source; quantities, units, suppliers and totals still need your confirmation. No inventory or cash was posted.`
          : "Local reading completed, but no readable text was found. Try a clearer source or enter fields manually. No facts were inferred.";
        s.audit.unshift({
          id: crypto.randomUUID(),
          event: "Document text read locally",
          detail: `${current.name}: ${result.pages} page(s); no fields or ledger entries automatically confirmed.`,
          occurred_at: s.clock,
        });
        s.revision++;
        return s;
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
