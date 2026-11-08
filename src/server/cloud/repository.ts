import type { State } from "../../domain/types";
import { seedState } from "../../domain/seed";
import { migrateLocation } from "../../domain/location";
import type { SqlDatabase } from "./database";
import type { PrivateBucket } from "./bucket";
const conflict =
  "This workspace changed in another view. Refresh and review the latest records.";
function encoded(s: State) {
  const value = JSON.stringify(s);
  if (Buffer.byteLength(value) > 1500000)
    throw new Error(
      "This workspace reached its record-size limit. Export a backup before starting another workspace.",
    );
  return value;
}
export class CloudRepository {
  constructor(
    readonly db: SqlDatabase,
    readonly bucket: PrivateBucket,
    readonly owner: string,
  ) {}
  async current() {
    let [profile] = await this.db.query(
      "SELECT active_workspace FROM beply_profiles WHERE owner_id=$1",
      [this.owner],
    );
    if (!profile) {
      const s = seedState(crypto.randomUUID(), "owner");
      await this.db.transaction([
        {
          text: "INSERT INTO beply_profiles(owner_id,active_workspace) VALUES($1,$2) ON CONFLICT DO NOTHING",
          params: [this.owner, s.id],
        },
        {
          text: "INSERT INTO beply_workspaces(id,owner_id,kind,name,revision,state_json) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS (SELECT 1 FROM beply_profiles WHERE owner_id=$2 AND active_workspace=$1) ON CONFLICT DO NOTHING",
          params: [s.id, this.owner, s.kind, s.name, s.revision, encoded(s)],
        },
      ]);
      [profile] = await this.db.query(
        "SELECT active_workspace FROM beply_profiles WHERE owner_id=$1",
        [this.owner],
      );
    }
    if (!profile)
      throw new Error("Could not initialize your private workspace.");
    return this.read(String(profile.active_workspace));
  }
  async read(id: string) {
    const [row] = await this.db.query(
      "SELECT state_json FROM beply_workspaces WHERE id=$1 AND owner_id=$2",
      [id, this.owner],
    );
    if (!row) throw new Error("Workspace not found or access denied");
    const s = migrateLocation(JSON.parse(String(row.state_json)) as State);
    if (s.kind === "owner") {
      s.clock_mode = "live";
      s.clock = new Date().toISOString();
    }
    return s;
  }
  async list() {
    return this.db.query<{ id: string; name: string; kind: string }>(
      "SELECT id,name,kind FROM beply_workspaces WHERE owner_id=$1 ORDER BY created_at,id",
      [this.owner],
    );
  }
  async activate(id: string) {
    const s = await this.read(id);
    await this.db.query(
      "UPDATE beply_profiles SET active_workspace=$1 WHERE owner_id=$2",
      [id, this.owner],
    );
    return s;
  }
  async insert(s: State) {
    await this.db.transaction([
      {
        text: "INSERT INTO beply_workspaces(id,owner_id,kind,name,revision,state_json) VALUES($1,$2,$3,$4,$5,$6)",
        params: [s.id, this.owner, s.kind, s.name, s.revision, encoded(s)],
      },
      {
        text: "UPDATE beply_profiles SET active_workspace=$1 WHERE owner_id=$2",
        params: [s.id, this.owner],
      },
    ]);
    await this.snapshot(s);
    return s;
  }
  async mutate(current: State, fn: (s: State) => State, revision?: number) {
    if (revision !== undefined && revision !== current.revision)
      throw new Error(conflict);
    const next = fn(structuredClone(current));
    if (next.id !== current.id)
      throw new Error("Workspace identity cannot change during an update.");
    next.revision = Math.max(current.revision + 1, next.revision);
    const rows = await this.db.query(
      "UPDATE beply_workspaces SET state_json=$1,revision=$2,name=$3,kind=$4 WHERE id=$5 AND owner_id=$6 AND revision=$7 RETURNING id",
      [
        encoded(next),
        next.revision,
        next.name,
        next.kind,
        current.id,
        this.owner,
        current.revision,
      ],
    );
    if (rows.length !== 1) throw new Error(conflict);
    await this.snapshot(next);
    return next;
  }
  async switch(kind: State["kind"], reset = false) {
    const current = await this.current();
    if (reset) {
      if (current.kind !== kind)
        throw new Error("Reset must target the active workspace.");
      await this.snapshot(current);
      return this.mutate(
        current,
        () => seedState(current.id, kind),
        current.revision,
      );
    }
    const existing = (await this.list()).find((w) => w.kind === kind);
    return existing
      ? this.activate(existing.id)
      : this.insert(seedState(crypto.randomUUID(), kind));
  }
  fileKey(workspace: string, key: string) {
    return `uploads/${this.owner}/${workspace}/${key}`;
  }
  async backupStatus(id: string) {
    return (
      (
        await this.db.query(
          "SELECT last_success,last_error FROM beply_backups WHERE workspace_id=$1",
          [id],
        )
      )[0] ?? null
    );
  }
  async snapshot(s: State) {
    try {
      const prefix = `backups/${this.owner}/${s.id}/`;
      await this.bucket.put(
        `${prefix}${String(s.revision).padStart(12, "0")}-${Date.now()}-${crypto.randomUUID()}.json`,
        encoded(s),
        { httpMetadata: { contentType: "application/json" } },
      );
      const old = (await this.bucket.list({ prefix })).objects
        .map((o) => o.key)
        .sort()
        .reverse()
        .slice(5);
      if (old.length) await this.bucket.delete(old);
      await this.db.query(
        "INSERT INTO beply_backups(workspace_id,last_success,last_error) VALUES($1,$2,NULL) ON CONFLICT(workspace_id) DO UPDATE SET last_success=excluded.last_success,last_error=NULL",
        [s.id, new Date().toISOString()],
      );
    } catch {
      // A failed backup must not turn a committed ledger change into a reported failure.
      await this.db
        .query(
          "INSERT INTO beply_backups(workspace_id,last_success,last_error) VALUES($1,NULL,$2) ON CONFLICT(workspace_id) DO UPDATE SET last_error=excluded.last_error",
          [
            s.id,
            "Automatic snapshot could not be saved. Download a recovery copy and retry later.",
          ],
        )
        .catch(() => {});
    }
  }
}
