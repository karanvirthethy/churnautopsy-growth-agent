import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { GrowthEngine, safeEngineConfig } from "../server/automation/engine";
import { MemoryAutomationStore } from "../server/automation/state";
import { mockProviders } from "../server/automation/providers";
import { MemoryStore } from "../server/store";
function setup(live = false) {
  const store = new MemoryStore();
  const automationStore = new MemoryAutomationStore();
  const engine = new GrowthEngine(
    automationStore,
    store,
    mockProviders(),
    undefined,
    {
      ...safeEngineConfig,
      unsubscribeBase: "https://unsubscribe.example",
      unsubscribeSecret: "test-only-secret-material-at-least-32-bytes",
    },
  );
  const app = createApp({
    mode: live ? "live" : "demo",
    store,
    discover: async () => [],
    automation: { engine },
    authenticate: async (token) => token === "test-owner-session",
  });
  return { app, engine, store: automationStore };
}
describe("automation API ownership and activation", () => {
  it("requires the owner for every private automation mutation", async () => {
    const { app } = setup(true);
    for (const path of [
      "/pause",
      "/dry-run",
      "/tick",
      "/approve",
      "/activate",
      "/consents",
      "/mailbox-test",
    ])
      expect(
        (await request(app).post(`/api/automation${path}`).send({})).status,
      ).toBe(401);
    expect((await request(app).get("/api/automation")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/automation")
          .set("Cookie", "session=test-owner-session")
      ).status,
    ).toBe(200);
  });
  it("denies cross-origin control and real activation when server gates are closed", async () => {
    const { app } = setup();
    expect(
      (
        await request(app)
          .post("/api/automation/pause")
          .set("Origin", "https://evil.example")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/automation/activate")
          .send({ confirmation: "ENABLE LIVE SENDING" })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/automation/mailbox-test")
          .send({ confirmation: "SEND TEST TO CONFIGURED RECIPIENT" })
      ).status,
    ).toBe(409);
  });
  it("runs a complete API dry-run and permanently honors an authenticated unsubscribe link", async () => {
    const { app, store, engine } = setup();
    await request(app).post("/api/automation/dry-run").send({}).expect(200);
    for (let i = 0; i < 6; i++)
      await request(app).post("/api/automation/tick").send({}).expect(200);
    const c = (await store.read()).value.contacts[0];
    const link = new URL(engine.unsubscribeUrl(c.id));
    await request(app).get(link.pathname).expect(200);
    expect((await store.read()).value.suppressions[c.email]).toBeUndefined();
    await request(app)
      .post(link.pathname)
      .type("form")
      .send({ "List-Unsubscribe": "One-Click" })
      .expect(200);
    await request(app).post(link.pathname).type("form").send({}).expect(200);
    const after = (await store.read()).value;
    expect(after.suppressions[c.email]).toBeDefined();
    expect(after.messages.filter((m) => m.status === "queued")).toHaveLength(0);
    await request(app)
      .post(link.pathname + "tamper")
      .type("form")
      .send({})
      .expect(400);
  });
  it("does not return secrets with capability information", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/automation");
    expect(JSON.stringify(res.body)).not.toContain("test-only-secret");
    expect(res.body.capabilities).not.toHaveProperty("unsubscribeSecret");
  });
  it("invalidates approval and pauses when the campaign policy changes", async () => {
    const { app, store } = setup();
    await request(app).post("/api/automation/dry-run").send({});
    const policy = (await store.read()).value.policy;
    await request(app)
      .put("/api/automation/policy")
      .send({ ...policy, dailyLimit: 3 })
      .expect(200);
    expect((await store.read()).value.approval).toBeUndefined();
    expect((await store.read()).value.paused).toBe(true);
  });
});

it("emergency pause remains available after normal mutation rate limits are exhausted", async () => {
  const { app, engine, store } = setup();
  await engine.dryRun();
  for (let i = 0; i < 61; i++)
    await request(app).post("/api/automation/not-a-route").send({});
  await request(app).post("/api/automation/pause").send({}).expect(200);
  expect((await store.read()).value.paused).toBe(true);
});
it("requires actual test opt-out plus explicit owner receipt confirmation before activation", async () => {
  const { GmailMailbox } = await import("../server/automation/providers");
  const { mutate } = await import("../server/automation/state");
  const { policyHash } = await import("../server/automation/policy");
  const companies = new MemoryStore();
  const store = new MemoryAutomationStore();
  const engine = new GrowthEngine(
    store,
    companies,
    mockProviders(),
    undefined,
    {
      ...safeEngineConfig,
      liveSendingConfigured: true,
      testSendingConfigured: true,
      paidHunterEnabled: true,
      unsubscribeBase: "https://unsubscribe.example",
      unsubscribeSecret: "test-signing-secret-material-more-than-32-bytes",
    },
  );
  const gmail = new GmailMailbox({
    clientId: "test",
    clientSecret: "test",
    refreshToken: "test",
    mailbox: "churnautopsy@gmail.com",
  });
  const send = vi
    .spyOn(gmail, "send")
    .mockResolvedValue({ id: "test-send-id", threadId: "test-thread" });
  const app = createApp({
    mode: "demo",
    store: companies,
    discover: async () => [],
    automation: { engine, gmail, testRecipient: "owner-test@example.test" },
  });
  await mutate(store, (s) => {
    s.mode = "live";
    s.policy.senderName = "Test Owner";
    s.policy.postalAddress = "100 Test Lane, Test City";
    s.policy.searchCredits = 2;
    s.policy.verificationCredits = 2;
    s.approval = {
      hash: policyHash(s.policy),
      at: new Date().toISOString(),
      mode: "live",
    };
  });
  await request(app)
    .post("/api/automation/activate")
    .send({ confirmation: "ENABLE LIVE SENDING" })
    .expect(409);
  await request(app)
    .post("/api/automation/mailbox-test")
    .send({ confirmation: "SEND TEST TO CONFIGURED RECIPIENT" })
    .expect(200);
  expect(send).toHaveBeenCalledTimes(1);
  await request(app)
    .post("/api/automation/confirm-mailbox-test")
    .send({ confirmation: "CONFIRM RECEIPT AND UNSUBSCRIBE" })
    .expect(409);
  const c = (await store.read()).value.contacts[0];
  await request(app)
    .post(new URL(engine.unsubscribeUrl(c.id)).pathname)
    .type("form")
    .send({})
    .expect(200);
  await request(app)
    .post("/api/automation/confirm-mailbox-test")
    .send({ confirmation: "CONFIRM RECEIPT AND UNSUBSCRIBE" })
    .expect(200);
  await request(app)
    .post("/api/automation/activate")
    .send({ confirmation: "ENABLE LIVE SENDING" })
    .expect(200);
  expect((await store.read()).value.sendingEnabled).toBe(true);
});
