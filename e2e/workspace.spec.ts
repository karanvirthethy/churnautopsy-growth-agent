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
  await page
    .getByRole("button", { name: "Check connections", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Supabase" }),
  ).toContainText("Demo mode: no database request made.");
  await expect(
    page.getByRole("status").filter({ hasText: "Supabase" }),
  ).toContainText("Demo mode: no Hunter request made.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("minimal Discover companies show unverified attributes and remain reviewable", async ({
  page,
}) => {
  // Synthetic documented response shape; no provider calls or real prospects.
  const { mapHunter, HunterResponse } = await import("../server/companies");
  const { default: fixture } = await import(
    "../tests/fixtures/hunter-discover-minimal.json",
    { with: { type: "json" } }
  );
  const company = mapHunter(HunterResponse.parse(fixture).data[0]);
  await page.route("**/api/companies", (route) =>
    route.fulfill({ json: { mode: "live", companies: [company] } }),
  );
  await page.route("**/api/companies/metricgrove.example", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ status: "saved" });
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await expect(
    page.getByText("Industry unverified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Location unverified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Unverified", exact: true }),
  ).toBeVisible();
  await page.getByText("Unscored", { exact: true }).click();
  await expect(
    page.getByText(
      "Search filters are targeting criteria, not verified company attributes",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save Metric Grove", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Metric Grove saved");
});

test("connection checks show independent service failures and recover on retry", async ({
  page,
}) => {
  let checks = 0;
  await page.route("**/api/connections/health", (route) => {
    expect(route.request().method()).toBe("POST");
    checks++;
    return route.fulfill({
      json: {
        supabase: {
          status: "healthy",
          message:
            "Database reachable; expected company columns accessible. No data changed.",
        },
        hunter:
          checks === 1
            ? {
                status: "error",
                message:
                  "Check the Hunter secret binding, account access, network access, and request limits.",
              }
            : { status: "healthy", message: "Hunter account reachable." },
      },
    });
  });
  await page.goto("/#settings");
  const check = page.getByRole("button", {
    name: "Check connections",
    exact: true,
  });
  await check.click();
  const status = page.getByRole("status").filter({ hasText: "Supabase" });
  await expect(status).toContainText("Supabase — healthy");
  await expect(status).toContainText("Hunter — error");
  await check.click();
  await expect(status).toContainText("Hunter — healthy");
});
