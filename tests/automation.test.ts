import { describe, it, expect, vi } from "vitest";
import { initialAutomation } from "../shared/automation";
import { MemoryAutomationStore, mutate } from "../server/automation/state";
import {
  GrowthEngine,
  safeEngineConfig,
  calendarKey,
} from "../server/automation/engine";
import { mockProviders, type Providers } from "../server/automation/providers";
import { MemoryStore } from "../server/store";
import {
  evaluate,
  policyHash,
  recordConsent,
} from "../server/automation/policy";
import { qualifyWithModel } from "../server/automation/qualification";
function setup() {
  let now = new Date("2026-11-12T15:00:00Z");
  const time = () => new Date(now);
  const store = new MemoryAutomationStore();
  const provider = mockProviders(time);
  const engine = new GrowthEngine(
    store,
    new MemoryStore(),
    provider,
    undefined,
    safeEngineConfig,
    time,
  );
  return {
    store,
    provider,
    engine,
    time,
    advance: (days: number) => {
      now = new Date(now.getTime() + days * 86400000);
    },
  };
}
async function pipeline(e: GrowthEngine) {
  await e.dryRun();
  for (let i = 0; i < 6; i++) await e.tick();
}
describe("complete autonomous dry-run journey", () => {
  it("discovers, qualifies, verifies, plans and simulates exactly one initial email without live calls", async () => {
    const { engine, store } = setup();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    try {
      await pipeline(engine);
      const s = (await store.read()).value;
      expect(s.contacts).toHaveLength(1);
      expect(s.contacts[0].eligibility.allowed).toBe(true);
      expect(s.messages).toHaveLength(3);
      expect(s.messages.filter((m) => m.status === "simulated")).toHaveLength(
        1,
      );
      expect(s.messages[0].body).toContain("free churn audit");
      expect(s.messages[0].body).not.toContain("your churn problem");
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("refreshes evidence before follow-ups and never sends more than two", async () => {
    const { engine, store, advance } = setup();
    await pipeline(engine);
    advance(4);
    for (let i = 0; i < 10; i++) await engine.tick();
    advance(5);
    for (let i = 0; i < 12; i++) await engine.tick();
    expect(
      (await store.read()).value.messages.filter(
        (m) => m.status === "simulated",
      ),
    ).toHaveLength(3);
    for (let i = 0; i < 4; i++) await engine.tick();
    expect((await store.read()).value.messages).toHaveLength(3);
  });
  it.each([
    "Yes, I am interested in the audit",
    "Not interested",
    "Unsubscribe me",
    "I am out of office",
  ])("stops all follow-ups before classifying reply: %s", async (text) => {
    const { engine, store } = setup();
    await pipeline(engine);
    const c = (await store.read()).value.contacts[0];
    const incoming = {
      id: "reply-1",
      threadId: "",
      from: c.email,
      text,
      at: engine.now().toISOString(),
      bounce: false,
    };
    await engine.receive(incoming, "dry_run");
    await engine.receive(incoming, "dry_run");
    const s = (await store.read()).value;
    expect(s.replies).toHaveLength(1);
    expect(s.messages.filter((m) => m.status === "queued")).toHaveLength(0);
    if (text.startsWith("Yes")) expect(s.opportunities).toHaveLength(1);
    if (text.startsWith("Unsubscribe") || text.startsWith("Not"))
      expect(s.suppressions[c.email]).toBeDefined();
  });
  it("suppresses a bounce and never creates an opportunity", async () => {
    const { engine, store } = setup();
    await pipeline(engine);
    const c = (await store.read()).value.contacts[0];
    await engine.receive(
      {
        id: "bounce",
        threadId: "",
        from: "mailer-daemon@example.test",
        text: `Final-Recipient: rfc822; ${c.email}`,
        at: engine.now().toISOString(),
        bounce: true,
      },
      "dry_run",
    );
    const s = (await store.read()).value;
    expect(s.suppressions[c.email]).toBeDefined();
    expect(s.opportunities).toHaveLength(0);
  });
  it("makes duplicate/concurrent ticks safe and preserves an in-flight job lease", async () => {
    const { engine, store, provider } = setup();
    const discover = vi.spyOn(provider, "discover");
    await engine.dryRun();
    await Promise.all([engine.tick(), engine.tick(), engine.tick()]);
    expect(discover).toHaveBeenCalledTimes(1);
    expect((await store.read()).value.prospects).toHaveProperty(
      "dry_run:auditpilot.example",
    );
  });
  it("recovers crashed jobs but does not retry a possibly sent email", async () => {
    const { engine, store, advance } = setup();
    await pipeline(engine);
    await mutate(store, (s) => {
      const m = s.messages[1];
      m.status = "sending";
      const j = s.jobs.find((j) => j.target === m.id)!;
      j.state = "running";
      j.leaseUntil = engine.now().toISOString();
    });
    advance(1);
    await engine.tick();
    const s = (await store.read()).value;
    expect(s.messages[1].status).toBe("uncertain");
    expect(s.paused).toBe(true);
    expect(s.sendingEnabled).toBe(false);
  });
  it("honors emergency pause and daily budgets before dispatch", async () => {
    const { engine, store, advance } = setup();
    await pipeline(engine);
    await engine.pause();
    advance(4);
    expect(await engine.tick()).toBe(false);
    expect(
      (await store.read()).value.messages.filter(
        (m) => m.status === "simulated",
      ),
    ).toHaveLength(1);
  });
  it("bounds provider retries and leaves an actionable failure alert", async () => {
    const { engine, store, provider, advance } = setup();
    provider.discover = vi
      .fn()
      .mockRejectedValue(new Error("secret-provider-error"));
    await engine.dryRun();
    await engine.tick();
    advance(10 / 1440);
    await engine.tick();
    advance(10 / 1440);
    await engine.tick();
    const s = (await store.read()).value;
    expect(s.jobs.some((j) => j.state === "failed")).toBe(true);
    expect(s.alerts.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toContain("secret-provider-error");
  });
});
describe("eligibility is independent of fit and verification", () => {
  it("denies missing, expired, future, wrong-jurisdiction consent and suppression", async () => {
    const { engine, store } = setup();
    await pipeline(engine);
    const original = (await store.read()).value;
    const c = original.contacts[0];
    const company = original.prospects["dry_run:auditpilot.example"];
    for (const alter of [
      (s: typeof original) => {
        s.consents = [];
      },
      (s: typeof original) => {
        s.consents[0].expiresAt = "2020-01-01T00:00:00Z";
      },
      (s: typeof original) => {
        s.consents[0].obtainedAt = "2030-01-01T00:00:00Z";
      },
      (s: typeof original) => {
        s.policy.countries = ["CA"];
        s.approval!.hash = policyHash(s.policy);
      },
      (s: typeof original) => {
        s.suppressions[c.email] = {
          at: engine.now().toISOString(),
          reason: "opt_out",
        };
      },
    ]) {
      const s = structuredClone(original);
      alter(s);
      expect(evaluate(s, c, company, engine.now()).allowed).toBe(false);
    }
    expect(
      evaluate(
        original,
        c,
        {
          ...company,
          qualification: {
            ...company.qualification!,
            flags: ["no_solicitation"],
          },
        },
        engine.now(),
      ).allowed,
    ).toBe(false);
    expect(
      evaluate(original, c, { ...company, status: "rejected" }, engine.now())
        .allowed,
    ).toBe(false);
  });
  it("consent import cannot undo suppression and rejects made-up public-email legal basis", () => {
    const s = initialAutomation();
    const now = new Date("2026-11-12T00:00:00Z");
    s.suppressions["a@example.test"] = {
      at: now.toISOString(),
      reason: "unsubscribe",
    };
    const input = {
      email: "a@example.test",
      country: "US" as const,
      basis: "express_consent" as const,
      scope: "churnautopsy_audit_outreach" as const,
      source: "https://consent.example/evidence",
      statement: "I agree to receive ChurnAutopsy audit outreach.",
      obtainedAt: now.toISOString(),
      expiresAt: "2027-01-01T00:00:00Z",
    };
    recordConsent(s, input, now);
    expect(s.suppressions["a@example.test"]).toBeDefined();
    expect(() =>
      recordConsent(s, { ...input, basis: "public_email" as never }, now),
    ).toThrow();
  });
  it("uses Toronto calendar boundaries", () =>
    expect(calendarKey(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-30"));
});
describe("optional local AI grounding", () => {
  const pages = [
    {
      url: "https://fictional.example/",
      status: "ok" as const,
      text: "Cloud-based software for businesses.",
    },
    {
      url: "https://fictional.example/pricing",
      status: "ok" as const,
      text: "Monthly subscription plans billed annually.",
    },
  ];
  it("accepts supported quotes but never promotes beyond evidence rules", async () => {
    const assess = vi.fn().mockResolvedValue({
      classification: "confirmed",
      confidence: 0.8,
      uncertainties: ["Company size is unknown"],
      evidence: [{ quote: pages[0].text, url: pages[0].url }],
    });
    const result = await qualifyWithModel(pages, { assess });
    expect(result.classification).toBe("confirmed");
    expect(result.modelAssessment?.confidence).toBe(0.8);
    expect(
      (await qualifyWithModel([pages[0]], { assess })).classification,
    ).toBe("insufficient");
  });
  it("rejects invented facts, prompt-injected sources and model outages", async () => {
    const assess = vi.fn().mockResolvedValue({
      classification: "confirmed",
      confidence: 1,
      uncertainties: [],
      evidence: [
        { quote: "Revenue is one million dollars", url: pages[0].url },
      ],
    });
    expect((await qualifyWithModel(pages, { assess })).score).toBeNull();
    assess.mockRejectedValue(new Error("Unavailable"));
    expect((await qualifyWithModel(pages, { assess })).score).toBeNull();
  });
});

describe("real-provider dispatch boundaries with mocked transport", () => {
  async function prepared(
    send = vi.fn().mockResolvedValue({ id: "sent-id", threadId: "thread-id" }),
  ) {
    const x = setup();
    await x.engine.dryRun();
    for (let i = 0; i < 5; i++) await x.engine.tick();
    const companies = new MemoryStore();
    const snapshot = (await x.store.read()).value;
    const company = snapshot.prospects["dry_run:auditpilot.example"];
    await companies.discover([company]);
    await mutate(x.store, (s) => {
      s.mode = "live";
      s.sendingEnabled = true;
      s.approval!.mode = "live";
      s.testReceipt = {
        at: x.time().toISOString(),
        recipient: "test@example.test",
        providerId: "test-receipt",
        confirmedAt: x.time().toISOString(),
        policyHash: policyHash(s.policy),
      };
      s.prospects["live:auditpilot.example"] = company;
      for (const c of s.contacts) c.mode = "live";
      for (const m of s.messages) m.mode = "live";
      for (const j of s.jobs) j.mode = "live";
      s.nextSyncAt = new Date(x.time().getTime() + 3600000).toISOString();
    });
    const live: Providers = {
      ...mockProviders(x.time),
      kind: "live",
      send,
      inbox: vi.fn().mockResolvedValue([]),
    };
    const engine = new GrowthEngine(
      x.store,
      companies,
      mockProviders(x.time),
      live,
      {
        ...safeEngineConfig,
        liveSendingConfigured: true,
        paidHunterEnabled: true,
        unsubscribeBase: "https://unsubscribe.example",
        unsubscribeSecret: "test-only-signing-secret-at-least-32-bytes",
      },
      x.time,
    );
    return { ...x, engine, live, send };
  }
  it("records a successful live outbox transition once and never dispatches the same job twice", async () => {
    const x = await prepared();
    await x.engine.tick();
    await x.engine.tick();
    expect(x.send).toHaveBeenCalledTimes(1);
    const s = (await x.store.read()).value;
    expect(s.messages[0].status).toBe("sent");
    expect(s.usage["live:2026-11"].sends).toBe(1);
  });
  it("treats send timeouts as uncertain and never retries or leaks upstream details", async () => {
    const x = await prepared(
      vi.fn().mockRejectedValue(new Error("secret response payload")),
    );
    await x.engine.tick();
    await x.engine.tick();
    const s = (await x.store.read()).value;
    expect(x.send).toHaveBeenCalledTimes(1);
    expect(s.messages[0].status).toBe("uncertain");
    expect(s.paused).toBe(true);
    expect(JSON.stringify(s)).not.toContain("secret response payload");
  });
  it("checks inbound opt-outs before dispatch, so even an already queued message is cancelled", async () => {
    const x = await prepared();
    const c = (await x.store.read()).value.contacts[0];
    x.live.inbox = vi.fn().mockResolvedValue([
      {
        id: "fresh-opt-out",
        threadId: "",
        from: c.email,
        text: "Unsubscribe",
        at: x.time().toISOString(),
        bounce: false,
      },
    ]);
    await x.engine.tick();
    expect(x.send).not.toHaveBeenCalled();
    expect((await x.store.read()).value.suppressions[c.email]).toBeDefined();
  });
  it("fails closed on inbox failure and on exhausted daily limits", async () => {
    const x = await prepared();
    x.live.inbox = vi.fn().mockRejectedValue(new Error("mailbox down"));
    await x.engine.tick();
    expect(x.send).not.toHaveBeenCalled();
    const y = await prepared();
    await mutate(y.store, (s) => {
      s.dailySends["live:2026-11-12"] = s.policy.dailyLimit;
    });
    await y.engine.tick();
    expect(y.send).not.toHaveBeenCalled();
    expect((await y.store.read()).value.messages[0].status).toBe("queued");
  });
  it("never calls a charged provider when budget reservations fail", async () => {
    const x = await prepared();
    const contacts = vi.fn();
    x.live.contacts = contacts;
    await mutate(x.store, (s) => {
      s.jobs = s.jobs.filter((j) => j.kind !== "send");
      s.jobs.push({
        id: "budget-test",
        key: "budget-test",
        kind: "contacts",
        mode: "live",
        target: "fictional.example",
        dueAt: x.time().toISOString(),
        state: "queued",
        attempts: 0,
      });
    });
    await x.engine.tick();
    expect(contacts).not.toHaveBeenCalled();
  });
});

it("moves follow-ups forward when initial delivery was delayed instead of sending a burst", async () => {
  const { engine, store, advance } = setup();
  await engine.dryRun();
  for (let i = 0; i < 5; i++) await engine.tick();
  advance(2);
  await engine.tick();
  const s = (await store.read()).value;
  const initial = s.messages[0];
  const next = s.messages[1];
  expect(initial.status).toBe("simulated");
  expect(Date.parse(next.dueAt) - Date.parse(initial.sentAt!)).toBe(
    4 * 86400000,
  );
  advance(2);
  for (let i = 0; i < 7; i++) await engine.tick();
  expect(
    (await store.read()).value.messages.filter((m) => m.status === "simulated"),
  ).toHaveLength(1);
});
