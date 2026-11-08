import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
async function nav(page: Page, name: string) {
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function state(page: Page) {
  const res = await page.request.get("/api/state");
  expect(res.ok()).toBeTruthy();
  return res.json();
}
async function expectNoOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    w: document.documentElement.clientWidth,
    s: document.documentElement.scrollWidth,
  }));
  const overflow =
    dims.s > dims.w + 1
      ? await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (e) =>
                e.getBoundingClientRect().right >
                document.documentElement.clientWidth + 1,
            )
            .slice(0, 12)
            .map((e) => ({
              tag: e.tagName,
              class: e.className,
              right: e.getBoundingClientRect().right,
              text: e.textContent?.slice(0, 80),
            })),
        )
      : [];
  expect(dims.s, JSON.stringify(overflow)).toBeLessThanOrEqual(dims.w + 1);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  await page.getByLabel("Workspace", { exact: true }).selectOption("sample");
  await expect(
    page.getByRole("heading", { name: "A little planning. A better bake." }),
  ).toBeVisible();
});
test("changing stores, budget, production and prices recalculates and persists", async ({
  page,
}) => {
  await nav(page, "Purchase plan");
  await expect(page.getByTestId("plan-total")).toHaveText("$77.80");
  await page.getByLabel("Maximum stores", { exact: true }).selectOption("1");
  await expect(page.getByTestId("plan-total")).toHaveText("$93.30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Unsaved preview", { exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByLabel("Maximum stores", { exact: true })).toHaveValue(
    "1",
  );
  await page.getByLabel("Maximum stores", { exact: true }).selectOption("2");
  await page.getByLabel("Total purchasing budget", { exact: true }).fill("85");
  await expect(page.getByTestId("cash-result")).toHaveText("$2.80");
  await expect(
    page.getByRole("button", { name: "Approve shopping plan", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Total purchasing budget", { exact: true }).fill("110");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Unsaved preview", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Edit production", exact: true })
    .click();
  await page.getByLabel("baguette production units").fill("301");
  await page.getByRole("button", { name: "Save production plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("4 whole batches · 99 extra units"),
  ).toBeVisible();
  await expect(page.getByTestId("plan-total")).not.toHaveText("$77.80");
  await nav(page, "Ingredient market");
  await page.getByRole("button", { name: /Unsalted butter/ }).click();
  await page
    .locator("#price-butter")
    .getByRole("row")
    .filter({ hasText: "Neighborhood Market — Demo" })
    .filter({ hasText: "Eligible sample quote" })
    .getByRole("button", { name: "Edit quote" })
    .click();
  await page.getByLabel("Quote pack price").fill("5.4");
  await page.getByRole("button", { name: "Save quote & recalculate" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await state(page)).state.offers.find(
      (o: { id: string }) => o.id === "market_a_butter",
    ).pack_price_cents,
  ).toBe(540);
  await expectNoOverflow(page);
});
test("approve, shop, receive, produce and sell retain correct stock", async ({
  page,
}, testInfo) => {
  await nav(page, "Purchase plan");
  await page
    .getByRole("button", { name: "Approve shopping plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Take this list with you." }),
  ).toBeVisible();
  let data = await state(page);
  expect(data.derived.stock.flour).toBe(12000);
  expect(data.derived.commitments).toBe(7780);
  await page
    .getByRole("checkbox", {
      name: "Picked Bread flour at Neighborhood Market — Demo",
    })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Picked Bread flour at Neighborhood Market — Demo",
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Dismiss notification", exact: true })
    .click();
  mkdirSync("outputs/screenshots", { recursive: true });
  await page.screenshot({
    path: `outputs/screenshots/${testInfo.project.name.includes("mobile") ? "mobile" : "desktop"}-shopping.png`,
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("shopping");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".store-group").first()).toBeVisible();
  await expect(page.locator(".shopping-actions")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Confirm goods received", exact: true })
    .click();
  await page.getByRole("button", { name: "Post received quantities" }).click();
  await expect(
    page.getByRole("button", { name: "All goods received" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Record payment separately" }).click();
  await expect(
    page.getByRole("button", { name: "Payment recorded", exact: true }),
  ).toBeDisabled();
  await nav(page, "Recipes & stock");
  await page
    .getByRole("button", { name: "Record production", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete production", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  data = await state(page);
  expect(data.derived.stock).toEqual({
    flour: 4000,
    butter: 0,
    sugar: 0,
    eggs: 4,
    yeast: 380,
    milk: 0,
  });
  expect(data.derived.finished).toEqual({ baguette: 300, butter_bun: 100 });
  await page
    .locator(".finished-row")
    .filter({ hasText: "Bánh mì baguettes" })
    .getByRole("button", { name: "Record sale" })
    .click();
  await page.getByRole("button", { name: "Confirm sale" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  data = await state(page);
  expect(data.derived.finished.baguette).toBe(299);
  expect(data.derived.stock.flour).toBe(4000);
  await expectNoOverflow(page);
});
test("sample receipt review and renamed duplicate preserve one purchase", async ({
  page,
}) => {
  await nav(page, "Documents & settings");
  await page
    .getByRole("button", { name: "Use sample receipt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm reviewed record", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let data = await state(page);
  expect(data.derived.stock.flour).toBe(17000);
  expect(data.derived.spent).toBe(800);
  expect(data.derived.plan.total_cost_cents).toBe(6980);
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "renamed-receipt.svg",
    mimeType: "image/svg+xml",
    buffer: readFileSync("public/samples/receipt.svg"),
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm reviewed record", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  data = await state(page);
  expect(data.derived.stock.flour).toBe(17000);
  expect(data.state.expenses).toHaveLength(1);
  await page
    .getByRole("button", { name: "Payment statement", exact: true })
    .click();
  await page
    .getByLabel("Match to a confirmed purchase")
    .selectOption({ label: "Sample receipt · $8.00" });
  await page.getByRole("button", { name: "Confirm reviewed record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).state.expenses).toHaveLength(1);
  await expectNoOverflow(page);
});
test("unknown upload is manual and CSV validates before committing", async ({
  page,
}) => {
  await nav(page, "Documents & settings");
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "ordinary.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      "%PDF-1.4\n% Test document with no extracted facts\n%%EOF",
    ),
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText(
      "No extraction provider is configured. Nothing has been read automatically. Review the preview and enter the fields manually.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm reviewed record" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByLabel("Upload source file", { exact: true })
    .setInputFiles(resolve("demo/purchase_import.csv"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Validate & preview rows" }).click();
  await expect(page.getByText("1 rows · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & commit 1 rows" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).derived.stock.flour).toBe(17000);
  const invalid = readFileSync("demo/purchase_import.csv", "utf8").replace(
    ",g,",
    ",case,",
  );
  await page.getByLabel("Upload source file", { exact: true }).setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(invalid),
  });
  await page.getByRole("button", { name: "Validate & preview rows" }).click();
  await expect(page.getByText(/Unknown package\/unit 'case'/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm & commit 1 rows" }),
  ).toBeDisabled();
  await expectNoOverflow(page);
});
test("guided workspace, recipe editing, language and reset work", async ({
  page,
}) => {
  await page.getByLabel("Workspace", { exact: true }).selectOption("guided");
  await expect(
    page.getByRole("heading", {
      name: "Build your bakery’s starting picture.",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use sample recipe", exact: true })
    .click();
  await page.getByLabel("Recipe yield", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Confirm reviewed record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Butter bun recipe", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm reviewed record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Confirm sample starting counts" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm sample starting counts" }),
  ).toBeDisabled();
  await nav(page, "Purchase plan");
  await page.getByRole("button", { name: "Edit production" }).click();
  await page.getByLabel("baguette production units").fill("300");
  await page.getByLabel("butter_bun production units").fill("100");
  await page.getByRole("button", { name: "Save production plan" }).click();
  await expect(page.getByTestId("plan-total")).toHaveText("$77.80");
  await page.getByLabel("Language", { exact: true }).selectOption("vi");
  await expect(
    page.getByRole("button", { name: "Duyệt kế hoạch mua hàng", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Language", { exact: true }).selectOption("en");
  await expect(
    page.getByRole("button", { name: "Approve shopping plan", exact: true }),
  ).toBeVisible();
  await nav(page, "Documents & settings");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await page.getByRole("button", { name: "Reset current workspace" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).state.recipes).toHaveLength(0);
  await page.getByLabel("Workspace", { exact: true }).selectOption("sample");
  await expect(
    page.getByRole("heading", { name: "A little planning. A better bake." }),
  ).toBeVisible();
  expect((await state(page)).state.recipes).toHaveLength(2);
});
test("economic tools, calendar and responsive layouts render without runtime errors", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mkdirSync("outputs/screenshots", { recursive: true });
  const mobile = testInfo.project.name.includes("mobile");
  await expectNoOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${mobile ? "mobile" : "desktop"}-today.png`,
    fullPage: true,
  });
  await nav(page, "Purchase plan");
  await page.screenshot({
    path: `outputs/screenshots/${mobile ? "mobile" : "desktop"}-plan.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Schedule from this plan" }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await nav(page, "Ingredient market");
  await expect(
    page.getByRole("heading", { name: "Bread flour price history" }),
  ).toBeVisible();
  await expect(page.getByText(/Outlook method: flat mean/)).toHaveCount(6);
  await expect(page.locator(".ingredient-feed-item")).toHaveCount(6);
  await expectNoOverflow(page);
  await page.screenshot({
    path: `outputs/screenshots/${mobile ? "mobile" : "desktop"}-market.png`,
    fullPage: true,
  });
  const before = await state(page);
  await nav(page, "Scenarios & pricing");
  const initial = await page.getByTestId("scenario-total").textContent();
  await page.getByLabel("Butter price scenario").fill("40");
  await expect(page.getByTestId("scenario-total")).not.toHaveText(initial!);
  expect((await state(page)).state.offers).toEqual(before.state.offers);
  await page.getByRole("tab", { name: "Menu pricing" }).click();
  await page
    .getByLabel("Target contribution margin", { exact: true })
    .fill("60");
  await expect(page.locator(".suggested-price")).toHaveText("$1.50");
  await expectNoOverflow(page);
  await page.getByRole("tab", { name: "Opportunity cost" }).click();
  await expect(
    page.getByText("Confirmed future need missing", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("beply location, local suppliers and US package quotes persist and remain scoped", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page).toHaveTitle(/beply/);
  await page
    .getByRole("button", { name: "Set business location", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Beply New York");
  await page.getByLabel("City", { exact: true }).fill("New York");
  await page.getByLabel("State or territory").selectOption("NY");
  await expect(
    page.getByLabel("Business timezone", { exact: true }),
  ).toHaveValue("America/New_York");
  await page.getByLabel("ZIP code").fill("10001");
  await page.getByLabel("Prices used for planning").selectOption("local");
  await page
    .getByRole("button", { name: "Save location & recalculate" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Set business location" }),
  ).toContainText("New York, NY");
  expect((await state(page)).state.price_mode).toBe("local");
  await expect(page.locator(".hero-amount")).toHaveText("Needs quotes");
  await nav(page, "Ingredient market");
  await page
    .getByRole("button", { name: "Add local supplier", exact: true })
    .click();
  await page
    .getByLabel("Supplier name", { exact: true })
    .fill("Test neighborhood market");
  await page
    .getByLabel("Address or pickup instructions")
    .fill("Bring the reusable crates");
  await page.getByLabel("Estimated trip cost ($)").fill("3.50");
  await page
    .getByRole("button", { name: "Save local supplier", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add package quote", exact: true })
    .click();
  await page.getByLabel("Local package quantity", { exact: true }).fill("25");
  await page.getByLabel("Package unit", { exact: true }).selectOption("lb");
  await page.getByLabel("Local price per pack", { exact: true }).fill("18.50");
  await page.getByLabel("Tax per pack ($)").fill("1.25");
  await page
    .getByLabel("Quote source or note")
    .fill("Owner-entered test shelf label");
  await expect(page.getByText(/Ledger package: 11,339 g/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Save local quote & recalculate",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "$19.75", exact: true }),
  ).toBeVisible();
  let data = await state(page);
  const local = data.state.offers.find(
    (o: { source_type: string }) => o.source_type === "owner_entered",
  );
  expect(local.pack_quantity_base).toBe(11339);
  expect(local.tax_cents_per_pack).toBe(125);
  expect(data.derived.purchasingPower.partial).toBe(true);
  await page.getByRole("button", { name: "Edit quote", exact: true }).click();
  await expect(page.getByLabel("Package unit", { exact: true })).toHaveValue(
    "lb",
  );
  await page.getByLabel("Local price per pack", { exact: true }).fill("20");
  await page
    .getByRole("button", {
      name: "Save local quote & recalculate",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "$21.25", exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page
    .getByRole("button", { name: "Set business location", exact: true })
    .click();
  await page.screenshot({
    path: `outputs/screenshots/${testInfo.project.name.includes("mobile") ? "mobile" : "desktop"}-location.png`,
    fullPage: true,
  });
  await page.getByLabel("City", { exact: true }).fill("Houston");
  await page.getByLabel("State or territory").selectOption("TX");
  await page.getByLabel("ZIP code").fill("77002");
  await page
    .getByRole("button", { name: "Save location & recalculate" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Your neighborhood starts here.", { exact: true }),
  ).toBeVisible();
  data = await state(page);
  expect(
    data.state.suppliers.some(
      (p: { name: string }) => p.name === "Test neighborhood market",
    ),
  ).toBe(true);
  expect(data.derived.plan.status).toBe("no_supply_feasible_plan");
  await nav(page, "Scenarios & pricing");
  await page
    .getByRole("tab", { name: "Opportunity cost", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Add a local quote first" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Menu pricing", exact: true }).click();
  await expect(page.locator(".suggested-price")).toHaveText("Incomplete");
  expect(errors).toEqual([]);
});

test("local production times use selected timezone and handle daylight-saving transitions", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Set business location", exact: true })
    .click();
  await page.getByLabel("City", { exact: true }).fill("New York");
  await page.getByLabel("State or territory").selectOption("NY");
  await page.getByLabel("ZIP code").fill("10001");
  await page
    .getByRole("button", { name: "Save location & recalculate" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav(page, "Purchase plan");
  await page
    .getByRole("button", { name: "Edit production", exact: true })
    .click();
  await expect(page.getByLabel("Preparation starts (local time)")).toHaveValue(
    "2026-10-24T23:00",
  );
  await page
    .getByLabel("Preparation starts (local time)")
    .fill("2027-03-14T02:30");
  await page.getByLabel("Ready for sale (local time)").fill("2027-03-14T08:00");
  await expect(page.getByText(/This local time does not exist/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save production plan" }),
  ).toBeDisabled();
  await page
    .getByLabel("Preparation starts (local time)")
    .fill("2026-11-01T01:30");
  await page.getByLabel("Ready for sale (local time)").fill("2026-11-01T07:00");
  await page.getByLabel("If the local hour repeats").selectOption("later");
  await page.getByRole("button", { name: "Save production plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).state.production.prep_starts_at).toBe(
    "2026-11-01T06:30:00.000Z",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Edit production", exact: true })
    .click();
  await expect(page.getByLabel("Preparation starts (local time)")).toHaveValue(
    "2026-11-01T01:30",
  );
  await expect(
    page.getByLabel("If the local hour repeats", { exact: true }),
  ).toHaveValue("later");
  await page.getByRole("button", { name: "Save production plan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).state.production.prep_starts_at).toBe(
    "2026-11-01T06:30:00.000Z",
  );
  await expectNoOverflow(page);
});
