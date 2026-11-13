import { WorkflowError } from "./errors.js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AutomationState,
  Contact,
  ExecutionMode,
  Job,
  JobKind,
  Message,
  Usage,
} from "../../shared/automation.js";
import { defaultPolicy } from "../../shared/automation.js";
import { searchProfiles } from "../../shared/searches.js";
import type { Store } from "../store.js";
import { audit, alert, mutate, type AutomationStore } from "./state.js";
import { evaluate, policyHash } from "./policy.js";
import type { Incoming, Providers } from "./providers.js";
export interface EngineConfig {
  liveSendingConfigured: boolean;
  paidHunterEnabled: boolean;
  testSendingConfigured: boolean;
  workerEnabled: boolean;
  unsubscribeBase: string;
  unsubscribeSecret: string;
}
export const safeEngineConfig: EngineConfig = {
  liveSendingConfigured: false,
  paidHunterEnabled: false,
  testSendingConfigured: false,
  workerEnabled: false,
  unsubscribeBase: "",
  unsubscribeSecret: "",
};
export function calendarKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function usage(s: AutomationState, mode: ExecutionMode, now: Date): Usage {
  return (s.usage[`${mode}:${calendarKey(now).slice(0, 7)}`] ??= {
    discovery: 0,
    search: 0,
    verification: 0,
    sends: 0,
    simulated: 0,
  });
}
function queue(
  s: AutomationState,
  kind: JobKind,
  target: string,
  mode: ExecutionMode,
  key: string,
  due: Date,
) {
  if (s.jobs.some((j) => j.key === key)) return;
  s.jobs.push({
    id: randomUUID(),
    key,
    kind,
    target,
    mode,
    dueAt: due.toISOString(),
    state: "queued",
    attempts: 0,
  });
}
function prospectKey(mode: ExecutionMode, domain: string) {
  return `${mode}:${domain}`;
}
export function stopContact(
  s: AutomationState,
  c: Contact,
  reason: string,
  now: Date,
  suppress = false,
) {
  c.stopped = reason;
  c.eligibility = {
    ...c.eligibility,
    allowed: false,
    reasons: [`Contact stopped: ${reason}`],
    checkedAt: now.toISOString(),
  };
  if (suppress && !s.suppressions[c.email])
    s.suppressions[c.email] = { at: now.toISOString(), reason };
  for (const m of s.messages.filter(
    (m) => m.contactId === c.id && m.status === "queued",
  ))
    m.status = "cancelled";
  for (const j of s.jobs.filter(
    (j) =>
      j.kind === "send" &&
      s.messages.some((m) => m.id === j.target && m.contactId === c.id) &&
      j.state === "queued",
  ))
    j.state = "cancelled";
  audit(s, "contact_stopped", c.id, reason, now);
}
export function classifyReply(text: string, bounce = false): IncomingCategory {
  if (bounce) return "bounce";
  if (
    /unsubscribe|remove me|stop (?:emailing|contacting)|do not (?:email|contact)/i.test(
      text,
    )
  )
    return "unsubscribe";
  if (/not interested|no thanks|no thank you|not a fit/i.test(text))
    return "not_interested";
  if (/out of (?:the )?office|automatic reply|auto.?reply/i.test(text))
    return "needs_attention";
  if (
    /(?:interested|yes[,! .]|send (?:me |us )?(?:details|more)|(?:request|like|want) (?:a |the |your )?(?:free )?audit)/i.test(
      text,
    )
  )
    return "interested";
  return "needs_attention";
}
type IncomingCategory = AutomationState["replies"][number]["category"];
export class GrowthEngine {
  constructor(
    readonly store: AutomationStore,
    private companies: Store,
    private mock: Providers,
    private live: Providers | undefined,
    readonly config: EngineConfig = safeEngineConfig,
    readonly now = () => new Date(),
  ) {}
  private provider(mode: ExecutionMode) {
    if (mode === "dry_run") {
      if (this.mock.kind !== "mock")
        throw new WorkflowError("Invalid dry-run provider");
      return this.mock;
    }
    if (!this.live || this.live.kind !== "live")
      throw new WorkflowError("Live providers not configured");
    return this.live;
  }
  async view() {
    const s = (await this.store.read()).value;
    return {
      ...s,
      capabilities: {
        ...this.config,
        unsubscribeBase: undefined,
        unsubscribeSecret: undefined,
        unsubscribeConfigured:
          !!this.config.unsubscribeBase &&
          this.config.unsubscribeSecret.length >= 32,
      },
    };
  }
  async pause() {
    await mutate(this.store, (s) => {
      s.paused = true;
      s.sendingEnabled = false;
      audit(
        s,
        "emergency_pause",
        "campaign",
        "New work and dispatch disabled",
        this.now(),
      );
    });
  }
  async dryRun() {
    await mutate(this.store, (s) => {
      if (s.jobs.some((j) => j.state === "running"))
        throw new WorkflowError("Wait for the active job before changing mode");
      s.mode = "dry_run";
      s.paused = false;
      s.sendingEnabled = false;
      if (!s.policy.senderName || !s.policy.postalAddress)
        s.policy = {
          ...defaultPolicy,
          senderName: "ChurnAutopsy Demo",
          postalAddress: "123 Example Street, Fictional City (demo only)",
        };
      s.approval = {
        hash: policyHash(s.policy),
        at: this.now().toISOString(),
        mode: "dry_run",
      };
      queue(
        s,
        "discover",
        "",
        s.mode,
        `dry-discovery:${randomUUID()}`,
        this.now(),
      );
      s.nextDiscoveryAt = new Date(
        this.now().getTime() + s.policy.intervalHours * 3600000,
      ).toISOString();
      audit(
        s,
        "dry_run_started",
        "campaign",
        "Fictional data; no external calls",
        this.now(),
      );
    });
  }
  async schedule() {
    await mutate(this.store, (s) => {
      const now = this.now();
      s.lastHeartbeat = now.toISOString();
      // Recovery never retries a potentially dispatched message.
      for (const j of s.jobs.filter(
        (j) =>
          j.state === "running" &&
          Date.parse(j.leaseUntil ?? "") <= now.getTime(),
      )) {
        if (j.kind === "send") {
          const m = s.messages.find((m) => m.id === j.target);
          if (m?.status === "sending") {
            m.status = "uncertain";
            s.paused = true;
            s.sendingEnabled = false;
            alert(
              s,
              "A delivery outcome is uncertain. Reconcile the Sent mailbox before restarting.",
              now,
            );
          }
          j.state = "failed";
          j.error = "Interrupted delivery; never automatically retried";
        } else {
          j.state = j.attempts >= 3 ? "failed" : "queued";
          j.dueAt = now.toISOString();
        }
        audit(s, "job_recovered", j.id, j.state, now);
      }
      if (s.paused) return;
      if (
        !s.nextDiscoveryAt ||
        Date.parse(s.nextDiscoveryAt) <= now.getTime()
      ) {
        queue(
          s,
          "discover",
          "",
          s.mode,
          `discovery:${s.mode}:${now.toISOString().slice(0, 13)}`,
          now,
        );
        s.nextDiscoveryAt = new Date(
          now.getTime() + s.policy.intervalHours * 3600000,
        ).toISOString();
      }
      if (
        s.mode === "live" &&
        (!s.nextSyncAt || Date.parse(s.nextSyncAt) <= now.getTime())
      ) {
        queue(
          s,
          "sync",
          "",
          s.mode,
          `sync:${Math.floor(now.getTime() / 300000)}`,
          now,
        );
        s.nextSyncAt = new Date(now.getTime() + 300000).toISOString();
      }
      // Bound the working queue; immutable PostgreSQL audit is not pruned.
      if (s.jobs.length > 1500)
        s.jobs = s.jobs.filter(
          (j) =>
            ["queued", "running"].includes(j.state) ||
            Date.parse(j.dueAt) > now.getTime() - 30 * 86400000,
        );
      if (s.jobs.length > 3000) {
        s.paused = true;
        s.sendingEnabled = false;
        alert(
          s,
          "Queue capacity reached. Archive completed work before resuming.",
          now,
        );
      }
    });
  }
  async tick(): Promise<boolean> {
    await this.schedule();
    const job = await mutate(this.store, (s) => {
      const now = this.now();
      if (s.paused || s.jobs.some((j) => j.state === "running"))
        return undefined;
      const j = s.jobs
        .filter(
          (j) =>
            j.state === "queued" &&
            j.mode === s.mode &&
            Date.parse(j.dueAt) <= now.getTime(),
        )
        .sort(
          (a, b) =>
            Number(b.kind === "sync") - Number(a.kind === "sync") ||
            a.dueAt.localeCompare(b.dueAt),
        )[0];
      if (!j) return undefined;
      j.state = "running";
      j.attempts++;
      j.leaseUntil = new Date(now.getTime() + 30 * 60000).toISOString();
      audit(s, "job_claimed", j.id, j.kind, now);
      return structuredClone(j);
    });
    if (!job) return false;
    try {
      await this.execute(job);
      await mutate(this.store, (s) => {
        const j = s.jobs.find((j) => j.id === job.id)!;
        if (j.state === "running") j.state = "done";
        audit(s, "job_completed", j.id, j.kind, this.now());
      });
    } catch (error) {
      await mutate(this.store, (s) => {
        const j = s.jobs.find((j) => j.id === job.id)!;
        const m = s.messages.find((m) => m.id === j.target);
        if (j.kind === "send" && m?.status === "sending") {
          m.status = "uncertain";
          s.paused = true;
          s.sendingEnabled = false;
        }
        j.state = j.kind === "send" || j.attempts >= 3 ? "failed" : "queued";
        j.dueAt = new Date(
          this.now().getTime() + Math.pow(2, j.attempts) * 60000,
        ).toISOString();
        j.error =
          error instanceof WorkflowError
            ? error.message
            : "Provider or persistence unavailable. Check configuration and activity; credentials are redacted.";
        if (j.state === "failed" || j.kind === "sync")
          alert(
            s,
            j.kind === "send"
              ? "Delivery needs reconciliation; automatic resend disabled."
              : "Automation job failed; check provider access, budgets and configuration.",
            this.now(),
          );
        audit(s, "job_failed", j.id, j.error, this.now());
      });
    }
    return true;
  }
  private async reserve(
    kind: "discovery" | "search" | "verification",
    mode: ExecutionMode,
  ) {
    await mutate(this.store, (s) => {
      if (s.paused || s.mode !== mode)
        throw new WorkflowError("Automation paused");
      if (
        mode === "live" &&
        kind !== "discovery" &&
        !this.config.paidHunterEnabled
      )
        throw new WorkflowError("Paid calls disabled");
      const u = usage(s, mode, this.now());
      const limit =
        kind === "discovery"
          ? s.policy.discoveryRequests
          : kind === "search"
            ? s.policy.searchCredits
            : s.policy.verificationCredits;
      if (mode === "live" && u[kind] >= limit)
        throw new WorkflowError("Budget exhausted");
      u[kind]++;
      audit(s, "credit_reserved", "usage", `${mode}:${kind}`, this.now());
    });
  }
  private async execute(job: Job) {
    const p = this.provider(job.mode);
    const now = this.now();
    if (job.kind === "discover") {
      await this.reserve("discovery", job.mode);
      const index = (await this.store.read()).value.profileIndex;
      const companies = await p.discover(
        searchProfiles[index % searchProfiles.length].id,
      );
      if (job.mode === "live") await this.companies.discover(companies);
      const current =
        job.mode === "live" ? await this.companies.list() : companies;
      await mutate(this.store, (s) => {
        s.profileIndex++;
        for (const company of current
          .filter(
            (c) =>
              companies.some((v) => v.domain === c.domain) ||
              !s.prospects[prospectKey(job.mode, c.domain)],
          )
          .slice(0, 20)) {
          s.prospects[prospectKey(job.mode, company.domain)] = company;
          if (company.status !== "rejected")
            queue(
              s,
              "research",
              company.domain,
              job.mode,
              `research:${job.mode}:${company.domain}:${calendarKey(now)}`,
              now,
            );
        }
      });
      return;
    }
    if (job.kind === "research") {
      const q = await p.research(job.target);
      if (!q) throw new WorkflowError("No assessment");
      if (job.mode === "live")
        await this.companies.setQualification(job.target, q);
      await mutate(this.store, (s) => {
        const c = s.prospects[prospectKey(job.mode, job.target)];
        if (!c) return;
        c.qualification = q;
        if (
          q.classification === "confirmed" &&
          c.status !== "rejected" &&
          !q.flags.includes("no_solicitation")
        )
          queue(
            s,
            "contacts",
            job.target,
            job.mode,
            `contacts:${job.mode}:${job.target}`,
            now,
          );
        audit(
          s,
          "company_classified",
          job.target,
          `${q.classification}; confidence is rule-based, not verified revenue or churn`,
          now,
        );
      });
      return;
    }
    if (job.kind === "contacts") {
      await this.reserve("search", job.mode);
      const contacts = await p.contacts(job.target);
      await mutate(this.store, (s) => {
        for (const found of contacts.slice(0, 1)) {
          if (
            s.contacts.some(
              (c) => c.mode === job.mode && c.email === found.email,
            )
          )
            continue;
          const c: Contact = {
            ...found,
            id: randomUUID(),
            mode: job.mode,
            domain: job.target,
            verification: "pending",
            eligibility: {
              allowed: false,
              reasons: ["Not assessed"],
              checkedAt: now.toISOString(),
              policyHash: "",
            },
          };
          s.contacts.push(c);
          if (job.mode === "dry_run" && found.email.endsWith(".example"))
            s.consents.push({
              email: found.email,
              country: "US",
              basis: "express_consent",
              scope: "churnautopsy_audit_outreach",
              source: `https://${job.target}/demo-consent`,
              statement:
                "Fictional express consent fixture for dry-run testing only.",
              obtainedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
              recordedAt: now.toISOString(),
            });
          queue(
            s,
            "verify",
            c.id,
            job.mode,
            `verify:${c.id}:${calendarKey(now)}`,
            now,
          );
        }
      });
      return;
    }
    if (job.kind === "verify") {
      const c = (await this.store.read()).value.contacts.find(
        (c) => c.id === job.target,
      );
      if (!c) return;
      await this.reserve("verification", job.mode);
      const result = await p.verify(c.email);
      await mutate(this.store, (s) => {
        const contact = s.contacts.find((c) => c.id === job.target)!;
        contact.verification = result;
        contact.verifiedAt = now.toISOString();
        if (result === "invalid")
          stopContact(s, contact, "invalid_address", now, true);
        queue(
          s,
          "plan",
          contact.id,
          job.mode,
          `plan:${contact.id}:${policyHash(s.policy)}`,
          now,
        );
      });
      return;
    }
    if (job.kind === "plan") {
      await this.plan(job.target);
      return;
    }
    if (job.kind === "sync") {
      await this.sync(p);
      return;
    }
    if (job.kind === "send") await this.dispatch(job);
  }
  async plan(id: string) {
    const now = this.now();
    await mutate(this.store, (s) => {
      const c = s.contacts.find((c) => c.id === id);
      if (!c || c.mode !== s.mode) return;
      const company = s.prospects[prospectKey(c.mode, c.domain)];
      c.eligibility = evaluate(s, c, company, now);
      if (!c.eligibility.allowed) {
        audit(
          s,
          "eligibility_denied",
          c.id,
          c.eligibility.reasons.join("; "),
          now,
        );
        return;
      }
      if (
        s.messages.some((m) => m.contactId === id && m.status !== "cancelled")
      )
        return; // One lifetime sequence; no automatic re-enrolment.
      for (let step = 0; step < 3; step++) {
        const due = new Date(
          now.getTime() +
            (step === 0 ? 0 : s.policy.followUpDays[step - 1] * 86400000),
        );
        const message: Message = {
          id: randomUUID(),
          contactId: id,
          mode: c.mode,
          step,
          subject:
            step === 0
              ? "A free churn audit for your SaaS team"
              : "Re: A free churn audit for your SaaS team",
          body: compose(s, c, company!.name, step),
          policyHash: policyHash(s.policy),
          evidenceUrls: company!.qualification!.evidence.map((e) => e.url),
          dueAt: due.toISOString(),
          status: "queued",
        };
        s.messages.push(message);
        queue(s, "send", message.id, c.mode, `send:${message.id}`, due);
      }
      audit(
        s,
        "sequence_planned",
        id,
        "Initial email and at most two follow-ups; evidence-based template",
        now,
      );
    });
  }
  async sync(p: Providers) {
    const state = (await this.store.read()).value;
    const since =
      state.lastSyncAt ??
      new Date(this.now().getTime() - 7 * 86400000).toISOString();
    const incoming = await p.inbox(since);
    for (const event of incoming)
      await this.receive(event, p.kind === "mock" ? "dry_run" : "live");
    await mutate(this.store, (s) => {
      s.lastSyncAt = this.now().toISOString();
    });
  }
  async receive(event: Incoming, mode: ExecutionMode) {
    await mutate(this.store, (s) => {
      if (s.replies.some((r) => r.id === event.id)) return;
      const contact = s.contacts.find(
        (c) =>
          c.mode === mode &&
          (c.email === event.from ||
            (event.bounce && event.text.toLowerCase().includes(c.email)) ||
            s.messages.some(
              (m) => m.contactId === c.id && m.threadId === event.threadId,
            )),
      );
      if (!contact) return;
      // Strip quoted conversation before interpreting intent. Every reply stops follow-ups regardless of classification.
      const text = event.text
        .split(/\nOn .+wrote:|\n> |\n-- ?\n/)[0]
        .slice(0, 4000);
      const category = classifyReply(text, event.bounce);
      s.replies.push({
        id: event.id,
        contactId: contact.id,
        text,
        receivedAt: event.at,
        category,
      });
      stopContact(
        s,
        contact,
        category,
        this.now(),
        ["unsubscribe", "bounce", "not_interested"].includes(category),
      );
      if (
        category === "interested" &&
        !s.opportunities.some((o) => o.contactId === contact.id)
      ) {
        s.opportunities.push({
          id: randomUUID(),
          contactId: contact.id,
          stage: /audit/i.test(text) ? "audit_requested" : "interested",
          createdAt: this.now().toISOString(),
          updatedAt: this.now().toISOString(),
          notes: "",
        });
        alert(
          s,
          "An interested prospect replied. Review the opportunity before arranging an audit.",
          this.now(),
        );
      } else if (category === "needs_attention")
        alert(
          s,
          "A reply needs your attention. Follow-ups have stopped.",
          this.now(),
        );
      audit(s, "reply_received", contact.id, category, this.now());
    });
  }
  private async dispatch(job: Job) {
    const p = this.provider(job.mode);
    const before = (await this.store.read()).value;
    const pending = before.messages.find((m) => m.id === job.target);
    if (!pending || pending.status !== "queued") return;
    if (pending.step > 0) {
      const previous = before.messages.find(
        (m) =>
          m.contactId === pending.contactId &&
          m.step === pending.step - 1 &&
          m.status !== "cancelled",
      );
      if (previous && ["queued", "sending"].includes(previous.status)) {
        await this.defer(job, 3600000);
        return;
      }
    }
    const subject = before.contacts.find((c) => c.id === pending.contactId);
    if (!subject) return;
    if (
      job.mode === "live" &&
      (!before.sendingEnabled || !this.config.liveSendingConfigured)
    ) {
      await this.defer(job, 3600000);
      return;
    }
    const day = `${job.mode}:${calendarKey(this.now())}`;
    const reservedUsage = usage(before, job.mode, this.now());
    if (
      (before.dailySends[day] ?? 0) >= before.policy.dailyLimit ||
      (job.mode === "live" ? reservedUsage.sends : reservedUsage.simulated) >=
        before.policy.monthlyLimit
    ) {
      await this.defer(job, 86400000);
      return;
    }
    // Refresh evidence and verification before follow-ups, not just at initial enrolment.
    const prior =
      before.prospects[prospectKey(job.mode, subject.domain)]?.qualification;
    if (
      !subject.stopped &&
      !before.suppressions[subject.email] &&
      (!prior ||
        this.now().getTime() - Date.parse(prior.checkedAt) > 23 * 3600000)
    ) {
      const q = await p.research(subject.domain);
      if (q) {
        if (job.mode === "live")
          await this.companies.setQualification(subject.domain, q);
        await mutate(this.store, (s) => {
          const c = s.prospects[prospectKey(job.mode, subject.domain)];
          if (c) c.qualification = q;
        });
      }
    }
    if (
      !subject.stopped &&
      this.now().getTime() - Date.parse(subject.verifiedAt ?? "1970-01-01") >
        6 * 86400000
    ) {
      await this.reserve("verification", job.mode);
      const verification = await p.verify(subject.email);
      await mutate(this.store, (s) => {
        const c = s.contacts.find((c) => c.id === subject.id)!;
        c.verification = verification;
        c.verifiedAt = this.now().toISOString();
      });
    }
    // Refresh inbound state before every real dispatch; inbox outages fail closed.
    if (job.mode === "live") await this.sync(p);
    const currentCompanies =
      job.mode === "live" ? await this.companies.list() : [];
    const reserved = await mutate(this.store, (s) => {
      const m = s.messages.find((m) => m.id === job.target);
      if (!m || m.status !== "queued") return undefined;
      const c = s.contacts.find((c) => c.id === m.contactId)!;
      const now = this.now();
      const company =
        job.mode === "live"
          ? currentCompanies.find((row) => row.domain === c.domain)
          : s.prospects[prospectKey(c.mode, c.domain)];
      if (company) s.prospects[prospectKey(c.mode, c.domain)] = company;
      c.eligibility = evaluate(s, c, company, now);
      if (
        s.paused ||
        s.mode !== job.mode ||
        !c.eligibility.allowed ||
        m.policyHash !== policyHash(s.policy)
      ) {
        m.status = "cancelled";
        audit(
          s,
          "send_blocked",
          m.id,
          "Final eligibility, policy, or pause check denied dispatch",
          now,
        );
        return undefined;
      }
      if (
        m.step > 0 &&
        !s.messages.some(
          (previous) =>
            previous.contactId === c.id &&
            previous.step === m.step - 1 &&
            ["sent", "simulated"].includes(previous.status),
        )
      ) {
        m.status = "cancelled";
        return undefined;
      }
      if (
        job.mode === "live" &&
        (!this.config.liveSendingConfigured ||
          !s.sendingEnabled ||
          !s.testReceipt ||
          !s.testReceipt.confirmedAt ||
          s.testReceipt.policyHash !== policyHash(s.policy) ||
          !this.config.unsubscribeBase ||
          this.config.unsubscribeSecret.length < 32 ||
          !s.lastSyncAt ||
          now.getTime() - Date.parse(s.lastSyncAt) > 120000)
      )
        throw new WorkflowError("Live sending gates closed");
      const day = `${job.mode}:${calendarKey(now)}`;
      const u = usage(s, job.mode, now);
      if (
        (s.dailySends[day] ?? 0) >= s.policy.dailyLimit ||
        (job.mode === "live" ? u.sends : u.simulated) >= s.policy.monthlyLimit
      )
        throw new WorkflowError("Send budget exhausted");
      // Reserve before the irreversible operation. A crash after this point is uncertain, never retried.
      s.dailySends[day] = (s.dailySends[day] ?? 0) + 1;
      if (job.mode === "live") u.sends++;
      else u.simulated++;
      if (m.step > 0) {
        const initial = s.messages.find(
          (previous) =>
            previous.contactId === c.id &&
            previous.step === 0 &&
            ["sent", "simulated"].includes(previous.status),
        );
        m.threadId = initial?.threadId;
        m.replyToId = initial?.id;
      }
      m.status = "sending";
      audit(s, "send_reserved", m.id, job.mode, now);
      return {
        message: structuredClone(m),
        contact: structuredClone(c),
        sender: s.policy.senderName,
      };
    });
    if (!reserved) return;
    const link =
      job.mode === "live"
        ? this.unsubscribeUrl(reserved.contact.id)
        : `https://unsubscribe.example/u/demo-${reserved.contact.id}`;
    const sent = await p.send(
      reserved.message,
      reserved.contact,
      link,
      reserved.sender,
    );
    await mutate(this.store, (s) => {
      const m = s.messages.find((m) => m.id === job.target)!;
      m.status = job.mode === "live" ? "sent" : "simulated";
      m.providerId = sent.id;
      m.threadId = sent.threadId;
      m.sentAt = this.now().toISOString();
      // Follow-up intervals start at actual delivery, never at an old plan date.
      for (const next of s.messages.filter(
        (next) =>
          next.contactId === m.contactId &&
          next.step === m.step + 1 &&
          next.status === "queued",
      )) {
        const gap =
          m.step === 0
            ? s.policy.followUpDays[0]
            : s.policy.followUpDays[1] - s.policy.followUpDays[0];
        next.dueAt = new Date(
          this.now().getTime() + gap * 86400000,
        ).toISOString();
        const nextJob = s.jobs.find(
          (j) =>
            j.target === next.id && j.kind === "send" && j.state === "queued",
        );
        if (nextJob) nextJob.dueAt = next.dueAt;
      }
      audit(s, "message_dispatched", m.id, m.status, this.now());
    });
  }
  private async defer(job: Job, delay: number) {
    await mutate(this.store, (s) => {
      const j = s.jobs.find((j) => j.id === job.id)!;
      j.state = "queued";
      j.dueAt = new Date(this.now().getTime() + delay).toISOString();
      j.attempts = Math.max(0, j.attempts - 1);
    });
  }
  unsubscribeUrl(id: string) {
    if (
      this.config.unsubscribeSecret.length < 32 ||
      !this.config.unsubscribeBase.startsWith("https://")
    )
      throw new WorkflowError("Unsubscribe not configured");
    const signature = createHmac("sha256", this.config.unsubscribeSecret)
      .update(id)
      .digest("base64url");
    return `${this.config.unsubscribeBase}/u/${id}.${signature}`;
  }
  verifyUnsubscribe(token: string) {
    const [id, signature, ...rest] = token.split(".");
    if (
      rest.length ||
      !/^[a-f0-9-]{36}$/.test(id ?? "") ||
      !signature ||
      this.config.unsubscribeSecret.length < 32
    )
      return null;
    const expected = createHmac("sha256", this.config.unsubscribeSecret)
      .update(id)
      .digest();
    const received = Buffer.from(signature, "base64url");
    return received.length === expected.length &&
      timingSafeEqual(received, expected)
      ? id
      : null;
  }
  async unsubscribe(token: string) {
    const id = this.verifyUnsubscribe(token);
    if (!id) return false;
    return mutate(this.store, (s) => {
      const c = s.contacts.find((c) => c.id === id);
      if (!c) return false;
      stopContact(s, c, "unsubscribe", this.now(), true);
      return true;
    });
  }
}
function compose(
  s: AutomationState,
  c: Contact,
  company: string,
  step: number,
) {
  const greeting = `Hi ${c.name.split(" ")[0] || "there"},`;
  const content =
    step === 0
      ? `Your public product pages describe subscription software for business teams. I run ChurnAutopsy, an AI-powered SaaS churn analysis platform. Would a free churn audit be useful for ${company}? If so, reply and we can discuss the data and scope. No customer data is needed in your reply.`
      : step === 1
        ? "Following up on the free ChurnAutopsy churn audit offer. If it would be useful, reply and we can discuss whether it fits your needs."
        : "One last note about the free churn audit offer. If now is not a good time, no reply is needed; this is the final follow-up.";
  return `${greeting}\n\n${content}\n\n${s.policy.senderName}\nChurnAutopsy · ${s.policy.senderEmail}\n${s.policy.postalAddress}\nCommercial outreach from ChurnAutopsy. Reply “unsubscribe” or use the link below to opt out.`;
}
