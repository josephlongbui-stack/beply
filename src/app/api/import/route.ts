import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repository, dataDir } from "../../../server/repository";
import {
  session,
  response,
  errorResponse,
  checkOrigin,
} from "../../../server/http";
import {
  previewCsv,
  commitCsv,
  type ImportKind,
} from "../../../domain/imports";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    const auth = await session(),
      body = await req.json(),
      state = repository().read(auth.id, auth.workspace);
    if (!["recipes", "purchases", "production", "quotes"].includes(body.kind))
      throw new Error("Choose an import type");
    const doc = state.documents.find(
      (d) => d.id === body.document_id && d.mime === "text/csv",
    );
    if (!doc?.storage_key) throw new Error("CSV document not found");
    const text = readFileSync(
        join(dataDir, "uploads", auth.workspace, doc.storage_key),
        "utf8",
      ),
      kind = body.kind as ImportKind;
    if (body.commit !== true)
      return NextResponse.json(previewCsv(state, text, kind));
    return response(
      repository().mutate(
        auth.id,
        auth.workspace,
        (s) => commitCsv(s, text, kind, doc.id),
        body.revision,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
