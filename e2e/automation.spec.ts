import { test, expect } from "@playwright/test";
test("owner can run the complete fictional pipeline, inspect messages and manage a reply opportunity", async ({
  page,
}) => {
  await page.goto("/#overview");
  await expect(
    page.getByRole("heading", { name: "The next action, in view." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start dry run", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Dry run queued" }),
  ).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page
      .getByRole("button", { name: "Run next queued job", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "One queued job processed" }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(
    page.getByRole("cell").filter({ hasText: "founder@auditpilot.example" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Email Sequences", exact: true })
    .click();
  await expect(page.getByText("simulated", { exact: true })).toBeVisible();
  await page.locator("summary").first().click();
  await expect(page.getByText("Unsubscribe:", { exact: false })).toHaveCount(0); // Real signed links are appended only at dispatch, never leaked as secrets.
  await expect(
    page
      .getByText("An unsubscribe link is appended at dispatch.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate reply", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reply classified" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Stage", exact: true })
    .selectOption("converted");
  await page
    .getByLabel("Private notes")
    .fill("Fictional conversion recorded during dry-run browser test.");
  await page.getByRole("button", { name: "Save opportunity" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Workspace updated." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Stage", exact: true }),
  ).toHaveValue("converted");
  await page
    .getByRole("link", { name: "Usage and Costs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every reservation counts." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Automation Settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable eligible live outreach" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send mailbox test" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Emergency pause", exact: true })
    .click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
