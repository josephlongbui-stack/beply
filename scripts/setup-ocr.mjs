import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
if (process.platform !== "darwin") {
  console.error(
    "Local OCR uses Apple Vision and requires macOS. Manual review and CSV import remain available on other hosts.",
  );
  process.exit(1);
}
const output = join(process.cwd(), ".data/tools");
mkdirSync(output, { recursive: true, mode: 0o700 });
mkdirSync(join(process.cwd(), "work/swift-cache"), { recursive: true });
const result = spawnSync(
  "/usr/bin/swiftc",
  [
    "-module-cache-path",
    join(process.cwd(), "work/swift-cache"),
    "scripts/local-ocr.swift",
    "-o",
    join(output, "beply-ocr"),
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
