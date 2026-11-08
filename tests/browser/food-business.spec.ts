import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function data(page: Page) {
  return (await page.request.get("/api/state")).json();
}
async function action(page: Page, value: unknown) {
  const current = await data(page);
  const res = await page.request.post("/api/state", {
    data: { revision: current.state.revision, action: value },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return res.json();
}
async function nav(page: Page, name: string) {
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
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}
test("café profile, custom cups, dated stock and future service plans persist", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Set business location", exact: true })
    .click();
  await page.getByLabel("Business type", { exact: true }).selectOption("cafe");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Riverside Café");
  await page.getByLabel("City", { exact: true }).fill("Boston");
  await page.getByLabel("State or territory").selectOption("MA");
  await page.getByLabel("ZIP code", { exact: true }).fill("02108");
  await page
    .getByRole("button", { name: "Save location & recalculate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await data(page)).state.business_type).toBe("cafe");
  await nav(page, "Recipes & stock");
  await page
    .getByRole("button", { name: "Add stock item", exact: true })
    .click();
  await page.getByLabel("Item name", { exact: true }).fill("Takeaway cups");
  await page
    .getByLabel("Item category", { exact: true })
    .selectOption("packaging");
  await page.getByLabel("Track quantities by").selectOption("each");
  await page.getByLabel("Count label", { exact: true }).fill("cups");
  await page
    .getByLabel("Product specification", { exact: true })
    .fill("12 oz paper cups");
  await page.getByLabel("Storage capacity (each)", { exact: true }).fill("500");
  await page
    .getByLabel("Low-stock reminder at (each)", { exact: true })
    .fill("100");
  await page
    .getByRole("button", { name: "Save stock item", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let current = await data(page);
  const item = current.state.ingredients.find(
    (i: { name: string }) => i.name === "Takeaway cups",
  );
  expect(current.derived.stock[item.id]).toBe(0);
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: /Takeaway cups/ }) })
    .getByRole("button", { name: "Count", exact: true })
    .click();
  await page.getByLabel("Actual current count (each)").fill("50");
  await page
    .getByRole("button", { name: "Confirm count", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("At or below reorder point", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: /Takeaway cups/ }) })
      .getByText("50 cups", { exact: true })
      .first(),
  ).toBeVisible();
  current = await action(page, {
    type: "count",
    ingredient_id: "milk",
    quantity_base: 2000,
    observed_at: (await data(page)).state.clock,
    operation_key: "milk-count",
  });
  await page.reload();
  await nav(page, "Recipes & stock");
  await page.getByRole("button", { name: "Label a lot", exact: true }).click();
  await page.getByLabel("Stock item", { exact: true }).selectOption("milk");
  await page.getByLabel("Lot or container label").fill("Morning delivery");
  await page.getByLabel("Quantity in this lot (ml)").fill("1500");
  await page.getByLabel("Use-by date and time").fill("2026-10-28T12:00");
  await page
    .getByRole("button", { name: "Save lot label", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await data(page)).derived.stock.milk).toBe(2000);
  await expect(
    page.getByText("Morning delivery", { exact: true }),
  ).toBeVisible();
  await action(page, {
    type: "recipe",
    recipe: {
      id: "cafe-service",
      name: "Milk service",
      yield_units: 10,
      batch_scaling: "whole_batches",
      version: 1,
      ingredients: [
        { ingredient_id: "milk", quantity_base: 1000 },
        { ingredient_id: item.id, quantity_base: 10 },
      ],
      variable_labor_cents_per_batch: null,
      packaging_cents_per_unit: null,
      energy_cents_per_batch: null,
      allocated_overhead_cents_per_unit: 0,
      selling_price_cents: 400,
    },
  });
  await page.reload();
  await nav(page, "Recipes & stock");
  await page
    .getByRole("button", { name: "Save a prep plan", exact: true })
    .click();
  await page.getByLabel("Service or event name").fill("Saturday breakfast");
  await page.getByLabel("cafe-service production units").fill("20");
  await page
    .getByRole("button", { name: "Save production plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Saturday breakfast", exact: true }),
  ).toBeVisible();
  current = await data(page);
  expect(current.state.production.items).toHaveLength(0);
  expect(current.derived.stock.milk).toBe(2000);
  await page
    .getByRole("button", { name: "Activate & recalculate", exact: true })
    .click();
  expect((await data(page)).derived.plan.required.milk).toBe(2000);
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-food-operations.png`,
    fullPage: true,
  });
});
test("local OCR reads an actual image; account sign-in and complete backup restore preserve it", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Upload document type").selectOption("recipe");
  await page
    .getByLabel("Upload source file")
    .setInputFiles("tests/fixtures/ocr-recipe.png");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Read text on this computer", exact: true })
    .click();
  await expect(
    page.getByLabel("Recognized source text", { exact: true }),
  ).toHaveValue(/Red lentils 600 g/, { timeout: 60000 });
  expect((await data(page)).state.inventory).toHaveLength(0);
  expect((await data(page)).state.recipes).toHaveLength(0);
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-local-reading.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await nav(page, "Documents & settings");
  const original = await data(page),
    username = `owner_${Date.now()}_${info.project.name.slice(0, 3)}`;
  await page
    .getByRole("button", { name: "Create local account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page
    .getByRole("button", {
      name: "Create account & keep this workspace",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(`Signed in · ${username}`, { exact: true }),
  ).toBeVisible();
  expect((await data(page)).state.id).toBe(original.state.id);
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download complete backup", exact: true })
    .click();
  const backup = await download;
  const path = await backup.path();
  expect(path).toBeTruthy();
  const backupBytes = readFileSync(path!);
  expect(JSON.parse(backupBytes.toString()).payload.files).toHaveLength(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Guest workspace", { exact: true }),
  ).toBeVisible();
  expect((await data(page)).state.id).not.toBe(original.state.id);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByText(`Signed in · ${username}`, { exact: true }),
  ).toBeVisible();
  expect((await data(page)).state.documents[0].recognized_text).toContain(
    "Red lentils 600 g",
  );
  await page
    .getByText("Restore a backup or reopen a workspace", { exact: true })
    .click();
  await page
    .getByLabel("Backup file", { exact: true })
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: backupBytes,
    });
  await page
    .getByRole("button", { name: "Restore as a separate copy", exact: true })
    .click();
  await expect
    .poll(async () => (await data(page)).state.id)
    .not.toBe(original.state.id);
  const restored = await data(page);
  expect(restored.state.documents[0].recognized_text).toContain(
    "Red lentils 600 g",
  );
  const response = await page.request.get(
    `/api/documents/${restored.state.documents[0].id}`,
  );
  expect(await response.body()).toEqual(
    readFileSync("tests/fixtures/ocr-recipe.png"),
  );
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name}-account-recovery.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
