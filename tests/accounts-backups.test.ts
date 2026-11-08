import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Repository, hashToken } from "../src/server/repository";
import { register, login, accountFor } from "../src/server/accounts";
import {
  createBackup,
  validateBackup,
  restoreBackup,
} from "../src/server/backups";
import { seedState } from "../src/domain/seed";
import { applyAction } from "../src/domain/service";
import { optimize } from "../src/domain/engine";
describe("private accounts and recoverable records", () => {
  it("claims guest records, rotates the token, and recovers only the account's own records", async () => {
    const db = new Repository(":memory:"),
      guest = db.createSession(),
      other = db.createSession();
    db.mutate(guest.session, guest.workspace, (s) => ({
      ...s,
      name: "My café",
    }));
    const token = await register(db, guest.session, {
      username: "cafe_owner",
      password: "a-long-test-password",
    });
    expect(db.session(guest.token)).toBeNull();
    expect(db.session(token)?.id).toBe(guest.session);
    expect(accountFor(db, guest.session)?.username).toBe("cafe_owner");
    expect(
      db.db.prepare("SELECT password_hash FROM accounts").get()?.password_hash,
    ).not.toContain("a-long-test-password");
    db.db
      .prepare("DELETE FROM account_sessions WHERE token_hash=?")
      .run(hashToken(token));
    expect(db.session(token)).toBeNull();
    await expect(
      login(db, { username: "cafe_owner", password: "wrong-test-password" }),
    ).rejects.toThrow(/incorrect/);
    const returned = await login(db, {
      username: "cafe_owner",
      password: "a-long-test-password",
    });
    expect(db.read(db.session(returned)!.id, guest.workspace).name).toBe(
      "My café",
    );
    expect(() => db.read(other.session, guest.workspace)).toThrow(/denied/);
    expect(() => db.activate(other.session, guest.workspace)).toThrow(/denied/);
    db.db.close();
  });
  it("enforces server-side expiry and throttles repeated invalid sign-ins", async () => {
    const db = new Repository(":memory:"),
      guest = db.createSession();
    const token = await register(db, guest.session, {
      username: "locked",
      password: "correct-long-password",
    });
    db.db.prepare("UPDATE account_sessions SET expires_at=0").run();
    expect(db.session(token)).toBeNull();
    for (let i = 0; i < 5; i++)
      await expect(
        login(db, { username: "locked", password: "incorrect-password" }),
      ).rejects.toThrow(/incorrect/);
    await expect(
      login(db, { username: "locked", password: "correct-long-password" }),
    ).rejects.toThrow(/15 minutes/);
    db.db.close();
  });
  it("restores records and exact source bytes into a separate private workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "beply-backup-")),
      db = new Repository(":memory:"),
      guest = db.createSession();
    try {
      const s = seedState(guest.workspace),
        bytes = Buffer.from("source document bytes"),
        key = "source.bin";
      mkdirSync(join(root, "uploads", s.id), { recursive: true });
      writeFileSync(join(root, "uploads", s.id, key), bytes);
      s.documents.push({
        id: "doc",
        name: "Source",
        hash: createHash("sha256").update(bytes).digest("hex"),
        mime: "text/csv",
        type: "manual",
        mode: "csv",
        status: "Needs review",
        storage_key: key,
        lines: [],
        external_id: "source",
        paid: false,
        received: false,
        supplier_id: "unassigned",
        created_at: s.clock,
        notes: "Original source",
      });
      db.mutate(guest.session, guest.workspace, () => s);
      const backup = createBackup(s, root);
      expect(validateBackup(backup).files.get(key)).toEqual(bytes);
      const restored = restoreBackup(db, guest.session, backup, root);
      expect(restored.id).not.toBe(s.id);
      expect(restored.inventory).toEqual(s.inventory);
      expect(readFileSync(join(root, "uploads", restored.id, key))).toEqual(
        bytes,
      );
      expect(db.read(guest.session, s.id).name).toBe(s.name);
      expect(optimize(restored).total_cost_cents).toBe(7780);
      expect(db.list(guest.session)).toHaveLength(2);
    } finally {
      db.db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects damaged files, traversal paths, duplicate events and invalid quantities before restoring", () => {
    const root = mkdtempSync(join(tmpdir(), "beply-backup-bad-"));
    try {
      const raw = JSON.parse(createBackup(seedState(), root));
      const rehash = (x: typeof raw) => {
        x.checksum = createHash("sha256")
          .update(JSON.stringify(x.payload))
          .digest("hex");
        return JSON.stringify(x);
      };
      const damaged = structuredClone(raw);
      damaged.payload.state.name = "tampered";
      expect(() => validateBackup(JSON.stringify(damaged))).toThrow(/checksum/);
      const traversal = structuredClone(raw);
      traversal.payload.files = [{ key: "../../secret.bin", base64: "AA==" }];
      expect(() => validateBackup(rehash(traversal))).toThrow();
      const dup = structuredClone(raw);
      dup.payload.state.inventory.push(dup.payload.state.inventory[0]);
      expect(() => validateBackup(rehash(dup))).toThrow(/Duplicate/);
      const invalid = structuredClone(raw);
      invalid.payload.state.ingredients[0].max_storage_base = -1;
      expect(() => validateBackup(rehash(invalid))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("creates automatic snapshots after real commits and retains the five newest valid backups", () => {
    const root = mkdtempSync(join(tmpdir(), "beply-auto-")),
      db = new Repository(join(root, "db.sqlite"));
    try {
      const auth = db.createSession();
      for (let i = 0; i < 7; i++)
        db.mutate(auth.session, auth.workspace, (s) =>
          applyAction(s, {
            type: "settings",
            settings: { ...s.settings, budget_cents: i * 100 },
          }),
        );
      const dir = join(root, "backups", auth.workspace),
        files = readdirSync(dir).filter((n) => n.endsWith(".json"));
      expect(files).toHaveLength(5);
      for (const name of files)
        expect(
          validateBackup(readFileSync(join(dir, name), "utf8")).state.id,
        ).toBe(auth.workspace);
      expect(
        db.db
          .prepare("SELECT last_error FROM backup_status WHERE workspace_id=?")
          .get(auth.workspace)?.last_error,
      ).toBeNull();
    } finally {
      db.db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
