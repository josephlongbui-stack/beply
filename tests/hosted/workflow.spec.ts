import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function current(page: Page) {
  const r = await page.request.get("/api/state");
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function action(page: Page, value: unknown) {
  const s = await current(page),
    r = await page.request.post("/api/state", {
      data: { revision: s.state.revision, action: value },
    });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function nav(page: Page, name: string) {
  await expect(page.getByLabel("Workspace", { exact: true })).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function clean(page: Page, kind = "owner") {
  let r = await page.request.post("/api/state", {
    data: { type: "workspace", kind },
  });
  expect(r.ok()).toBe(true);
  r = await page.request.post("/api/state", {
    data: { type: "workspace", kind, reset: true, confirmation: "RESET" },
  });
  expect(r.ok(), await r.text()).toBe(true);
  await page.reload();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/signin-with-chatgpt?return_to=%2F");
  await expect(page.getByLabel("Workspace", { exact: true })).toBeVisible();
  await clean(page);
});
test("hosted reference workflow computes, receives once, produces, sells and persists", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await clean(page, "sample");
  let d = await current(page);
  expect(d.derived.plan.total_cost_cents).toBe(7780);
  expect(d.derived.oneStore.total_cost_cents).toBe(9330);
  await expect(page.locator(".hero-amount")).toHaveText("$77.80");
  d = await action(page, {
    type: "settings",
    settings: { ...d.state.settings, budget_cents: 8500 },
  });
  expect(d.derived.plan.funding_gap_cents).toBe(280);
  d = await action(page, {
    type: "settings",
    settings: { ...d.state.settings, budget_cents: 10000 },
  });
  d = await action(page, {
    type: "approve",
    plan_version: d.state.plan_version,
    operation_key: "approve",
  });
  expect(d.derived.stock.flour).toBe(12000);
  const order = d.state.orders[0],
    receive = {
      type: "receive",
      order_id: order.id,
      quantities: Object.fromEntries(
        order.plan.lines.map(
          (l: { offer_id: string; quantity_base: number }) => [
            l.offer_id,
            l.quantity_base,
          ],
        ),
      ),
      operation_key: "receive",
    };
  d = await action(page, receive);
  const stock = d.derived.stock;
  d = await action(page, { ...receive, operation_key: "repeat" });
  expect(d.derived.stock).toEqual(stock);
  d = await action(page, {
    type: "complete_production",
    operation_key: "produce",
  });
  const after = d.derived.stock;
  d = await action(page, {
    type: "sell",
    recipe_id: "baguette",
    quantity: 5,
    operation_key: "sale",
  });
  expect(d.derived.stock).toEqual(after);
  await page.reload();
  expect((await current(page)).derived.stock).toEqual(after);
  await nav(page, "Ingredient market");
  await expect(page.locator(".ingredient-feed-item")).toHaveCount(6);
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-market.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("supplier price-list CSV changes live purchasing inputs with review and no invented OCR", async ({
  page,
}, info) => {
  let d = await current(page);
  d = await action(page, {
    type: "location",
    name: "Catering Studio",
    business_type: "caterer",
    location: {
      country: "US",
      city: "Boston",
      state: "MA",
      postal_code: "02108",
    },
    timezone: "America/New_York",
    price_mode: "local",
  });
  d = await action(page, {
    type: "local_supplier",
    name: "Produce supplier",
    address: "Owner-entered pickup",
    mode: "in_store",
    ready_at: d.state.clock,
    timezone: d.state.timezone,
    hours: "00:00-23:59",
    estimated_trip_cash_cost_cents: 0,
    minimum_order_cents: 0,
    shipping_cents: 0,
  });
  const csv = `supplier,ingredient,quantity,unit,pack_price_usd,tax_usd,maximum_packs,availability,observed_at,valid_until,source_label\nProduce supplier,flour,1,kg,3.25,0.00,20,confirmed,${d.state.clock},${new Date(Date.parse(d.state.clock) + 86400000).toISOString()},Supplier list`;
  await page.reload();
  await page.getByLabel("Upload source file").setInputFiles({
    name: "supplier.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page
    .getByLabel("Import template", { exact: true })
    .selectOption("quotes");
  await page
    .getByRole("button", { name: "Validate & preview rows", exact: true })
    .click();
  await expect(page.getByText(/1 rows · 0 errors/)).toBeVisible();
  await page.getByRole("button", { name: /Confirm & commit/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  d = await current(page);
  expect(d.state.offers[0].pack_price_cents).toBe(325);
  expect(d.state.price_history).toHaveLength(1);
  await nav(page, "Ingredient market");
  await expect(page.locator("#price-flour")).toContainText("$3.25");
  await noOverflow(page);
  await nav(page, "Documents & settings");
  await page
    .getByLabel("Upload source file")
    .setInputFiles("tests/fixtures/ocr-recipe.png");
  await expect(page.getByRole("dialog")).toContainText(
    "External document reading is not connected",
  );
  d = await current(page);
  expect(d.state.documents[0].mode).toBe("manual");
  expect(d.state.documents[0].lines).toHaveLength(0);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-review.png`,
    fullPage: true,
  });
  await noOverflow(page);
});
test("cloud sources and backup copies survive sign-in; stale concurrent writes are rejected", async ({
  page,
}, info) => {
  await page
    .getByLabel("Upload source file")
    .setInputFiles("tests/fixtures/ocr-recipe.png");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  let d = await current(page);
  const id = d.state.id,
    doc = d.state.documents[0];
  const backup = await page.request.get("/api/backup");
  expect(backup.ok(), await backup.text()).toBe(true);
  const bytes = await backup.body();
  expect(JSON.parse(bytes.toString()).payload.files).toHaveLength(1);
  const writes = await Promise.all(
    [1, 2].map((n) =>
      page.request.post("/api/state", {
        data: {
          revision: d.state.revision,
          action: {
            type: "settings",
            settings: { ...d.state.settings, budget_cents: 10000 + n },
          },
        },
      }),
    ),
  );
  expect(writes.map((r) => r.status()).sort()).toEqual([200, 409]);
  await page.goto("/signout-with-chatgpt?return_to=%2F");
  await page.goto("/signin-with-chatgpt?return_to=%2F");
  await expect(page.getByLabel("Workspace", { exact: true })).toBeVisible();
  d = await current(page);
  expect(d.state.id).toBe(id);
  expect((await page.request.get(`/api/documents/${doc.id}`)).ok()).toBe(true);
  await nav(page, "Documents & settings");
  await expect(
    page.getByRole("heading", { name: "Sign in across devices" }),
  ).toBeVisible();
  await page
    .getByText("Restore a backup or reopen a workspace", { exact: true })
    .click();
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page
    .getByRole("button", { name: "Restore as a separate copy", exact: true })
    .click();
  await expect.poll(async () => (await current(page)).state.id).not.toBe(id);
  const restored = await current(page);
  expect(restored.state.documents[0].hash).toBe(doc.hash);
  expect(
    await (await page.request.get(`/api/documents/${doc.id}`)).body(),
  ).toEqual(readFileSync("tests/fixtures/ocr-recipe.png"));
  const old = await page.request.post("/api/state", {
    data: { type: "activate_workspace", id },
  });
  expect(old.ok()).toBe(true);
  expect((await old.json()).state.documents).toHaveLength(1);
  await page.reload();
  await nav(page, "Documents & settings");
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-recovery.png`,
    fullPage: true,
  });
});

test("private APIs reject anonymous reads, foreign workspace IDs and cross-origin writes", async ({
  page,
  playwright,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://localhost:3101",
  });
  const denied = await anonymous.get("/api/state");
  expect(denied.status()).toBe(403);
  await anonymous.dispose();
  const foreign = await page.request.post("/api/state", {
    data: { type: "activate_workspace", id: "someone-elses-workspace" },
  });
  expect(foreign.status()).toBe(403);
  const before = await current(page);
  const cross = await page.request.post("/api/state", {
    headers: { Origin: "https://unrelated.example" },
    data: {
      revision: before.state.revision,
      action: {
        type: "settings",
        settings: { ...before.state.settings, budget_cents: 999 },
      },
    },
  });
  expect(cross.ok()).toBe(false);
  expect((await current(page)).state.settings).toEqual(before.state.settings);
  await page
    .getByLabel("Upload source file")
    .setInputFiles("tests/fixtures/ocr-recipe.png");
  await expect(page.getByRole("dialog")).toBeVisible();
  const doc = (await current(page)).state.documents[0];
  await page.request.post("/api/state", {
    data: { type: "workspace", kind: "sample" },
  });
  expect((await page.request.get(`/api/documents/${doc.id}`)).status()).toBe(
    403,
  );
});
