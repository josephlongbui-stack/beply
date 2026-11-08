import { cookies } from "next/headers";
import { CloudRepository } from "./repository";
import { database } from "./database";
import { BlobBucket, streamText } from "./bucket";
import {
  findAccount,
  loginCloud,
  createCloudAccount,
  tokenHash,
} from "./accounts";
import { receiveFile } from "./uploads";
import { applyAction, contentHash, sampleDocument } from "../../domain/service";
import { derive, optimize, stockOf } from "../../domain/engine";
import {
  previewCsv,
  commitCsv,
  safeCsv,
  type ImportKind,
} from "../../domain/imports";
import { validateBackup, digest } from "./backup-validation";
import type { State } from "../../domain/types";
import manifest from "../../../public/samples/manifest.json";
const headers = { "Cache-Control": "no-store" };
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}
function payload(s: State) {
  return json({ state: s, derived: derive(s) });
}
function error(e: unknown) {
  const message =
    e && typeof e === "object" && "code" in e
      ? "Cloud storage request failed. Please try again."
      : (e as Error).message;
  return json(
    { error: message },
    /access denied|Sign in/.test(message)
      ? 403
      : /another view|Plan changed/.test(message)
        ? 409
        : 400,
  );
}
async function archive(repo: CloudRepository, s: State) {
  const files = [];
  let bytes = 0;
  for (const d of s.documents)
    if (d.storage_key) {
      const object = await repo.bucket.get(repo.fileKey(s.id, d.storage_key));
      if (!object)
        throw new Error("A source file is missing; backup was not created.");
      bytes += object.size;
      if (bytes > 8 * 1024 * 1024)
        throw new Error(
          "Backup source files exceed the 8 MB hosted pilot limit.",
        );
      files.push({
        key: d.storage_key,
        base64: Buffer.from(await object.arrayBuffer()).toString("base64"),
      });
    }
  const data = { state: s, files };
  return JSON.stringify({
    format: "beply-workspace",
    version: 1,
    created_at: new Date().toISOString(),
    checksum: digest(data),
    payload: data,
  });
}
export async function handle(req: Request) {
  try {
    const url = new URL(req.url),
      path = url.pathname;
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host)
        throw new Error("Cross-origin writes are not allowed");
    }
    const db = database(),
      jar = await cookies(),
      token = jar.get("beply_cloud")?.value;
    const user = await findAccount(db, token);
    if (path === "/api/account") {
      if (req.method === "GET")
        return json({
          account: user ? { username: user.username } : null,
          cloud: true,
        });
      if (Number(req.headers.get("content-length") ?? 0) > 4096)
        throw new Error("Request too large.");
      const body = await req.json();
      if (body.action === "logout") {
        if (token)
          await db.query("DELETE FROM beply_sessions WHERE token_hash=$1", [
            tokenHash(token),
          ]);
        jar.delete("beply_cloud");
        return json({ ok: true });
      }
      const next =
        body.action === "register"
          ? await createCloudAccount(db, body)
          : body.action === "login"
            ? await loginCloud(db, body)
            : null;
      if (!next) throw new Error("Unknown account action");
      jar.set("beply_cloud", next, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 86400,
        secure: process.env.VERCEL === "1" || url.protocol === "https:",
      });
      return json({ ok: true });
    }
    if (!user) throw new Error("Sign in to open your private records.");
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
      throw new Error("Private cloud file storage is not configured.");
    const repo = new CloudRepository(db, new BlobBucket(), user.id);
    const state = await repo.current();
    if (path === "/api/state") {
      if (req.method === "GET") return payload(state);
      if (Number(req.headers.get("content-length") ?? 0) > 1024 * 1024)
        throw new Error("Request too large.");
      const body = (await req.json()) as {
        type?: string;
        kind: State["kind"];
        id: string;
        reset?: boolean;
        confirmation?: string;
        revision?: number;
        action: unknown;
      };
      if (body.type === "activate_workspace")
        return payload(await repo.activate(body.id));
      if (body.type === "workspace") {
        if (!["owner", "sample", "guided"].includes(body.kind))
          throw new Error("Unknown workspace kind");
        if (body.reset && body.confirmation !== "RESET")
          throw new Error("Reset needs explicit confirmation");
        return payload(await repo.switch(body.kind, body.reset === true));
      }
      return payload(
        await repo.mutate(
          state,
          (s) => applyAction(s, body.action),
          body.revision,
        ),
      );
    }
    if (path === "/api/backup") {
      if (req.method === "GET") {
        if (url.searchParams.has("status")) {
          const status = await repo.backupStatus(state.id);
          return json({ status, workspaces: await repo.list() });
        }
        return new Response(streamText(await archive(repo, state)), {
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="beply-backup-${new Date().toISOString().slice(0, 10)}.json"`,
          },
        });
      }
      if (Number(req.headers.get("content-length") ?? 0) > 17 * 1024 * 1024)
        throw new Error("Hosted backup import limit is 16 MB.");
      const form = await receiveFile(req, repo, state, "backup"),
        file = form.get("file");
      if (
        !(file instanceof File) ||
        file.size > 16 * 1024 * 1024 ||
        form.get("confirmation") !== "RESTORE COPY"
      )
        throw new Error(
          "Select a backup and confirm restoring a separate copy.",
        );
      const { state: restored, files } = validateBackup(await file.text());
      if (
        [...files.values()].reduce((n, bytes) => n + bytes.length, 0) >
          8 * 1024 * 1024 ||
        new TextEncoder().encode(JSON.stringify(restored)).length > 1500000
      )
        throw new Error(
          "This backup exceeds the hosted pilot limits: 8 MB of sources and 1.5 MB of records.",
        );
      restored.id = crypto.randomUUID();
      restored.name = `${restored.name.slice(0, 95)} · restored`;
      restored.revision++;
      restored.plan_version++;
      for (const o of restored.orders)
        if (!["Cancelled", "Received"].includes(o.status)) {
          o.stale = true;
          if (
            !o.paid &&
            !Object.values(o.received).some(Boolean) &&
            o.status !== "Simulated order submitted"
          )
            o.status = "Cancelled";
        }
      restored.audit.unshift({
        id: crypto.randomUUID(),
        event: "Workspace restored",
        detail:
          "Separate private copy created. Review purchases before acting; previous records preserved.",
        occurred_at: new Date().toISOString(),
      });
      for (const d of restored.documents)
        if (d.storage_key)
          await repo.bucket.put(
            repo.fileKey(restored.id, d.storage_key),
            new Uint8Array(files.get(d.storage_key)!),
          );
      return payload(await repo.insert(restored));
    }
    if (path === "/api/documents" && req.method === "POST") {
      if (Number(req.headers.get("content-length") ?? 0) > 9 * 1024 * 1024)
        throw new Error("Upload limit is 8 MB");
      const form = await receiveFile(req, repo, state, "document"),
        file = form.get("file");
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error("Use a nonempty file up to 8 MB");
      const bytes = Buffer.from(await file.arrayBuffer()),
        hash = contentHash(bytes),
        existing = state.documents.find((d) => d.hash === hash);
      if (existing) {
        const result = payload(state);
        result.headers.set("X-Document-Id", existing.id);
        return result;
      }
      const listed = await repo.bucket.list({
        prefix: repo.fileKey(state.id, ""),
      });
      if (
        listed.objects.length >= 100 ||
        listed.objects.reduce((n, o) => n + o.size, 0) + file.size >
          8 * 1024 * 1024
      )
        throw new Error(
          "The hosted pilot allows 100 source files and 8 MB per workspace. Export a backup before starting another workspace.",
        );
      const match = Object.entries(manifest).find(
          ([, value]) => value === hash,
        )?.[0],
        sample = match
          ? sampleDocument(
              state,
              match as "baguette" | "butter_bun" | "receipt" | "statement",
            )
          : null;
      const png = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        pdf = bytes.subarray(0, 5).toString() === "%PDF-",
        webp =
          bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP",
        csv = /\.csv$/i.test(file.name) && !bytes.includes(0);
      if (!sample && !png && !jpg && !pdf && !webp && !csv)
        throw new Error(
          "Supported files: PNG, JPEG, WebP, PDF, CSV, or an exact bundled sample image. Unknown files are never extracted automatically.",
        );
      const id = crypto.randomUUID(),
        key = `${id}.bin`,
        mime = sample
          ? "image/svg+xml"
          : png
            ? "image/png"
            : jpg
              ? "image/jpeg"
              : pdf
                ? "application/pdf"
                : webp
                  ? "image/webp"
                  : "text/csv",
        kind = form.get("kind");
      await repo.bucket.put(repo.fileKey(state.id, key), new Uint8Array(bytes));
      try {
        const next = await repo.mutate(
          state,
          (s) => {
            s.documents.unshift({
              name: file.name
                .split(/[\\/]/)
                .at(-1)!
                .replace(/[^\p{L}\p{N} ._-]/gu, "_")
                .slice(0, 140),
              mime,
              type: ["recipe", "receipt", "invoice", "statement"].includes(
                String(kind),
              )
                ? (kind as "recipe" | "receipt" | "invoice" | "statement")
                : "manual",
              mode: csv ? "csv" : "manual",
              status: "Needs review",
              lines: [],
              external_id: `upload_${id}`,
              paid: false,
              received: false,
              supplier_id: s.suppliers[0]?.id ?? "unassigned",
              created_at: s.clock,
              notes: csv
                ? "CSV saved. Select a template, validate every row, then commit."
                : "External document reading is not connected. Nothing has been analyzed automatically. Review the source and enter its fields; your explicit confirmation is required.",
              ...sample,
              id,
              hash,
              storage_key: key,
            });
            return s;
          },
          state.revision,
        );
        const result = payload(next);
        result.headers.set("X-Document-Id", id);
        return result;
      } catch (e) {
        await repo.bucket.delete(repo.fileKey(state.id, key));
        throw e;
      }
    }
    const docMatch = path.match(/^\/api\/documents\/([^/]+)(\/read)?$/);
    if (docMatch) {
      const doc = state.documents.find((d) => d.id === docMatch[1]);
      if (!doc?.storage_key)
        throw new Error("Document not found or access denied");
      if (docMatch[2]) {
        if (req.method === "GET")
          return json({ available: false, local: false });
        throw new Error(
          "No external document-reading provider is connected. Nothing was analyzed. Use reviewed entry or CSV until you connect a provider.",
        );
      }
      const file = await repo.bucket.get(
        repo.fileKey(state.id, doc.storage_key),
      );
      if (!file) throw new Error("Source file not found");
      return new Response(file.body, {
        headers: {
          ...headers,
          "Content-Type": doc.mime,
          "Content-Disposition": "inline",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    }
    if (path === "/api/import" && req.method === "POST") {
      const body = (await req.json()) as {
        kind: ImportKind;
        document_id: string;
        commit?: boolean;
        revision?: number;
      };
      if (!["recipes", "purchases", "production", "quotes"].includes(body.kind))
        throw new Error("Choose an import type");
      const doc = state.documents.find(
        (d) => d.id === body.document_id && d.mime === "text/csv",
      );
      if (!doc?.storage_key) throw new Error("CSV document not found");
      const file = await repo.bucket.get(
        repo.fileKey(state.id, doc.storage_key),
      );
      if (!file) throw new Error("Source file not found");
      const text = await file.text();
      return body.commit === true
        ? payload(
            await repo.mutate(
              state,
              (s) => commitCsv(s, text, body.kind, doc.id),
              body.revision,
            ),
          )
        : json(previewCsv(state, text, body.kind));
    }
    if (path === "/api/export" && req.method === "GET") {
      const kind = url.searchParams.get("kind");
      if (kind === "json")
        return new Response(JSON.stringify(state), {
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "Content-Disposition": "attachment; filename=beply-workspace.json",
          },
        });
      let rows: unknown[][];
      if (kind === "inventory") {
        const stock = stockOf(state);
        rows = [
          ["Ingredient", "On hand (base units)", "Base unit", "Source"],
          ...state.ingredients.map((i) => [
            i.name,
            stock[i.id],
            i.base_unit,
            "Private workspace ledger",
          ]),
        ];
      } else {
        const order = state.orders.find(
            (o) => o.id === url.searchParams.get("order"),
          ),
          plan = order?.plan ?? optimize(state);
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
            state.suppliers.find((p) => p.id === l.supplier_id)?.name,
            state.ingredients.find((i) => i.id === l.ingredient_id)?.name,
            l.packs,
            l.quantity_base,
            state.ingredients.find((i) => i.id === l.ingredient_id)?.base_unit,
            (l.line_cost_cents / 100).toFixed(2),
            order?.input_snapshot?.production.prep_starts_at ??
              state.production.prep_starts_at,
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
      return new Response(safeCsv(rows), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=beply-${kind ?? "shopping"}.csv`,
        },
      });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return error(e);
  }
}
