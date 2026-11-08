import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fixtureRecipes } from "../src/domain/seed";
import seed from "../demo/seed.json";
mkdirSync("public/samples", { recursive: true });
const manifest: Record<string, string> = {};
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
for (const id of ["baguette", "butter_bun", "receipt", "statement"]) {
  const r = fixtureRecipes.find((r) => r.id === id);
  const title = r
    ? r.name.replace(" — illustrative recipe", "")
    : id === "receipt"
      ? "Neighborhood Market — Demo"
      : "Sample payment statement";
  const lines = r
    ? [
        `Yield: ${r.yield_units} units · whole batches`,
        ...r.ingredients.map((l) => {
          const i = seed.ingredients.find((i) => i.id === l.ingredient_id)!;
          return `${i.name}: ${l.quantity_base} ${i.base_unit}`;
        }),
        "Simplified software fixture; not baking instructions.",
      ]
    : id === "receipt"
      ? [
          "Receipt: demo_flour_receipt_001",
          "24 October 2026 · 10:00 AM PT",
          "Bread flour: 5000 g",
          "Item total: $8.00",
          "Paid: cash · Goods received: yes",
          "Travel expense: $0.00 (fixture assumption)",
        ]
      : [
          "24 October 2026 · Cash record",
          "Neighborhood Market — Demo: $8.00",
          "Possible match: demo_flour_receipt_001",
          "Payment evidence only; no ingredient quantities.",
        ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="900" viewBox="0 0 840 900"><rect width="840" height="900" fill="#eeeae0"/><rect x="52" y="42" width="736" height="816" rx="8" fill="#fffdf8" stroke="#d5d0c5"/><g font-family="Arial, sans-serif" fill="#263b35"><text x="92" y="108" font-size="16" letter-spacing="3">POCKET ECONOMIST · SAMPLE DOCUMENT</text><path d="M92 142H748" stroke="#d5d0c5"/><text x="92" y="200" font-size="27" font-weight="bold">${escape(title)}</text>${lines.map((l, index) => `<text x="92" y="${265 + index * 57}" font-size="20">${escape(l)}</text>`).join("")}<text x="92" y="806" font-size="15" fill="#6b746d">Fictional demo data · Review every field before confirming</text></g></svg>`;
  writeFileSync(`public/samples/${id}.svg`, svg);
  manifest[id] = createHash("sha256").update(svg).digest("hex");
}
writeFileSync(
  "public/samples/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Generated four labeled sample document images and SHA-256 manifest from seed quantities.",
);
