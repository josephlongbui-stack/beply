import { writeAutomaticBackup } from "./backups";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { seedState } from "../domain/seed";
import type { State } from "../domain/types";
import { migrateLocation } from "../domain/location";

const collections = [
  "ingredients",
  "recipes",
  "recipe_versions",
  "suppliers",
  "offers",
  "price_history",
  "index_basket",
  "inventory",
  "expenses",
  "orders",
  "documents",
  "finished",
  "audit",
  "operation_keys",
] as const;
type Collection = (typeof collections)[number];
export const dataDir =
  process.env.POCKET_DATA_DIR || join(process.cwd(), ".data");
export class Repository {
  readonly db: DatabaseSync;
  readonly backupRoot: string | null;
  constructor(path = join(dataDir, "pocket-economist.sqlite")) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.backupRoot = path === ":memory:" ? null : dirname(path);
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, active_workspace TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), metadata TEXT NOT NULL);`);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, owner_session TEXT NOT NULL UNIQUE REFERENCES sessions(id), password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY, owner_session TEXT NOT NULL REFERENCES sessions(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS backup_status (workspace_id TEXT PRIMARY KEY, last_success TEXT, last_error TEXT);
      CREATE TABLE IF NOT EXISTS login_attempts (username TEXT PRIMARY KEY, failures INTEGER NOT NULL, started_at INTEGER NOT NULL);`);
    for (const table of collections)
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, record_id TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(workspace_id,record_id));`,
      );
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  createSession() {
    const token = randomBytes(32).toString("hex"),
      session = hashToken(token),
      workspace = randomUUID();
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO sessions VALUES (?,?)")
        .run(session, workspace);
      this.save(session, seedState(workspace, "owner"));
    });
    return { token, session, workspace };
  }
  session(token: string) {
    const session = hashToken(token);
    const accountSession = this.db
      .prepare(
        "SELECT owner_session FROM account_sessions WHERE token_hash=? AND expires_at>?",
      )
      .get(session, Date.now());
    if (accountSession) {
      const owner = accountSession.owner_session as string;
      const row = this.db
        .prepare("SELECT active_workspace FROM sessions WHERE id=?")
        .get(owner);
      return row
        ? { id: owner, workspace: row.active_workspace as string }
        : null;
    }
    if (
      this.db
        .prepare("SELECT username FROM accounts WHERE owner_session=?")
        .get(session)
    )
      return null;
    const row = this.db
      .prepare("SELECT active_workspace FROM sessions WHERE id=?")
      .get(session);
    return row
      ? { id: session, workspace: row.active_workspace as string }
      : null;
  }
  list(session: string) {
    return this.db
      .prepare("SELECT id, metadata FROM workspaces WHERE session_id=?")
      .all(session)
      .map((r) => {
        const m = JSON.parse(r.metadata as string);
        return {
          id: r.id as string,
          name: m.name as string,
          kind: m.kind as string,
        };
      });
  }
  read(session: string, workspace: string): State {
    const row = this.db
      .prepare("SELECT metadata FROM workspaces WHERE id=? AND session_id=?")
      .get(workspace, session);
    if (!row) throw new Error("Workspace not found or access denied");
    const s = JSON.parse(row.metadata as string) as State;
    for (const table of collections)
      (s as unknown as Record<Collection, unknown>)[table] = this.db
        .prepare(
          `SELECT data FROM ${table} WHERE workspace_id=? ORDER BY ordinal`,
        )
        .all(workspace)
        .map((r) => JSON.parse(r.data as string));
    if (s.kind === "owner") {
      s.clock_mode = "live";
      s.clock = new Date().toISOString();
    }
    return migrateLocation(s);
  }
  save(session: string, state: State) {
    const row = this.db
      .prepare("SELECT session_id FROM workspaces WHERE id=?")
      .get(state.id);
    if (row && row.session_id !== session)
      throw new Error("Workspace access denied");
    const metadata = { ...state } as unknown as Record<string, unknown>;
    for (const table of collections) delete metadata[table];
    this.db
      .prepare(
        "INSERT INTO workspaces(id,session_id,metadata) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata WHERE workspaces.session_id=excluded.session_id",
      )
      .run(state.id, session, JSON.stringify(metadata));
    for (const table of collections) {
      this.db
        .prepare(`DELETE FROM ${table} WHERE workspace_id=?`)
        .run(state.id);
      const stmt = this.db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?)`);
      state[table].forEach((record, index) =>
        stmt.run(
          state.id,
          recordKey(table, record, index),
          index,
          JSON.stringify(record),
        ),
      );
    }
  }
  mutate(
    session: string,
    workspace: string,
    fn: (s: State) => State,
    revision?: number,
  ) {
    const next = this.transaction(() => {
      const current = this.read(session, workspace);
      if (revision !== undefined && current.revision !== revision)
        throw new Error(
          "This workspace changed in another view. Refresh and review the latest records.",
        );
      const next = fn(current);
      this.save(session, next);
      return next;
    });
    this.backup(next);
    return next;
  }
  backup(state: State) {
    if (!this.backupRoot) return;
    try {
      writeAutomaticBackup(state, this.backupRoot);
      this.db
        .prepare(
          "INSERT INTO backup_status VALUES(?,?,NULL) ON CONFLICT(workspace_id) DO UPDATE SET last_success=excluded.last_success,last_error=NULL",
        )
        .run(state.id, new Date().toISOString());
    } catch (e) {
      this.db
        .prepare(
          "INSERT INTO backup_status VALUES(?,NULL,?) ON CONFLICT(workspace_id) DO UPDATE SET last_error=excluded.last_error",
        )
        .run(state.id, (e as Error).message);
    }
  }
  activate(session: string, workspace: string) {
    const state = this.read(session, workspace);
    this.db
      .prepare("UPDATE sessions SET active_workspace=? WHERE id=?")
      .run(workspace, session);
    return state;
  }
  switch(session: string, kind: State["kind"], reset = false) {
    return this.transaction(() => {
      const active = this.db
        .prepare("SELECT active_workspace FROM sessions WHERE id=?")
        .get(session)?.active_workspace;
      const existing = this.list(session).find((w) =>
        reset ? w.id === active && w.kind === kind : w.kind === kind,
      );
      if (reset && !existing)
        throw new Error("Reset must target the active workspace.");
      if (reset && existing) this.backup(this.read(session, existing.id));
      const id = existing?.id ?? randomUUID();
      if (!existing || reset) this.save(session, seedState(id, kind));
      this.db
        .prepare("UPDATE sessions SET active_workspace=? WHERE id=?")
        .run(id, session);
      return this.read(session, id);
    });
  }
}
function recordKey(table: Collection, record: unknown, index: number) {
  if (typeof record === "string") return record;
  const r = record as { id?: string; version?: number };
  if (table === "recipe_versions") return `${r.id}:${r.version}`;
  return r.id ?? String(index);
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
const globalDb = globalThis as unknown as { pocketRepository?: Repository };
export function repository() {
  return (globalDb.pocketRepository ??= new Repository());
}
