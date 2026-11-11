import { useState } from "react";
import { request } from "../api";
import type { ConnectionHealth } from "../../shared/health";
import type { Workspace } from "../../shared/company";
export function SettingsPage({ workspace }: { workspace?: Workspace }) {
  const [health, setHealth] = useState<ConnectionHealth>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setChecking(true);
    setError("");
    setHealth(undefined);
    try {
      setHealth(
        await request<ConnectionHealth>("/connections/health", "POST", {}),
      );
    } catch {
      setError(
        "Unable to check connections. Sign in again if your session expired, or retry in one minute.",
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="settings-layout">
      <section className="settings-panel">
        <h2>Connections</h2>
        <p>Run read-only checks. No companies are discovered or enriched.</p>
        <button
          className="primary"
          disabled={checking || !workspace}
          onClick={check}
        >
          {checking ? "Checking…" : "Check connections"}
        </button>
        {error && <p role="alert">{error}</p>}
        {health && (
          <div role="status">
            <p>
              Supabase — {health.supabase.status}: {health.supabase.message}
            </p>
            <p>
              Hunter — {health.hunter.status}: {health.hunter.message}
            </p>
          </div>
        )}
        <div className="setting-row">
          <div>
            <h3>Data mode</h3>
            <p>
              {workspace?.mode === "live"
                ? "Private, authenticated workspace."
                : "Fictional records, held in server memory. Restarting resets decisions."}
            </p>
          </div>
          <span className="badge">{workspace?.mode ?? "Loading"}</span>
        </div>
        <div className="setting-row">
          <div>
            <h3>Hunter Discover</h3>
            <p>
              {workspace?.mode === "live"
                ? "Configured on the server. Discovery uses up to 20 results per request."
                : "Not used in demo mode. API keys belong only on the server."}
            </p>
          </div>
          <span>{workspace?.mode === "live" ? "Configured" : "Demo"}</span>
        </div>
        <div className="setting-row">
          <div>
            <h3>Supabase</h3>
            <p>
              {workspace?.mode === "live"
                ? "Companies and decisions persist in your dedicated database."
                : "No database required for this demo."}
            </p>
          </div>
          <span>{workspace?.mode === "live" ? "Configured" : "Demo"}</span>
        </div>
      </section>
      <section className="settings-panel">
        <h2>Discovery boundaries</h2>
        <dl>
          <dt>Business profile</dt>
          <dd>B2B SaaS</dd>
          <dt>Headquarters</dt>
          <dd>United States</dd>
          <dt>Team size</dt>
          <dd>2–50 employees</dd>
          <dt>Legal eligibility</dt>
          <dd>Not assessed</dd>
          <dt>Email sending</dt>
          <dd>Disabled</dd>
        </dl>
        <p className="settings-note">
          Hunter’s 1–10 employee range requires manual confirmation of 2+
          employees. Discover returns company identity, not qualification
          details. Company attributes remain unverified. Public website research
          adds a separate evidence-based business-model assessment; missing
          evidence stays unscored. Six targeted searches use free first-page
          discovery only. No paid enrichment is requested.
        </p>
      </section>
      <section className="settings-panel setup-note">
        <h2>Connect live data securely</h2>
        <p>
          Follow the live setup guide to configure the dedicated Growth Agent
          project and server environment variables. Do not rerun migrations
          already applied or use your original production project. The
          application fails closed if live configuration is incomplete.
        </p>
      </section>
    </div>
  );
}
