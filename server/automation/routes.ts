import { WorkflowError } from "./errors.js";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { GrowthEngine } from "./engine.js";
import { audit, mutate } from "./state.js";
import {
  policySchema,
  policyHash,
  consentSchema,
  recordConsent,
} from "./policy.js";
import type { GmailMailbox } from "./providers.js";
import type { Contact, Message } from "../../shared/automation.js";
export function publicUnsubscribe(engine: GrowthEngine) {
  const router = express.Router();
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  router.get("/:token", (req, res) => {
    if (!engine.verifyUnsubscribe(String(req.params.token))) {
      res
        .status(400)
        .type("text")
        .send(
          "This unsubscribe link is invalid. Reply unsubscribe to the sender instead.",
        );
      return;
    }
    res
      .type("html")
      .send(
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe from ChurnAutopsy</title><main><h1>Stop ChurnAutopsy outreach</h1><p>Confirm to permanently stop outreach to this address.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></html>',
      );
  });
  router.post(
    "/:token",
    express.urlencoded({ extended: false, limit: "1kb" }),
    async (req, res) => {
      const ok = await engine.unsubscribe(String(req.params.token));
      res
        .status(ok ? 200 : 400)
        .type("text")
        .send(
          ok
            ? "You are unsubscribed. No further outreach will be sent."
            : "Invalid unsubscribe link. Reply unsubscribe to the sender instead.",
        );
    },
  );
  return router;
}
export function automationRouter(
  engine: GrowthEngine,
  gmail?: GmailMailbox,
  testRecipient?: string,
) {
  const router = express.Router();
  // Emergency stop remains available even after the normal mutation limit is reached.
  router.post("/pause", async (_req, res) => {
    await engine.pause();
    res.json({ ok: true });
  });

  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      skip: (req) => req.method === "GET",
      message: {
        error: "Automation request limit reached; retry in one minute.",
      },
    }),
  );
  router.get(
    "/",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      message: { error: "Refresh limit reached; retry in one minute." },
    }),
    async (_req, res) => res.json(await engine.view()),
  );
  router.post("/dry-run", async (_req, res) => {
    await engine.dryRun();
    res.json({ ok: true });
  });
  router.post("/tick", async (_req, res) =>
    res.json({ worked: await engine.tick() }),
  );
  router.put("/policy", async (req, res) => {
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Invalid policy. Check sender details, limits, countries, and follow-up days.",
      });
      return;
    }
    await mutate(engine.store, (s) => {
      if (s.jobs.some((j) => j.state === "running"))
        throw new WorkflowError("Pause and wait for running work");
      s.policy = parsed.data;
      s.approval = undefined;
      s.testReceipt = undefined;
      s.sendingEnabled = false;
      s.paused = true;
      for (const m of s.messages.filter((m) => m.status === "queued"))
        m.status = "cancelled";
      audit(
        s,
        "policy_changed",
        "campaign",
        "Approval invalidated; sending paused",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/approve", async (req, res) => {
    const input = z
      .object({
        mode: z.enum(["dry_run", "live"]),
        confirmation: z.literal("APPROVE CAMPAIGN POLICY"),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success) {
      res
        .status(400)
        .json({ error: "Explicit master policy approval required" });
      return;
    }
    await mutate(engine.store, (s) => {
      if (s.jobs.some((j) => j.state === "running"))
        throw new WorkflowError("Wait for running jobs");
      if (!s.policy.senderName || s.policy.postalAddress.length < 10)
        throw new WorkflowError("Sender details required");
      if (
        input.data.mode === "live" &&
        /fictional|demo|example street/i.test(s.policy.postalAddress)
      )
        throw new WorkflowError("A real postal mailing address is required");
      if (s.mode !== input.data.mode) {
        s.nextDiscoveryAt = undefined;
        s.nextSyncAt = undefined;
      }
      s.mode = input.data.mode;
      s.paused = true;
      s.sendingEnabled = false;
      s.approval = {
        hash: policyHash(s.policy),
        at: engine.now().toISOString(),
        mode: s.mode,
      };
      audit(
        s,
        "policy_approved",
        "campaign",
        `${s.mode}; express consent only; max two follow-ups`,
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/resume", async (_req, res) => {
    await mutate(engine.store, (s) => {
      if (
        !s.approval ||
        s.approval.hash !== policyHash(s.policy) ||
        s.approval.mode !== s.mode
      )
        throw new WorkflowError("Current policy approval required");
      s.paused = false;
      audit(
        s,
        "automation_resumed",
        "campaign",
        "Sending switch unchanged",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/activate", async (req, res) => {
    if (
      req.body?.confirmation !== "ENABLE LIVE SENDING" ||
      !engine.config.liveSendingConfigured
    ) {
      res.status(409).json({
        error:
          "Live sending needs explicit approval and the server activation gate.",
      });
      return;
    }
    await mutate(engine.store, (s) => {
      if (
        s.mode !== "live" ||
        s.approval?.mode !== "live" ||
        s.approval.hash !== policyHash(s.policy) ||
        !s.testReceipt ||
        !s.testReceipt.confirmedAt ||
        s.testReceipt.policyHash !== policyHash(s.policy) ||
        engine.now().getTime() - Date.parse(s.testReceipt.at) > 7 * 86400000 ||
        !engine.config.unsubscribeBase ||
        engine.config.unsubscribeSecret.length < 32 ||
        s.messages.some((m) => m.status === "uncertain") ||
        s.policy.searchCredits === 0 ||
        s.policy.verificationCredits === 0 ||
        !engine.config.paidHunterEnabled
      )
        throw new WorkflowError("Activation prerequisites incomplete");
      s.sendingEnabled = true;
      s.paused = false;
      audit(
        s,
        "live_sending_enabled",
        "campaign",
        "Explicit owner activation after policy and mailbox test",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/consents", async (req, res) => {
    const input = z
      .object({ records: z.array(consentSchema).min(1).max(50) })
      .strict()
      .safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        error:
          "Provide dated express-consent evidence, scope, jurisdiction, source URL and expiry for each record.",
      });
      return;
    }
    await mutate(engine.store, (s) => {
      for (const c of input.data.records) recordConsent(s, c, engine.now());
      audit(
        s,
        "consents_imported",
        "consent",
        `${input.data.records.length} evidence records; suppressions preserved`,
        engine.now(),
      );
    });
    const s = (await engine.store.read()).value;
    for (const c of s.contacts.filter((c) =>
      input.data.records.some((r) => r.email === c.email),
    ))
      await engine.plan(c.id);
    res.json({ ok: true });
  });
  router.post("/simulate-reply", async (req, res) => {
    const input = z
      .object({
        contactId: z.uuid(),
        text: z.string().min(1).max(2000),
        bounce: z.boolean().default(false),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success) {
      res
        .status(400)
        .json({ error: "Choose a fictional contact and reply text" });
      return;
    }
    const s = (await engine.store.read()).value;
    const c = s.contacts.find(
      (c) => c.id === input.data.contactId && c.mode === "dry_run",
    );
    if (!c || s.mode !== "dry_run") {
      res
        .status(409)
        .json({ error: "Simulation is restricted to dry-run contacts" });
      return;
    }
    await engine.receive(
      {
        id: `simulated-${randomUUID()}`,
        threadId: "",
        from: c.email,
        text: input.data.text,
        at: engine.now().toISOString(),
        bounce: input.data.bounce,
      },
      "dry_run",
    );
    res.json({ ok: true });
  });
  router.patch("/opportunities/:id", async (req, res) => {
    const input = z
      .object({
        stage: z.enum([
          "interested",
          "audit_requested",
          "in_progress",
          "converted",
          "closed",
        ]),
        notes: z.string().max(2000),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid opportunity update" });
      return;
    }
    await mutate(engine.store, (s) => {
      const o = s.opportunities.find((o) => o.id === req.params.id);
      if (!o) throw new WorkflowError("Opportunity missing");
      Object.assign(o, input.data, { updatedAt: engine.now().toISOString() });
      audit(s, "opportunity_updated", o.id, o.stage, engine.now());
    });
    res.json({ ok: true });
  });
  router.post("/alerts/:id/acknowledge", async (req, res) => {
    await mutate(engine.store, (s) => {
      const a = s.alerts.find((a) => a.id === req.params.id);
      if (a) a.acknowledged = true;
    });
    res.json({ ok: true });
  });
  router.post("/jobs/:id/retry", async (req, res) => {
    await mutate(engine.store, (s) => {
      const j = s.jobs.find((j) => j.id === req.params.id);
      if (!j || j.kind === "send" || j.state !== "failed")
        throw new WorkflowError(
          "Only failed, non-delivery jobs may be retried",
        );
      j.state = "queued";
      j.attempts = 0;
      j.dueAt = engine.now().toISOString();
      audit(
        s,
        "job_retry_requested",
        j.id,
        "Owner requested bounded retry",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/messages/:id/resolve", async (req, res) => {
    if (req.body?.confirmation !== "CANCEL WITHOUT RESENDING") {
      res.status(400).json({
        error:
          "Reconcile Gmail Sent first; confirm cancellation without resend",
      });
      return;
    }
    await mutate(engine.store, (s) => {
      const m = s.messages.find(
        (m) => m.id === req.params.id && m.status === "uncertain",
      );
      if (!m) throw new WorkflowError("Uncertain message not found");
      m.status = "cancelled";
      const c = s.contacts.find((c) => c.id === m.contactId);
      if (c) c.stopped = "uncertain_delivery";
      for (const next of s.messages.filter(
        (next) => next.contactId === m.contactId && next.status === "queued",
      ))
        next.status = "cancelled";
      audit(
        s,
        "uncertain_delivery_closed",
        m.id,
        "Owner reconciled; recipient stopped without resend",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/confirm-mailbox-test", async (req, res) => {
    if (req.body?.confirmation !== "CONFIRM RECEIPT AND UNSUBSCRIBE") {
      res.status(400).json({
        error: "Confirm actual test receipt and unsubscribe verification",
      });
      return;
    }
    await mutate(engine.store, (s) => {
      const test = s.testReceipt;
      if (
        !test ||
        test.policyHash !== policyHash(s.policy) ||
        !test.contactId ||
        !s.contacts.some(
          (c) => c.id === test.contactId && c.stopped === "unsubscribe",
        ) ||
        !s.suppressions[test.recipient.toLowerCase()]
      )
        throw new WorkflowError(
          "Open the received test email and complete its unsubscribe link before confirming.",
        );
      test.confirmedAt = engine.now().toISOString();
      audit(
        s,
        "mailbox_test_confirmed",
        test.contactId,
        "Owner confirmed receipt; unsubscribe was exercised",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  router.post("/mailbox-test", async (req, res) => {
    if (
      req.body?.confirmation !== "SEND TEST TO CONFIGURED RECIPIENT" ||
      !engine.config.testSendingConfigured ||
      !gmail ||
      !testRecipient ||
      !z.email().safeParse(testRecipient).success
    ) {
      res.status(409).json({
        error:
          "Mailbox tests require explicit approval, a configured allowlisted recipient, and the test-send gate.",
      });
      return;
    }
    const id = randomUUID();
    const policy = await mutate(engine.store, (s) => {
      if (
        !s.policy.senderName ||
        !s.policy.postalAddress ||
        !engine.config.unsubscribeBase
      )
        throw new WorkflowError("Sender and unsubscribe setup required");
      const day = engine.now().toISOString().slice(0, 10);
      const key = `mailbox_test:${day}`;
      if ((s.dailySends[key] ?? 0) >= 3)
        throw new WorkflowError("Three-test daily limit reached");
      s.dailySends[key] = (s.dailySends[key] ?? 0) + 1;
      audit(
        s,
        "mailbox_test_reserved",
        id,
        "Explicit test only; no automatic retry",
        engine.now(),
      );
      return s.policy;
    });
    const c: Contact = {
      id,
      mode: "live",
      domain: "test.example",
      email: testRecipient,
      name: "Mailbox test",
      role: "Test recipient",
      sources: [],
      verification: "unknown",
      eligibility: {
        allowed: false,
        reasons: ["Test only"],
        checkedAt: engine.now().toISOString(),
        policyHash: "",
      },
    };
    // Persist the test contact so the actual unsubscribe endpoint can be tested end-to-end.
    await mutate(engine.store, (s) => {
      s.contacts.push({ ...c, stopped: "test_only" });
    });
    const m: Message = {
      id,
      contactId: id,
      mode: "live",
      step: 0,
      subject: "ChurnAutopsy mailbox configuration test",
      body: `This is an explicitly requested configuration test, not prospect outreach.\n${policy.senderName}\n${policy.postalAddress}`,
      policyHash: policyHash(policy),
      evidenceUrls: [],
      dueAt: engine.now().toISOString(),
      status: "sending",
    };
    const result = await gmail.send(
      m,
      c,
      engine.unsubscribeUrl(id),
      policy.senderName,
    );
    await mutate(engine.store, (s) => {
      s.testReceipt = {
        at: engine.now().toISOString(),
        providerId: result.id,
        recipient: testRecipient,
        contactId: id,
        policyHash: policyHash(policy),
      };
      audit(
        s,
        "mailbox_test_sent",
        id,
        "Confirm receipt and unsubscribe externally before activation",
        engine.now(),
      );
    });
    res.json({ ok: true });
  });
  return router;
}
