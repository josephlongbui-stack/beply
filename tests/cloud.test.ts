import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { CloudRepository } from "../src/server/cloud/repository";
import {
  createCloudAccount,
  findAccount,
  loginCloud,
  tokenHash,
} from "../src/server/cloud/accounts";
import type { SqlDatabase } from "../src/server/cloud/database";
import type { PrivateBucket } from "../src/server/cloud/bucket";
import { applyAction } from "../src/domain/service";
import { optimize, stockOf, finishedOf } from "../src/domain/engine";
import { seedState } from "../src/domain/seed";
import { validateBackup, digest } from "../src/server/cloud/backup-validation";
import { receiveFile } from "../src/server/cloud/uploads";
import { streamText } from "../src/server/cloud/bucket";
import { handle } from "../src/server/cloud/api";
import { schemaStatements } from "../src/server/cloud/schema";
const cookieValues = new Map<string, string>();
let cookieOptions: Record<string, unknown> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      cookieValues.has(key) ? { value: cookieValues.get(key) } : undefined,
    set: (key: string, value: string, options: Record<string, unknown>) => {
      cookieValues.set(key, value);
      cookieOptions = options;
    },
    delete: (key: string) => cookieValues.delete(key),
  }),
}));
vi.mock("../src/server/cloud/database", () => ({ database: () => db }));
vi.mock("../src/server/cloud/bucket", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/cloud/bucket")>()),
  BlobBucket: class {
    constructor() {
      return bucket;
    }
  },
}));
const pg = new PGlite(),
  invite = "private-owner-test-code-32-characters-long";
