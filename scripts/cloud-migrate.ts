import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { database } from "../src/server/cloud/database";
import { schemaStatements } from "../src/server/cloud/schema";

async function main() {
  const statements = schemaStatements(
    readFileSync(resolve(process.cwd(), "db/vercel.sql"), "utf8"),
  );
  await database().transaction(statements);
  console.log(
    "Applied additive beply cloud schema. Existing records preserved.",
  );
}

main().catch((error: unknown) => {
  console.error(
    "Cloud schema setup failed. Check the database connection and schema.",
  );
  if (error && typeof error === "object" && "code" in error)
    console.error(
      "Database error code:",
      String(error.code)
        .replace(/[^A-Z0-9_]/g, "")
        .slice(0, 30),
    );
  process.exitCode = 1;
});
