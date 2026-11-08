import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
const binary =
  process.env.POCKET_OCR_BINARY || join(process.cwd(), ".data/tools/beply-ocr");
export function ocrAvailable() {
  try {
    accessSync(binary, constants.X_OK);
    return process.platform === "darwin";
  } catch {
    return false;
  }
}
let reading = false;
export async function readLocalText(path: string, mime: string) {
  if (!ocrAvailable())
    throw new Error(
      "Local document reading is unavailable on this server. On macOS, run npm run setup:ocr. You can still review and enter fields manually.",
    );
  if (reading)
    throw new Error(
      "Another document is being read. Try again when it finishes.",
    );
  reading = true;
  try {
    const stdout = await new Promise<string>((resolve, reject) =>
      execFile(
        binary,
        [path, mime],
        { timeout: 60000, maxBuffer: 1024 * 1024 },
        (error, out) =>
          error
            ? reject(
                new Error(
                  "This document could not be read locally. Try a clear PNG/JPEG or an unlocked PDF of at most 10 pages; manual entry is available.",
                ),
              )
            : resolve(out),
      ),
    );
    return z
      .object({
        text: z.string().max(100000),
        pages: z.number().int().min(1).max(10),
        provider: z.string(),
      })
      .parse(JSON.parse(stdout));
  } finally {
    reading = false;
  }
}
