import { cloudEnabled, cloudRequest } from "../../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repository, dataDir } from "../../../../server/repository";
import { session, errorResponse } from "../../../../server/http";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    const auth = await session(),
      { id } = await params,
      state = repository().read(auth.id, auth.workspace),
      doc = state.documents.find((d) => d.id === id);
    if (!doc?.storage_key)
      throw new Error("Document not found or access denied");
    const bytes = readFileSync(
      join(dataDir, "uploads", auth.workspace, doc.storage_key),
    );
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
