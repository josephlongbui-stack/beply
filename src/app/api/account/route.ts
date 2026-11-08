import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { repository, hashToken } from "../../../server/repository";
import {
  session,
  setSessionCookie,
  checkOrigin,
  errorResponse,
} from "../../../server/http";
import { accountFor, register, login } from "../../../server/accounts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    const auth = await session(true);
    return NextResponse.json(
      { account: accountFor(repository(), auth.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length") ?? 0) > 4096)
      throw new Error("Request too large");
    const body = await req.json(),
      db = repository();
    if (body.action === "logout") {
      const jar = await cookies(),
        token = jar.get("pe_session")?.value;
      if (token)
        db.db
          .prepare("DELETE FROM account_sessions WHERE token_hash=?")
          .run(hashToken(token));
      jar.delete("pe_session");
      return NextResponse.json({ ok: true });
    }
    let token: string;
    if (body.action === "register") {
      const auth = await session();
      token = await register(db, auth.id, body);
    } else if (body.action === "login") token = await login(db, body);
    else throw new Error("Unknown account action");
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
