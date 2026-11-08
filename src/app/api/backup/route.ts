import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { repository, dataDir } from "../../../server/repository";
import {
  session,
  checkOrigin,
  errorResponse,
  response,
} from "../../../server/http";
import { createBackup, restoreBackup } from "../../../server/backups";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    const auth = await session(),
      db = repository(),
      state = db.read(auth.id, auth.workspace);
    if (req.nextUrl.searchParams.has("status"))
      return NextResponse.json(
        {
          status:
            db.db
              .prepare(
                "SELECT last_success,last_error FROM backup_status WHERE workspace_id=?",
              )
              .get(state.id) ?? null,
          workspaces: db.list(auth.id),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    return new NextResponse(createBackup(state, dataDir), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="beply-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    const auth = await session();
    if (Number(req.headers.get("content-length") ?? 0) > 33 * 1024 * 1024)
      throw new Error("Backup limit is 32 MB.");
    const form = await req.formData(),
      file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 32 * 1024 * 1024 ||
      form.get("confirmation") !== "RESTORE COPY"
    )
      throw new Error(
        "Select a backup up to 32 MB and confirm restoring a separate copy.",
      );
    const db = repository(),
      state = restoreBackup(db, auth.id, await file.text(), dataDir);
    db.backup(state);
    return response(state);
  } catch (e) {
    return errorResponse(e);
  }
}
