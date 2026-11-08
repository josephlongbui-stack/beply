import { cloudEnabled, cloudRequest } from "../../../server/cloud/dispatch";
import { NextRequest } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { repository, dataDir } from "../../../server/repository";
import {
  session,
  response,
  errorResponse,
  checkOrigin,
} from "../../../server/http";
import { contentHash } from "../../../domain/service";
import { sampleExtraction } from "../../../server/providers";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (cloudEnabled()) return cloudRequest(req);
  try {
    checkOrigin(req);
    const auth = await session();
    if (Number(req.headers.get("content-length") ?? 0) > 9 * 1024 * 1024)
      throw new Error("Upload limit is 8 MB");
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new Error("Select a file");
    if (file.size > 8 * 1024 * 1024 || file.size === 0)
      throw new Error("Use a nonempty file up to 8 MB");
    const bytes = Buffer.from(await file.arrayBuffer()),
      hash = contentHash(bytes),
      db = repository(),
      state = db.read(auth.id, auth.workspace);
    const existing = state.documents.find((d) => d.hash === hash);
    if (existing) {
      const result = response(state);
      result.headers.set("X-Document-Id", existing.id);
      return result;
    }
    const sample = sampleExtraction.extract(bytes, state);
    const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      pdf = bytes.subarray(0, 5).toString() === "%PDF-",
      webp =
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP";
    const csv = /\.csv$/i.test(file.name) && !bytes.includes(0);
    if (!sample && !png && !jpg && !webp && !pdf && !csv)
      throw new Error(
        "Supported files: PNG, JPEG, WebP, PDF, CSV, or an exact bundled sample image. Unknown files are never extracted automatically.",
      );
    const id = randomUUID(),
      mime = sample
        ? "image/svg+xml"
        : png
          ? "image/png"
          : jpg
            ? "image/jpeg"
            : webp
              ? "image/webp"
              : pdf
                ? "application/pdf"
                : "text/csv";
    const storageKey = `${id}.bin`,
      directory = join(dataDir, "uploads", auth.workspace);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, storageKey), bytes, { mode: 0o600 });
    const kind = form.get("kind");
    const result = response(
      db.mutate(auth.id, auth.workspace, (s) => {
        if (s.documents.some((d) => d.hash === hash)) return s;
        s.documents.unshift({
          name: basename(file.name)
            .replace(/[^\p{L}\p{N} ._-]/gu, "_")
            .slice(0, 140),
          mime,
          type:
            kind === "recipe" ||
            kind === "receipt" ||
            kind === "invoice" ||
            kind === "statement"
              ? kind
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
            ? "CSV uploaded. Select an import template, validate every row, then commit."
            : "No extraction provider is configured. Nothing has been read automatically. Review the preview and enter the fields manually.",
          ...sample,
          id,
          hash,
          storage_key: storageKey,
        });
        s.revision++;
        return s;
      }),
    );
    result.headers.set("X-Document-Id", id);
    return result;
  } catch (e) {
    return errorResponse(e);
  }
}
