import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJV8AAAAASUVORK5CYII=",
  "base64",
);
async function state(page: Page) {
  return (await page.request.get("/api/state")).json();
}
async function nav(page: Page, name: string) {
  const open = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await open.isVisible()) await open.click();
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
test("fresh bakery has no sample figures; switching samples preserves the empty owner workspace", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  const data = await state(page);
  expect(data.state.kind).toBe("owner");
  expect(data.state.inventory).toHaveLength(0);
  expect(data.state.offers).toHaveLength(0);
  await expect(page.getByText("$77.80", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Choose file", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  mkdirSync("outputs/screenshots", { recursive: true });
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name.includes("mobile") ? "mobile" : "desktop"}-start.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Explore sample bakery", exact: true })
    .click();
  await expect(page.locator(".hero-amount")).toHaveText("$77.80");
  await page.getByLabel("Workspace", { exact: true }).selectOption("owner");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  await page.reload();
  expect((await state(page)).state.id).toBe(data.state.id);
  await nav(page, "Ingredient market");
  await expect(page.locator(".ingredient-feed-item")).toHaveCount(6);
  await expect(
    page.getByText("Your first price starts the line.", { exact: true }),
  ).toHaveCount(6);
  await expect(page.getByText("Uncounted", { exact: true })).toHaveCount(6);
  await noOverflow(page);
});
test("a real image upload becomes a reviewed recipe and inputs calculate the first shopping plan", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Upload document type", { exact: true })
    .selectOption("recipe");
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "my-recipe.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Manual review · no extraction", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Recipe name", { exact: true })).toHaveValue("");
  await page.getByLabel("Recipe name", { exact: true }).fill("My little rolls");
  await page.getByLabel("Recipe yield", { exact: true }).fill("12");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page.getByLabel("Quantity (g)", { exact: true }).fill("900");
  await noOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${info.project.name.includes("mobile") ? "mobile" : "desktop"}-upload-review.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm reviewed record", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let data = await state(page);
  expect(data.state.recipes[0].ingredients[0].quantity_base).toBe(900);
  expect(data.state.inventory).toHaveLength(0);
  await page
    .getByRole("button", { name: "Set business location", exact: true })
    .click();
  await page.getByLabel("Business name", { exact: true }).fill("My bakery");
  await page.getByLabel("City", { exact: true }).fill("New York");
  await page
    .getByLabel("State or territory", { exact: true })
    .selectOption("NY");
  await page.getByLabel("ZIP code", { exact: true }).fill("10001");
  await page
    .getByRole("button", { name: "Save location & recalculate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Recipes & stock");
  for (const ingredient of data.state.ingredients) {
    await page
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: new RegExp(ingredient.name) }),
      })
      .getByRole("button", { name: "Count", exact: true })
      .click();
    await page.getByLabel(/Actual current count/).fill("0");
    await page
      .getByRole("button", { name: "Confirm count", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await nav(page, "Ingredient market");
  await page
    .getByRole("button", { name: "Add local supplier", exact: true })
    .click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("My corner store");
  await page.getByLabel("Daily opening time").fill("00:00");
  await page.getByLabel("Daily closing time").fill("23:59");
  await page
    .getByRole("button", { name: "Save local supplier", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add package quote", exact: true })
    .click();
  await page.getByLabel("Local package quantity", { exact: true }).fill("1");
  await page.getByLabel("Package unit", { exact: true }).selectOption("kg");
  await page.getByLabel("Local price per pack", { exact: true }).fill("2");
  await page
    .getByLabel("Quote source or note", { exact: true })
    .fill("My checked shelf label");
  await page
    .getByRole("button", {
      name: "Save local quote & recalculate",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Purchase plan");
  await page
    .getByRole("button", { name: "Edit production", exact: true })
    .click();
  await page
    .getByLabel(`${data.state.recipes[0].id} production units`, { exact: true })
    .fill("25");
  await page
    .getByRole("button", { name: "Save production plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Total purchasing budget", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("plan-total")).toHaveText("$6.00");
  data = await state(page);
  expect(data.derived.plan.status).toBe("feasible");
  expect(data.derived.plan.required.flour).toBe(2700);
  expect(data.state.index_basket[0].quantity_base).toBe(2700);
  await page.reload();
  await expect(page.getByTestId("plan-total")).toHaveText("$6.00");
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test("invoice uploads start unposted and unsupported images fail honestly", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Upload document type", { exact: true })
    .selectOption("invoice");
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "supplier-invoice.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Document type", { exact: true })).toHaveValue(
    "invoice",
  );
  await expect(
    page.getByLabel("Goods physically received", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Payment already made", { exact: true }),
  ).not.toBeChecked();
  let data = await state(page);
  expect(data.state.documents[0].lines).toEqual([]);
  expect(data.state.inventory).toEqual([]);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "unreadable.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("not a supported image"),
  });
  await expect(page.locator(".upload-intake .error-banner")).toContainText(
    "Supported files",
  );
  data = await state(page);
  expect(data.state.documents).toHaveLength(1);
});
