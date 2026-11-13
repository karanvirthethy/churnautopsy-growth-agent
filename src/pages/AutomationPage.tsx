import { useEffect, useState } from "react";
import {
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import type {
  AutomationView,
  CampaignPolicy,
  Opportunity,
} from "../../shared/automation";
import { request } from "../api";
export type AutomationPageName =
  | "Overview"
  | "Contacts"
  | "Campaigns"
  | "Email Sequences"
  | "Inbox"
  | "Opportunities"
  | "Automation Settings"
  | "Usage and Costs";
const pretty = (text: string) => text.replaceAll("_", " ");
const when = (date?: string) =>
  date ? new Date(date).toLocaleString() : "Not yet";
export function AutomationPage({ page }: { page: AutomationPageName }) {
  const [data, setData] = useState<AutomationView>();
  const [draft, setDraft] = useState<CampaignPolicy>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [consents, setConsents] = useState("");
  const [confirm, setConfirm] = useState("");
  async function load() {
    const next = await request<AutomationView>("/automation");
    setData(next);
    setDraft((current) => current ?? next.policy);
  }
  useEffect(() => {
    void load().catch(() =>
      setError(
        "Automation could not load. Apply the new migration and check the connection.",
      ),
    );
    const timer = setInterval(() => void load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, []);
  async function act(
    path: string,
    body: unknown = {},
    method = "POST",
    message = "Workspace updated.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/automation${path}`, method, body);
      await load();
      setNotice(message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Action failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const contact = (id: string) => data?.contacts.find((c) => c.id === id);
  if (!data)
    return (
      <section className="automation-page">
        <p role={error ? "alert" : "status"}>
          {error || "Loading automation workspace…"}
        </p>
        <button
          onClick={() =>
            void load().catch(() =>
              setError("Still unavailable. Check the new migration."),
            )
          }
        >
          Retry loading
        </button>
      </section>
    );
  const activeContacts = data.contacts.filter((c) => c.mode === data.mode);
  const modeOpportunities = data.opportunities.filter((o) =>
    activeContacts.some((c) => c.id === o.contactId),
  );
  const modeReplies = data.replies.filter((r) =>
    activeContacts.some((c) => c.id === r.contactId),
  );
  const messages = data.messages.filter((m) => m.mode === data.mode);
  const pending = data.jobs.filter(
    (j) => j.mode === data.mode && ["queued", "running"].includes(j.state),
  );
  const alerts = data.alerts.filter((a) => !a.acknowledged);
  const setField = <K extends keyof CampaignPolicy>(
    key: K,
    value: CampaignPolicy[K],
  ) => setDraft((d) => d && { ...d, [key]: value });
  return (
    <section className="automation-page">
      <div className="automation-status">
        <div>
          <ShieldCheck size={20} />
          <strong>
            {data.mode === "dry_run" ? "Dry-run workspace" : "Live workspace"}
          </strong>
          <span>
            {data.paused
              ? "Paused"
              : data.sendingEnabled
                ? "Sending enabled"
                : "Research active · sending off"}
          </span>
        </div>
        <button
          className="pause-button"
          disabled={busy}
          onClick={() =>
            void act(
              "/pause",
              {},
              "POST",
              "Emergency pause applied. New sends and jobs are stopped.",
            )
          }
        >
          <Pause size={15} /> Emergency pause
        </button>
      </div>
      {data.mode === "dry_run" && (
        <p className="automation-context">
          Fictional recipients and simulated deliveries. Hunter and Gmail are
          never called in dry-run mode.
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {page === "Overview" && (
        <>
          <div className="operation-heading">
            <div>
              <h2>The next action, in view.</h2>
              <p>
                Discovery becomes evidence. Eligible conversations become
                opportunities.
              </p>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(
                  "/dry-run",
                  {},
                  "POST",
                  "Dry run queued. Run queued work to advance the fictional pipeline.",
                )
              }
            >
              <Play size={16} /> Start dry run
            </button>
          </div>
          <dl className="pipeline-strip">
            {[
              [
                Object.entries(data.prospects).filter(
                  ([key, c]) =>
                    key.startsWith(data.mode + ":") &&
                    c.qualification?.classification === "confirmed",
                ).length,
                "Qualified companies",
              ],
              [
                activeContacts.filter((c) => c.eligibility.allowed).length,
                "Eligible contacts",
              ],
              [
                messages.filter((m) => ["sent", "simulated"].includes(m.status))
                  .length,
                data.mode === "dry_run"
                  ? "Simulated deliveries"
                  : "Sent emails",
              ],
              [modeOpportunities.length, "Opportunities"],
              [
                messages.filter(
                  (m) => m.step > 0 && ["sent", "simulated"].includes(m.status),
                ).length,
                "Follow-ups delivered",
              ],
              [modeReplies.length, "Replies"],
            ].map(([count, label]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <div className="operation-columns">
            <section>
              <h3>
                Work queue <span className="count">{pending.length}</span>
              </h3>
              <p>
                {data.lastHeartbeat
                  ? `Last worker heartbeat: ${when(data.lastHeartbeat)}`
                  : "No worker heartbeat yet. Start a dry run or configure the background worker."}
              </p>
              <button
                disabled={busy || data.paused}
                onClick={() =>
                  void act(
                    "/tick",
                    {},
                    "POST",
                    "One queued job processed. Repeat to advance the pipeline, or use the background worker.",
                  )
                }
              >
                <RefreshCw size={15} /> Run next queued job
              </button>
              <ul className="activity-list">
                {pending.slice(0, 8).map((j) => (
                  <li key={j.id}>
                    <strong>{pretty(j.kind)}</strong>
                    <span>{j.target || "Targeted company search"}</span>
                    <small>
                      {pretty(j.state)} · {when(j.dueAt)}
                    </small>
                  </li>
                ))}
              </ul>
              {!pending.length && (
                <Empty
                  title="No queued work"
                  text="Start a dry run to exercise discovery, qualification, contacts, verification and email simulation."
                />
              )}
            </section>
            <section>
              <h3>
                Needs your attention{" "}
                <span className="count">{alerts.length}</span>
              </h3>
              {!alerts.length && (
                <Empty
                  title="No open alerts"
                  text="Provider failures, uncertain deliveries and interested replies will appear here."
                />
              )}
              {alerts.map((a) => (
                <div className="attention-row" key={a.id}>
                  <AlertTriangle size={17} />
                  <div>
                    <p>{a.message}</p>
                    <small>{when(a.at)}</small>
                    <button
                      disabled={busy}
                      onClick={() => void act(`/alerts/${a.id}/acknowledge`)}
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
          <section className="activity-section">
            <h3>Recent activity</h3>
            <ul className="activity-list">
              {[...data.audit]
                .reverse()
                .slice(0, 12)
                .map((a) => (
                  <li key={a.id}>
                    <strong>{pretty(a.action)}</strong>
                    <span>{a.detail}</span>
                    <small>{when(a.at)}</small>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
      {page === "Contacts" && (
        <>
          <h2>People, evidence, permission.</h2>
          <p>
            Discovery and verification do not establish permission to email.
            Every eligible contact needs current express-consent evidence.
          </p>
          <DataTable
            headers={["Contact", "Verification", "Eligibility", "Evidence"]}
            rows={activeContacts.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <small>{c.role}</small>
                  <span>{c.email}</span>
                </td>
                <td>
                  <span className="state-label">{pretty(c.verification)}</span>
                  <small>{when(c.verifiedAt)}</small>
                </td>
                <td>
                  <strong>
                    {c.stopped
                      ? `Stopped: ${pretty(c.stopped)}`
                      : c.eligibility.allowed
                        ? "Eligible under policy"
                        : "Not eligible"}
                  </strong>
                  <ul>
                    {c.eligibility.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  {c.sources.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      Source <ArrowUpRight size={12} />
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          />
          {!activeContacts.length && (
            <Empty
              title="No contacts discovered yet"
              text="Qualified companies enter decision-maker discovery. Live Hunter calls require an enabled credit budget."
            />
          )}
          <details className="import-panel">
            <summary>Import existing express-consent evidence</summary>
            <p>
              Import records from your existing consent process. Never create
              consent merely because Hunter found an address. Opt-outs cannot be
              removed by this import.
            </p>
            <p>
              JSON array fields: email, country (US/CA), basis
              (express_consent), scope (churnautopsy_audit_outreach), source
              (HTTPS evidence URL), statement, obtainedAt and expiresAt (ISO
              dates).
            </p>
            <label>
              Consent records
              <textarea
                rows={8}
                value={consents}
                onChange={(e) => setConsents(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              onClick={() => {
                try {
                  void act("/consents", { records: JSON.parse(consents) });
                } catch {
                  setError("The import must be a valid JSON array.");
                }
              }}
            >
              Import evidence
            </button>
          </details>
        </>
      )}
      {page === "Campaigns" && draft && (
        <>
          <h2>One policy. Bounded autonomy.</h2>
          <p>
            Approve the campaign rules once. Eligible contacts can then progress
            automatically without individual message approval. Changing the
            policy pauses sending and invalidates approval.
          </p>
          <form
            className="policy-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                "/policy",
                draft,
                "PUT",
                "Policy saved. Approval invalidated and sending paused.",
              );
            }}
          >
            <label>
              Campaign name
              <input
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                required
              />
            </label>
            <label>
              Sender name
              <input
                value={draft.senderName}
                onChange={(e) => setField("senderName", e.target.value)}
                required
              />
            </label>
            <label>
              Sender email
              <input value={draft.senderEmail} readOnly />
            </label>
            <label>
              Postal mailing address
              <input
                value={draft.postalAddress}
                onChange={(e) => setField("postalAddress", e.target.value)}
                required
              />
            </label>
            <label>
              Sender country
              <select
                value={draft.senderCountry}
                onChange={(e) =>
                  setField("senderCountry", e.target.value as "CA" | "US")
                }
              >
                <option value="CA">Canada</option>
                <option value="US">United States</option>
              </select>
            </label>
            <label>
              Recipient countries
              <select
                value={draft.countries.join(",")}
                onChange={(e) =>
                  setField(
                    "countries",
                    e.target.value.split(",") as ("CA" | "US")[],
                  )
                }
              >
                <option value="US,CA">United States and Canada</option>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </label>
            {(
              [
                ["dailyLimit", "Daily send limit", 1, 20],
                ["monthlyLimit", "Monthly send limit", 1, 300],
                ["searchCredits", "Monthly Hunter search credits", 0, 100],
                ["verificationCredits", "Monthly verification credits", 0, 100],
                ["discoveryRequests", "Monthly discovery requests", 1, 100],
                ["intervalHours", "Hours between discovery searches", 6, 168],
                ["minimumScore", "Minimum qualification score", 90, 100],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={draft[key]}
                  onChange={(e) => setField(key, Number(e.target.value))}
                  required
                />
              </label>
            ))}
            <label>
              First follow-up (days after initial delivery)
              <input
                type="number"
                min="3"
                max="14"
                value={draft.followUpDays[0]}
                onChange={(e) =>
                  setField("followUpDays", [
                    Number(e.target.value),
                    draft.followUpDays[1],
                  ])
                }
              />
            </label>
            <label>
              Final follow-up (nominal days after initial delivery)
              <input
                type="number"
                min="7"
                max="30"
                value={draft.followUpDays[1]}
                onChange={(e) =>
                  setField("followUpDays", [
                    draft.followUpDays[0],
                    Number(e.target.value),
                  ])
                }
              />
            </label>
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                Save policy
              </button>
              <span>
                Express consent only · maximum two follow-ups · no re-enrolment
              </span>
            </div>
          </form>
          <section className="approval-section">
            <h3>Master policy approval</h3>
            <p>
              {data.approval
                ? `Approved for ${pretty(data.approval.mode)} on ${when(data.approval.at)}.`
                : "No current approval."}{" "}
              Review sender details, consent scope, budgets and message
              templates before approving.
            </p>
            <label>
              Type APPROVE CAMPAIGN POLICY
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button
              disabled={
                busy ||
                JSON.stringify(draft) !== JSON.stringify(data.policy) ||
                confirm !== "APPROVE CAMPAIGN POLICY"
              }
              onClick={() =>
                void act(
                  "/approve",
                  { mode: "live", confirmation: confirm },
                  "POST",
                  "Live policy approved. Sending remains off until activation.",
                )
              }
            >
              Approve live policy; keep sending off
            </button>
          </section>
        </>
      )}
      {page === "Email Sequences" && (
        <>
          <h2>A short conversation, with a clear stop.</h2>
          <p>
            An initial free-audit offer and up to two follow-ups. Every reply
            stops the sequence. Unsubscribes, bounces and negative replies also
            create permanent suppression records.
          </p>
          <DataTable
            headers={["Recipient", "Step / due", "Delivery", "Message"]}
            rows={messages.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{contact(m.contactId)?.name}</strong>
                  <small>{contact(m.contactId)?.email}</small>
                </td>
                <td>
                  {m.step === 0 ? "Initial offer" : `Follow-up ${m.step}`}
                  <small>{when(m.dueAt)}</small>
                </td>
                <td>
                  <span className="state-label">{pretty(m.status)}</span>
                  <small>{when(m.sentAt)}</small>
                </td>
                <td>
                  <details>
                    <summary>{m.subject}</summary>
                    <p className="email-copy">{m.body}</p>
                    <p>An unsubscribe link is appended at dispatch.</p>
                    {m.evidenceUrls.map((u, i) => (
                      <a href={u} key={i} target="_blank" rel="noreferrer">
                        Supporting source <ArrowUpRight size={12} />
                      </a>
                    ))}
                  </details>
                </td>
              </tr>
            ))}
          />
          {!messages.length && (
            <Empty
              title="No sequences planned"
              text="Qualified contacts with verified addresses and sufficient eligibility evidence are enrolled automatically under the approved policy."
            />
          )}
        </>
      )}
      {page === "Inbox" && (
        <>
          <h2>Replies change the next step.</h2>
          <p>
            All replies pause follow-ups before intent is classified. Interested
            replies create an opportunity; audit delivery always stays with you.
          </p>
          {modeReplies.length ? (
            <div className="reply-list">
              {[...modeReplies].reverse().map((r) => (
                <article key={r.id}>
                  <div>
                    <strong>{contact(r.contactId)?.name}</strong>
                    <span className="state-label">{pretty(r.category)}</span>
                    <small>{when(r.receivedAt)}</small>
                  </div>
                  <p className="email-copy">{r.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No replies yet"
              text="The worker synchronizes the authorized mailbox. Dry-run replies can be simulated below."
            />
          )}
          {data.mode === "dry_run" && (
            <form
              className="simulation-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(
                  "/simulate-reply",
                  { contactId: f.get("contact"), text: f.get("text") },
                  "POST",
                  "Reply classified. Follow-ups stopped and opportunity updated.",
                );
              }}
            >
              <h3>Simulate an incoming reply</h3>
              <label>
                Fictional contact
                <select name="contact" required>
                  {activeContacts.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reply
                <textarea
                  name="text"
                  defaultValue="Yes, I’m interested in a free audit. Please send details."
                  required
                />
              </label>
              <button disabled={busy || !activeContacts.length}>
                Simulate reply
              </button>
            </form>
          )}
        </>
      )}
      {page === "Opportunities" && (
        <>
          <h2>Turn interest into a useful conversation.</h2>
          <p>
            The agent identifies interest. You agree on scope, perform the audit
            and record the outcome.
          </p>
          {modeOpportunities.length ? (
            modeOpportunities.map((o) => (
              <OpportunityEditor
                key={o.id}
                opportunity={o}
                name={contact(o.contactId)?.name ?? "Contact"}
                busy={busy}
                save={(stage, notes) =>
                  void act(`/opportunities/${o.id}`, { stage, notes }, "PATCH")
                }
              />
            ))
          ) : (
            <Empty
              title="No opportunities yet"
              text="An interested reply creates an opportunity automatically. No audit results or commitments are invented."
            />
          )}
        </>
      )}
      {page === "Automation Settings" && (
        <>
          <h2>Autonomy with an off switch.</h2>
          <p>
            Research can run independently of sending. The worker uses persisted
            schedules and resumes after restarts.
          </p>
          <dl className="configuration-list">
            <dt>Worker configured</dt>
            <dd>
              {data.capabilities.workerEnabled
                ? "Yes"
                : "No — manual ticks available for dry runs"}
            </dd>
            <dt>Last heartbeat</dt>
            <dd>{when(data.lastHeartbeat)}</dd>
            <dt>Next discovery</dt>
            <dd>{when(data.nextDiscoveryAt)}</dd>
            <dt>Last mailbox sync</dt>
            <dd>{when(data.lastSyncAt)}</dd>
            <dt>Paid Hunter gate</dt>
            <dd>
              {data.capabilities.paidHunterEnabled ? "Configured" : "Off"}
            </dd>
            <dt>Real sending gate</dt>
            <dd>
              {data.capabilities.liveSendingConfigured
                ? "Configured — policy and switch still required"
                : "Off"}
            </dd>
            <dt>Unsubscribe endpoint</dt>
            <dd>
              {data.capabilities.unsubscribeConfigured
                ? "Configured — verify externally before activation"
                : "Not configured"}
            </dd>
            <dt>Mailbox test</dt>
            <dd>
              {data.testReceipt
                ? `Sent ${when(data.testReceipt.at)}; confirm receipt`
                : "Not completed"}
            </dd>
            <dt>Sending switch</dt>
            <dd>{data.sendingEnabled ? "Enabled" : "Sending disabled"}</dd>
          </dl>
          <div className="control-row">
            <button
              disabled={busy || !data.approval}
              onClick={() => void act("/resume")}
            >
              Resume approved automation
            </button>
            <button
              disabled={busy || data.paused}
              onClick={() => void act("/tick")}
            >
              Run next queued job
            </button>
          </div>
          <section className="approval-section">
            <h3>Mailbox test and activation</h3>
            <p>
              These actions send real email only after their server gates are
              configured. Test sends go solely to TEST_RECIPIENT. Confirm
              receipt and the unsubscribe endpoint before activation.
            </p>
            <label>
              Explicit confirmation
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Enter the confirmation shown below"
              />
            </label>
            <p>For a test: SEND TEST TO CONFIGURED RECIPIENT</p>
            <button
              disabled={
                busy ||
                !data.capabilities.testSendingConfigured ||
                confirm !== "SEND TEST TO CONFIGURED RECIPIENT"
              }
              onClick={() =>
                void act("/mailbox-test", { confirmation: confirm })
              }
            >
              Send mailbox test
            </button>
            <p>
              After receiving the test and using its unsubscribe link: CONFIRM
              RECEIPT AND UNSUBSCRIBE
            </p>
            <button
              disabled={
                busy ||
                !data.testReceipt ||
                confirm !== "CONFIRM RECEIPT AND UNSUBSCRIBE"
              }
              onClick={() =>
                void act("/confirm-mailbox-test", { confirmation: confirm })
              }
            >
              Confirm received test and unsubscribe
            </button>
            <p>For live outreach: ENABLE LIVE SENDING</p>
            <button
              className="primary"
              disabled={
                busy ||
                !data.capabilities.liveSendingConfigured ||
                confirm !== "ENABLE LIVE SENDING"
              }
              onClick={() => void act("/activate", { confirmation: confirm })}
            >
              Enable eligible live outreach
            </button>
          </section>
          <h3 className="exception-heading">Uncertain deliveries</h3>
          {!data.messages.some((m) => m.status === "uncertain") && (
            <p>No uncertain deliveries.</p>
          )}
          {data.messages
            .filter((m) => m.status === "uncertain")
            .map((m) => (
              <div className="attention-row" key={m.id}>
                <div>
                  <p>
                    Check Gmail Sent for Message-ID growth.{m.id}@gmail.com.
                    This recipient will never be retried automatically.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        `/messages/${m.id}/resolve`,
                        { confirmation: "CANCEL WITHOUT RESENDING" },
                        "POST",
                        "Delivery closed without resend; recipient stopped. Resume only after reconciling Gmail.",
                      )
                    }
                  >
                    I reconciled Gmail; close without resending
                  </button>
                </div>
              </div>
            ))}
          <h3 className="exception-heading">Failed jobs</h3>
          {!data.jobs.some((j) => j.state === "failed") && (
            <p>No failed jobs.</p>
          )}
          <ul className="activity-list">
            {data.jobs
              .filter((j) => j.state === "failed")
              .map((j) => (
                <li key={j.id}>
                  <strong>{pretty(j.kind)}</strong>
                  <span>{j.error}</span>
                  {j.kind !== "send" ? (
                    <button
                      disabled={busy}
                      onClick={() => void act(`/jobs/${j.id}/retry`)}
                    >
                      Retry job
                    </button>
                  ) : (
                    <small>Reconcile in Gmail; no automatic resend</small>
                  )}
                </li>
              ))}
          </ul>
        </>
      )}
      {page === "Usage and Costs" && (
        <>
          <h2>Every reservation counts.</h2>
          <p>
            Usage is reserved before provider calls and is not refunded on
            uncertain failures. These are conservative app limits, not a
            substitute for the provider’s billing dashboard. Calendar budgets
            use America/Toronto.
          </p>
          <DataTable
            headers={[
              "Mode / month",
              "Discovery requests",
              "Search credits",
              "Verification credits",
              "Live sends",
              "Simulated sends",
            ]}
            rows={Object.entries(data.usage).map(([key, u]) => (
              <tr key={key}>
                <td>{pretty(key)}</td>
                <td>{u.discovery}</td>
                <td>{u.search}</td>
                <td>{u.verification}</td>
                <td>{u.sends}</td>
                <td>{u.simulated}</td>
              </tr>
            ))}
          />
          <dl className="configuration-list">
            <dt>Monthly search cap</dt>
            <dd>{data.policy.searchCredits}</dd>
            <dt>Monthly verification cap</dt>
            <dd>{data.policy.verificationCredits}</dd>
            <dt>Daily / monthly sending cap</dt>
            <dd>
              {data.policy.dailyLimit} / {data.policy.monthlyLimit}
            </dd>
            <dt>AI provider charges</dt>
            <dd>None — local evidence rules, with optional self-hosted AI</dd>
            <dt>Permanent suppressions</dt>
            <dd>{Object.keys(data.suppressions).length}</dd>
          </dl>
          <p>
            No purchases are made by the app. Hunter contact discovery and
            verification can consume credits after explicit configuration. Gmail
            uses the authorized account’s limits; private hosting and database
            storage may incur costs.
          </p>
        </>
      )}
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="automation-empty">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[];
}) {
  return (
    <>
      <p className="scroll-hint">
        Scroll sideways for all columns and message details.
      </p>
      <div
        className="table-wrap automation-table"
        role="region"
        aria-label="Results; scroll horizontally for all columns"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </>
  );
}
function OpportunityEditor({
  opportunity: o,
  name,
  busy,
  save,
}: {
  opportunity: Opportunity;
  name: string;
  busy: boolean;
  save: (stage: Opportunity["stage"], notes: string) => void;
}) {
  const [stage, setStage] = useState(o.stage);
  const [notes, setNotes] = useState(o.notes);
  return (
    <form
      className="opportunity-row"
      onSubmit={(e) => {
        e.preventDefault();
        save(stage, notes);
      }}
    >
      <h3>{name}</h3>
      <label>
        Stage
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as Opportunity["stage"])}
        >
          {[
            "interested",
            "audit_requested",
            "in_progress",
            "converted",
            "closed",
          ].map((s) => (
            <option value={s} key={s}>
              {pretty(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Private notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </label>
      <button disabled={busy}>Save opportunity</button>
    </form>
  );
}
