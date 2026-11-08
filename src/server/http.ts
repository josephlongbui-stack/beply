import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { repository } from "./repository";
import { derive } from "../domain/engine";
import type { State } from "../domain/types";
export async function session(create = false) {
  const jar = await cookies(),
    token = jar.get("pe_session")?.value,
    db = repository();
  const found = token ? db.session(token) : null;
  if (found) return found;
  if (!create)
    throw new Error(
      "Open the application to create a local demo session first",
    );
  const next = db.createSession();
  await setSessionCookie(next.token, 90);
  return { id: next.session, workspace: next.workspace };
}
export async function setSessionCookie(token: string, days = 7) {
  (await cookies()).set("pe_session", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * days,
    secure: process.env.POCKET_SECURE_COOKIE === "true",
  });
}
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw new Error("Cross-origin writes are not allowed");
}
export function response(state: State) {
  return NextResponse.json(
    { state, derived: derive(state) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to complete request";
  return NextResponse.json(
    { error: message },
    {
      status: /access denied|session first/.test(message)
        ? 403
        : /another view|Plan changed/.test(message)
          ? 409
          : 400,
    },
  );
}
