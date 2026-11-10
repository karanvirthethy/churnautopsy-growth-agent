import type { Workspace } from "../../shared/company";
export function SettingsPage({ workspace }: { workspace?: Workspace }) {
  return (
    <div className="settings-layout">
      <section className="settings-panel">
        <h2>Connections</h2>
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
          employees. SaaS and B2B signals also need human review. Fit scores are
          transparent heuristics, not AI predictions.
        </p>
      </section>
      <section className="settings-panel setup-note">
        <h2>Connect live data securely</h2>
        <p>
          Follow the README to create a dedicated Supabase project, apply the
          migration, and configure server environment variables. Never use your
          existing production project. The application fails closed if live
          configuration is incomplete.
        </p>
      </section>
    </div>
  );
}
