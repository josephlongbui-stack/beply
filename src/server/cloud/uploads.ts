import { cookies } from "next/headers";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { database } from "./database";
import { findAccount, rateLimit } from "./accounts";
import { BlobBucket } from "./bucket";
import { CloudRepository } from "./repository";
import type { State } from "../../domain/types";
export async function uploadToken(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(req.url).host)
      throw new Error("Cross-origin writes are not allowed");
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, payload) => {
        const db = database(),
          user = await findAccount(
            db,
            (await cookies()).get("beply_cloud")?.value,
          );
        if (!user) throw new Error("Sign in before uploading.");
        const purpose =
          payload === "backup"
            ? "backup"
            : payload === "document"
              ? "document"
              : null;
        if (!purpose || !/^incoming\/[a-f0-9-]{36}\.bin$/.test(pathname))
          throw new Error("Invalid upload destination.");
        await rateLimit(db, `uploads:${user.id}`, 30, 3600000);
        const repo = new CloudRepository(db, new BlobBucket(), user.id),
          s = await repo.current();
        await db.query(
          "INSERT INTO beply_uploads(pathname,owner_id,workspace_id,purpose,expires_at) VALUES($1,$2,$3,$4,$5)",
          [
            pathname,
            user.id,
            s.id,
            purpose,
            new Date(Date.now() + 15 * 60000).toISOString(),
          ],
        );
        return {
          maximumSizeInBytes: (purpose === "backup" ? 16 : 8) * 1024 * 1024,
          validUntil: Date.now() + 15 * 60000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ owner: user.id, purpose }),
        };
      },
      onUploadCompleted: async () => {
        /* Facts are only posted after the authenticated finalization request. */
      },
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      {
        error:
          "Could not authorize this upload. Sign in and try again; uploads are limited to 30 per hour.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function receiveFile(
  req: Request,
  repo: CloudRepository,
  state: State,
  purpose: "document" | "backup",
) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    if (Number(req.headers.get("content-length") ?? 0) > 4 * 1024 * 1024)
      throw new Error(
        "Use the direct upload control for files larger than 4 MB.",
      );
    return req.formData();
  }
  const body = (await req.json()) as {
    pathname?: string;
    name?: string;
    kind?: string;
    confirmation?: string;
  };
  if (typeof body.pathname !== "string")
    throw new Error("Upload reference missing.");
  const [lease] = await repo.db.query(
    "SELECT pathname FROM beply_uploads WHERE pathname=$1 AND owner_id=$2 AND workspace_id=$3 AND purpose=$4 AND expires_at>now()",
    [body.pathname, repo.owner, state.id, purpose],
  );
  if (!lease)
    throw new Error("Upload expired or access denied. Upload the file again.");
  const object = await repo.bucket.get(body.pathname);
  if (!object || object.size > (purpose === "backup" ? 16 : 8) * 1024 * 1024)
    throw new Error("Uploaded file is missing or too large.");
  const bytes = await object.arrayBuffer(),
    form = new FormData();
  form.set(
    "file",
    new File([bytes], String(body.name ?? "document").slice(0, 140)),
  );
  if (body.kind) form.set("kind", body.kind);
  if (body.confirmation) form.set("confirmation", body.confirmation);
  await repo.bucket.delete(body.pathname);
  await repo.db.query(
    "DELETE FROM beply_uploads WHERE pathname=$1 AND owner_id=$2",
    [body.pathname, repo.owner],
  );
  return form;
}
