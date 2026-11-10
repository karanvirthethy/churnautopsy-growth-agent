import { test, expect } from "@playwright/test";
test("owner can review demo leads and navigate all five pages", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("You’re exploring fictional companies.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your next great-fit customer." }),
  ).toBeVisible();
  // Previous project may have changed a lead; explicitly reset before reviewing.
  await page.request.patch("/api/companies/metricgrove.example", {
    data: { status: "new" },
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Save Metric Grove", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Metric Grove saved");
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.getByText("Metric Grove", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Find leads", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Discovery complete");
  await page.getByRole("link", { name: "Leads", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Your leads" })).toBeVisible();
  await page.getByRole("button", { name: "All companies" }).click();
  await page
    .getByRole("textbox", { name: "Search companies" })
    .fill("not-a-company");
  await expect(
    page.getByRole("heading", { name: "No companies here yet" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Campaigns", exact: true }).click();
  await expect(
    page.getByText("Sending disabled", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet inbox, by design." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
