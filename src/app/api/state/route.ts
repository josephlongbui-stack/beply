import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest } from "next/server";
import { repository } from "../../../server/repository";
import {
  session,
  response,
  errorResponse,
  checkOrigin,
} from "../../../server/http";
import { applyAction } from "../../../domain/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    const auth = await session(true);
    return response(repository().read(auth.id, auth.workspace));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    const auth = await session(),
      body = await req.json();
    if (body.type === "activate_workspace")
      return response(repository().activate(auth.id, String(body.id)));
    if (body.type === "workspace") {
      if (!["sample", "guided", "owner"].includes(body.kind))
        throw new Error("Unknown workspace kind");
      if (body.reset && body.confirmation !== "RESET")
        throw new Error("Reset needs explicit confirmation");
      return response(
        repository().switch(auth.id, body.kind, body.reset === true),
      );
    }
    return response(
      repository().mutate(
        auth.id,
        auth.workspace,
        (s) => applyAction(s, body.action),
        body.revision,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
