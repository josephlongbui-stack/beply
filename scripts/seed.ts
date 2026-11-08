import { Repository, dataDir } from "../src/server/repository";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
if (process.argv.includes("--reset")) {
  if (!process.argv.includes("--yes")) {
    console.error(
      "This removes all local demo workspaces. Stop the app, then run: npm run reset -- --yes. The in-app Reset affects only the current workspace.",
    );
    process.exit(1);
  }
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
}
const db = new Repository();
db.db.close();
console.log(
  `SQLite schema ready: ${join(dataDir, "pocket-economist.sqlite")}. Sample records are seeded separately for each browser session on first visit.`,
);