const db: SqlDatabase = {
  query: async <T extends Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ) => (await pg.query<T>(text, params)).rows,
  transaction: async (statements) =>
    pg.transaction(async (tx) => {
      for (const s of statements) await tx.query(s.text, s.params);
    }),
};
class MemoryBucket implements PrivateBucket {
  files = new Map<string, Uint8Array>();
  fail = false;
  async get(key: string) {
    const b = this.files.get(key);
    if (!b) return null;
    const r = new Response(Buffer.from(b));
    return {
      size: b.length,
      body: r.body!,
      arrayBuffer: () => r.arrayBuffer(),
      text: () => r.text(),
    };
  }
  async put(key: string, data: string | Uint8Array) {
    if (this.fail) throw new Error("offline");
    this.files.set(
      key,
      typeof data === "string" ? new TextEncoder().encode(data) : data,
    );
  }
  async list({ prefix }: { prefix: string }) {
    return {
      objects: [...this.files]
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, b]) => ({ key, size: b.length })),
    };
  }
  async delete(keys: string | string[]) {
    for (const k of typeof keys === "string" ? [keys] : keys)
      this.files.delete(k);
  }
}
let bucket: MemoryBucket, repo: CloudRepository;
beforeAll(async () => {
  await db.transaction(schemaStatements(readFileSync("db/vercel.sql", "utf8")));
});
afterAll(() => pg.close());
it("reapplies the deployment schema without losing existing accounts", async () => {
  await db.transaction(schemaStatements(readFileSync("db/vercel.sql", "utf8")));
  expect(await db.query("SELECT id FROM beply_accounts ORDER BY id")).toEqual([
    { id: "other" },
    { id: "owner" },
  ]);
});
beforeEach(async () => {
  cookieValues.clear();
  vi.stubEnv("BEPLY_SIGNUP_CODE", invite);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-private-bucket");
  await pg.exec(
    "TRUNCATE beply_accounts,beply_sessions,beply_profiles,beply_workspaces,beply_backups,beply_rate_limits,beply_uploads,beply_invites CASCADE",
  );
  await db.query(
    "INSERT INTO beply_accounts(id,username,password_hash) VALUES('owner','owner','test'),('other','other','test')",
  );
  bucket = new MemoryBucket();
  repo = new CloudRepository(db, bucket, "owner");
});
function request(path: string, body?: unknown) {
  return new Request(
    `https://beply.example${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://beply.example",
          },
          body: JSON.stringify(body),
        },
  );
}
async function authenticate(owner = "owner") {
  const token = crypto.randomUUID();
  await db.query("INSERT INTO beply_sessions VALUES($1,$2,$3)", [
    tokenHash(token),
    owner,
    new Date(Date.now() + 60000).toISOString(),
  ]);
  cookieValues.set("beply_cloud", token);
}
describe("cloud HTTP workflow with Postgres and private object storage", () => {
  it("gates all records, rejects foreign-origin writes, and sets revocable secure cookies", async () => {
    expect((await handle(request("/api/state"))).status).toBe(403);
    const foreign = new Request("https://beply.example/api/account", {
      method: "POST",
      headers: { Origin: "https://foreign.example" },
      body: "{}",
    });
    expect((await (await handle(foreign)).json()).error).toMatch(
      /Cross-origin/,
    );
    const registered = await handle(
      request("/api/account", {
        action: "register",
        username: "private-owner",
        password: "private-test-password",
        invite,
      }),
    );
    expect(registered.status).toBe(200);
    expect(cookieOptions).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "strict",
    });
    expect(await (await handle(request("/api/account"))).json()).toMatchObject({
      account: { username: "private-owner" },
      cloud: true,
    });
    await handle(request("/api/account", { action: "logout" }));
    expect((await handle(request("/api/state"))).status).toBe(403);
  });
  it("starts empty and recalculates sample inputs through the same API with stale-write protection", async () => {
    await authenticate();
    const first = await (await handle(request("/api/state"))).json();
    expect(first.state.kind).toBe("owner");
    expect(first.state.recipes).toHaveLength(0);
    expect(first.state.offers).toHaveLength(0);
    const sample = await (
      await handle(request("/api/state", { type: "workspace", kind: "sample" }))
    ).json();
    expect(optimize(sample.state).total_cost_cents).toBe(7780);
    const action = {
      type: "production",
      ...sample.state.production,
      items: [
        { recipe_id: "baguette", planned_units: 301 },
        { recipe_id: "butter_bun", planned_units: 200 },
      ],
    };
    const saved = await handle(
      request("/api/state", { action, revision: sample.state.revision }),
    );
    expect(saved.status).toBe(200);
    expect(optimize((await saved.json()).state).total_cost_cents).not.toBe(
      7780,
    );
    expect(
      (
        await handle(
          request("/api/state", { action, revision: sample.state.revision }),
        )
      ).status,
    ).toBe(409);
  });
  it("stores arbitrary uploads for review, deduplicates them, protects sources, and restores a separate complete copy", async () => {
    await authenticate();
    const s = await repo.current();
    const bytes = readFileSync("tests/fixtures/ocr-recipe.png");
    const upload = () => {
      const form = new FormData();
      form.set(
        "file",
        new File([bytes], "my-recipe.png", { type: "image/png" }),
      );
      form.set("kind", "recipe");
      return new Request("https://beply.example/api/documents", {
        method: "POST",
        body: form,
      });
    };
    const result = await handle(upload());
    expect(result.status).toBe(200);
    const doc = (await result.json()).state.documents[0];
    expect(doc).toMatchObject({
      mode: "manual",
      status: "Needs review",
      lines: [],
    });
    expect(stockOf(await repo.current())).toEqual(stockOf(s));
    expect(
      (await (await handle(upload())).json()).state.documents,
    ).toHaveLength(1);
    expect(
      await (await handle(request(`/api/documents/${doc.id}/read`))).json(),
    ).toMatchObject({ available: false, local: false });
    const source = await handle(request(`/api/documents/${doc.id}`));
    expect(Buffer.from(await source.arrayBuffer())).toEqual(bytes);
    const backup = await (await handle(request("/api/backup"))).text();
    const form = new FormData();
    form.set("file", new File([backup], "backup.json"));
    form.set("confirmation", "RESTORE COPY");
    const restored = await handle(
      new Request("https://beply.example/api/backup", {
        method: "POST",
        body: form,
      }),
    );
    expect(restored.status).toBe(200);
    const restoredState = (await restored.json()).state;
    expect(restoredState.id).not.toBe(s.id);
    expect((await repo.read(s.id)).documents).toHaveLength(1);
    expect(
      Buffer.from(
        await (await handle(request(`/api/documents/${doc.id}`))).arrayBuffer(),
      ),
    ).toEqual(bytes);
    await authenticate("other");
    expect((await handle(request(`/api/documents/${doc.id}`))).status).toBe(
      403,
    );
  });
});
describe("Vercel Postgres repository (real local Postgres engine)", () => {
  it("creates one owner workspace under concurrent initialization and isolates accounts", async () => {
    const results = await Promise.all([repo.current(), repo.current()]);
    expect(results[0].id).toBe(results[1].id);
    expect(await repo.list()).toHaveLength(1);
    await expect(
      new CloudRepository(db, bucket, "other").read(results[0].id),
    ).rejects.toThrow(/access denied/);
    await expect(
      new CloudRepository(db, bucket, "other").activate(results[0].id),
    ).rejects.toThrow(/access denied/);
  });
  it("computes reference results and persists receipt/production/sale exactly once", async () => {
    let s = await repo.switch("sample");
    expect(optimize(s).total_cost_cents).toBe(7780);
    expect(optimize(s, { maxStops: 1 }).total_cost_cents).toBe(9330);
    const tight = structuredClone(s);
    tight.settings.budget_cents = 8500;
    expect(optimize(tight).funding_gap_cents).toBe(280);
    const original = stockOf(s);
    s = await repo.mutate(
      s,
      (x) =>
        applyAction(x, {
          type: "approve",
          plan_version: x.plan_version,
          operation_key: "approve",
        }),
      s.revision,
    );
    expect(stockOf(s)).toEqual(original);
    const action = {
      type: "receive",
      order_id: s.orders[0].id,
      quantities: Object.fromEntries(
        s.orders[0].plan.lines.map((l) => [l.offer_id, l.quantity_base]),
      ),
      operation_key: "receive",
    };
    s = await repo.mutate(s, (x) => applyAction(x, action), s.revision);
    const once = stockOf(s);
    s = await repo.mutate(s, (x) => applyAction(x, action), s.revision);
    expect(stockOf(s)).toEqual(once);
    s = await repo.mutate(
      s,
      (x) =>
        applyAction(x, {
          type: "complete_production",
          operation_key: "produce",
        }),
      s.revision,
    );
    const raw = stockOf(s);
    s = await repo.mutate(
      s,
      (x) =>
        applyAction(x, {
          type: "sell",
          recipe_id: "baguette",
          quantity: 1,
          operation_key: "sell",
        }),
      s.revision,
    );
    expect(stockOf(s)).toEqual(raw);
    expect(finishedOf(await repo.read(s.id)).baguette).toBe(299);
  });
  it("rejects stale concurrent writes and reports snapshot failures without undoing committed data", async () => {
    const s = await repo.current();
    const results = await Promise.allSettled([
      repo.mutate(s, (x) => ({ ...x, name: "first" }), s.revision),
      repo.mutate(s, (x) => ({ ...x, name: "second" }), s.revision),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const current = await repo.read(s.id);
    bucket.fail = true;
    await repo.mutate(
      current,
      (x) => ({ ...x, name: "saved despite failed snapshot" }),
      current.revision,
    );
    expect((await repo.read(s.id)).name).toBe("saved despite failed snapshot");
    expect((await repo.backupStatus(s.id))?.last_error).toMatch(/snapshot/);
  });
  it("keeps five snapshots and resets only the active restored copy", async () => {
    const original = await repo.current();
    const restored = structuredClone(original);
    restored.id = crypto.randomUUID();
    restored.name = "Separate copy";
    let s = await repo.insert(restored);
    for (let n = 0; n < 8; n++)
      s = await repo.mutate(
        s,
        (x) => ({ ...x, name: `copy ${n}` }),
        s.revision,
      );
    expect(
      (await bucket.list({ prefix: `backups/owner/${s.id}/` })).objects,
    ).toHaveLength(5);
    await repo.switch("owner", true);
    expect((await repo.read(original.id)).revision).toBe(original.revision);
    expect((await repo.current()).id).toBe(restored.id);
  });
});
describe("private cloud accounts and upload authorization", () => {
  it("requires a single-use setup code and maintains revocable hashed sessions", async () => {
    await expect(
      createCloudAccount(
        db,
        {
          username: "alice",
          password: "a-long-test-password",
          invite: "wrong",
        },
        invite,
      ),
    ).rejects.toThrow(/setup code/);
    const token = await createCloudAccount(
        db,
        { username: "alice", password: "a-long-test-password", invite },
        invite,
      ),
      account = await findAccount(db, token);
    expect(account?.username).toBe("alice");
    expect(await findAccount(db, "bad-token")).toBeNull();
    const [row] = await db.query(
      "SELECT password_hash FROM beply_accounts WHERE username='alice'",
    );
    expect(row.password_hash).not.toContain("a-long-test-password");
    await expect(
      createCloudAccount(
        db,
        { username: "bob", password: "a-long-test-password", invite },
        invite,
      ),
    ).rejects.toThrow(/already be used/);
    expect(
      await db.query("SELECT id FROM beply_accounts WHERE username='bob'"),
    ).toHaveLength(0);
    const logged = await loginCloud(db, {
      username: "alice",
      password: "a-long-test-password",
    });
    expect((await findAccount(db, logged))?.id).toBe(account?.id);
    await db.query("DELETE FROM beply_sessions WHERE token_hash=$1", [
      tokenHash(logged),
    ]);
    expect(await findAccount(db, logged)).toBeNull();
    await db.query(
      "UPDATE beply_sessions SET expires_at=now()-interval '1 day'",
    );
    expect(await findAccount(db, token)).toBeNull();
  });
  it("throttles repeated failed sign-in attempts", async () => {
    for (let n = 0; n < 5; n++)
      await expect(
        loginCloud(db, {
          username: "absent",
          password: "a-long-test-password",
        }),
      ).rejects.toThrow(/incorrect/);
    await expect(
      loginCloud(db, { username: "absent", password: "a-long-test-password" }),
    ).rejects.toThrow(/Too many/);
  });
  it("only finalizes private upload leases for the correct owner, workspace and purpose", async () => {
    const s = await repo.current(),
      path = `incoming/${crypto.randomUUID()}.bin`;
    await bucket.put(path, "private source");
    await db.query("INSERT INTO beply_uploads VALUES($1,$2,$3,'document',$4)", [
      path,
      "owner",
      s.id,
      new Date(Date.now() + 60000).toISOString(),
    ]);
    const request = () =>
      new Request("https://beply.example/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname: path,
          name: "recipe.csv",
          kind: "recipe",
        }),
      });
    await expect(
      receiveFile(
        request(),
        new CloudRepository(db, bucket, "other"),
        s,
        "document",
      ),
    ).rejects.toThrow(/access denied/);
    await expect(receiveFile(request(), repo, s, "backup")).rejects.toThrow(
      /access denied/,
    );
    const form = await receiveFile(request(), repo, s, "document");
    expect(await (form.get("file") as File).text()).toBe("private source");
    expect(form.get("kind")).toBe("recipe");
    expect(await bucket.get(path)).toBeNull();
    await expect(receiveFile(request(), repo, s, "document")).rejects.toThrow(
      /access denied/,
    );
  });
  it("streams complete backup bytes and rejects tampered recovery data", async () => {
    const payload = { state: seedState(), files: [] },
      text = JSON.stringify({
        format: "beply-workspace",
        version: 1,
        created_at: new Date().toISOString(),
        checksum: digest(payload),
        payload,
      });
    expect(
      validateBackup(await new Response(streamText(text)).text()).state.kind,
    ).toBe("sample");
    await expect(
      new Response(streamText("x".repeat(5 * 1024 * 1024))).text(),
    ).resolves.toHaveLength(5 * 1024 * 1024);
    const bad = JSON.parse(text);
    bad.payload.state.name = "tampered";
    expect(() => validateBackup(JSON.stringify(bad))).toThrow(/checksum/i);
  });
});
