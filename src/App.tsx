import { searchProfiles } from "../shared/searches";
import {
  matchesQualification,
  type Qualification,
  type QualificationFilter,
} from "../shared/qualification";
import { SettingsPage } from "./pages/SettingsPage";
import {
  AutomationPage,
  type AutomationPageName,
} from "./pages/AutomationPage";
import { useEffect, useState, useRef } from "react";
import {
  Activity,
  LayoutDashboard,
  Building2,
  Send,
  Inbox,
  Settings,
  Search,
  ArrowRight,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { Company, LeadStatus, Workspace } from "../shared/company";
const navigation = [
  ["Overview", LayoutDashboard],
  ["Companies", Building2],
  ["Qualified Leads", ShieldCheck],
  ["Contacts", Building2],
  ["Campaigns", Send],
  ["Email Sequences", Send],
  ["Inbox", Inbox],
  ["Opportunities", Activity],
  ["Automation Settings", Settings],
  ["Usage and Costs", Activity],
  ["Settings", Settings],
] as const;
const slug = (name: string) => name.toLowerCase().replaceAll(" ", "-");
const route = () =>
  ({ dashboard: "overview", leads: "companies" })[location.hash.slice(1)] ??
  location.hash.slice(1);

type Page = (typeof navigation)[number][0];
import { request } from "./api";
import { CompanyTable } from "./components/CompanyTable";
export default function App() {
  const [page, setPage] = useState<Page>(
    () =>
      navigation.find(([name]) => slug(name) === route())?.[0] ?? "Overview",
  );
  const [workspace, setWorkspace] = useState<Workspace>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const [query, setQuery] = useState("");
  const [qualificationFilter, setQualificationFilter] =
    useState<QualificationFilter>("all");
  const [profile, setProfile] = useState<string>(() => {
    try {
      return localStorage.getItem("discovery-profile") || searchProfiles[0].id;
    } catch {
      return searchProfiles[0].id;
    }
  });
  const stopResearch = useRef(false);
  const [researching, setResearching] = useState(false);
  function chooseProfile(id: string) {
    setProfile(id);
    try {
      localStorage.setItem("discovery-profile", id);
    } catch {
      /* browser persistence is optional */
    }
  }
  async function researchRows(rows: Company[]) {
    stopResearch.current = false;
    setResearching(true);
    try {
      const batch = rows.slice(0, 20);
      for (let index = 0; index < batch.length; index++) {
        if (stopResearch.current) {
          setNotice(
            "Research paused. Completed assessments are saved; resume with Research shown.",
          );
          return;
        }
        setNotice(
          `Researching company ${index + 1} of ${batch.length}. Public pages only; no paid enrichment.`,
        );
        const row = batch[index];
        const result = await request<{ qualification: Qualification }>(
          `/companies/${encodeURIComponent(row.domain)}/research`,
          "POST",
          {},
        );
        setWorkspace(
          (current) =>
            current && {
              ...current,
              companies: current.companies.map((c) =>
                c.domain === row.domain
                  ? { ...c, qualification: result.qualification }
                  : c,
              ),
            },
        );
      }
      setNotice(
        `Research complete for ${batch.length} companies. Review evidence and inaccessible-page notices.`,
      );
    } finally {
      setResearching(false);
    }
  }
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const handleError = (err: unknown) => {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong. Please retry.";
    if (message === "AUTH_REQUIRED") setAuth(true);
    else setError(message);
  };
  async function load() {
    setError("");
    try {
      setWorkspace(await request<Workspace>("/companies"));
      setAuth(false);
    } catch (err) {
      handleError(err);
    }
  }
  useEffect(() => {
    void load();
    const handler = () =>
      setPage(
        navigation.find(([name]) => slug(name) === route())?.[0] ?? "Overview",
      );
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  async function discover() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const selected =
        searchProfiles.find((p) => p.id === profile) ?? searchProfiles[0];
      const result = await request<Workspace>("/discover", "POST", {
        profile: selected.id,
      });
      setWorkspace(result);
      chooseProfile(
        searchProfiles[
          (searchProfiles.findIndex((p) => p.id === selected.id) + 1) %
            searchProfiles.length
        ].id,
      );
      await researchRows(
        result.companies.filter((c) =>
          result.discoveredDomains?.includes(c.domain),
        ),
      );
      if (!stopResearch.current)
        setNotice(
          `Discovery complete: ${selected.label}. Review decisions preserved. Next search preset selected; research may include incomplete evidence.`,
        );
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  async function update(company: Company, status: LeadStatus) {
    setBusy(true);
    setError("");
    try {
      await request(
        `/companies/${encodeURIComponent(company.domain)}`,
        "PATCH",
        { status },
      );
      setWorkspace(
        (current) =>
          current && {
            ...current,
            companies: current.companies.map((row) =>
              row.domain === company.domain ? { ...row, status } : row,
            ),
          },
      );
      setNotice(
        `${company.name} ${status === "new" ? "returned to review" : status}.`,
      );
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }
  const companies = workspace?.companies ?? [];
  const saved = companies.filter((c) => c.status === "saved");
  const pending = companies.filter((c) => c.status === "new");
  const shown = companies.filter(
    (c) =>
      (page !== "Qualified Leads" || matchesQualification(c, "qualified")) &&
      (filter === "all" || c.status === filter) &&
      matchesQualification(c, qualificationFilter) &&
      `${c.name} ${c.domain} ${c.industry ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (auth)
    return (
      <main className="login">
        <Activity size={36} />
        <h1>Your private growth workspace.</h1>
        <p>
          Sign in with the owner account created in your dedicated Supabase
          project.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              await request("/login", "POST", {
                email: form.get("email"),
                password: form.get("password"),
              });
              await load();
            } catch (err) {
              setError(
                err instanceof Error && err.message === "AUTH_REQUIRED"
                  ? "Sign-in failed. Check your credentials and owner configuration."
                  : "Unable to sign in. Please retry.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="#overview" className="brand">
          <Activity size={26} />
          <span>
            ChurnAutopsy<small>Growth workspace</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <a
              href={`#${slug(name)}`}
              key={name}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {name === "Companies" && (
                <span className="nav-count" aria-hidden="true">
                  {companies.length}
                </span>
              )}
            </a>
          ))}
        </nav>
        <p className="scroll-hint nav-hint">
          Swipe navigation to see all workspace pages.
        </p>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <span>
              Private workspace<small>Single owner · Private automation</small>
            </span>
          </div>
          <div className="profile">
            <span className="avatar">CA</span>
            <span>
              ChurnAutopsy<small>Owner workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>{page}</strong>
          </span>
          <div className="topbar-right">
            <button
              className="emergency-control"
              onClick={async () => {
                try {
                  await request("/automation/pause", "POST", {});
                  setNotice(
                    "Emergency pause applied. Sending and new automation work stopped.",
                  );
                } catch (err) {
                  handleError(err);
                }
              }}
            >
              Pause all
            </button>
            <span className="status-dot" />
            {workspace?.mode === "live" ? "Live workspace" : "Demo workspace"}
            {workspace?.mode === "live" && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    await request("/logout", "POST", {});
                    setWorkspace(undefined);
                    setAuth(true);
                  } catch (err) {
                    handleError(err);
                  }
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <h1>
                {page === "Companies"
                  ? "Find your next great-fit customer."
                  : page === "Qualified Leads"
                    ? "A better pipeline starts here."
                    : page === "Campaigns"
                      ? "Your campaign policy."
                      : page === "Inbox"
                        ? "Every conversation, in context."
                        : page === "Overview"
                          ? "Your growth operation."
                          : page}
              </h1>
              <p>
                {page === "Companies"
                  ? "Discover promising SaaS companies. Build a pipeline worth pursuing."
                  : page === "Qualified Leads"
                    ? "Review the evidence. Save the companies that belong in your pipeline."
                    : page === "Settings"
                      ? "Connection status and secure configuration."
                      : "Evidence-led outreach, within your approved limits."}
              </p>
            </div>
            {["Companies", "Qualified Leads"].includes(page) && (
              <button
                className="primary"
                disabled={busy || !workspace}
                onClick={discover}
              >
                <Search size={17} />
                {busy ? "Working…" : "Find leads"}
              </button>
            )}
          </div>
          {workspace?.mode === "demo" && (
            <div className="demo-banner">
              <span>
                <span className="badge">DEMO</span> You’re exploring fictional
                companies. No API credits or real prospects are used.
              </span>
              <a href="#settings">
                About demo mode <ArrowRight size={14} />
              </a>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={load}>Retry loading</button>
            </div>
          )}
          <div role="status" className={notice ? "notice" : "sr-only"}>
            {notice}
          </div>
          {!workspace && !error && <p role="status">Loading your workspace…</p>}
          {page === "Companies" && (
            <>
              <section className="overview" aria-label="Pipeline overview">
                <div>
                  <span>Companies discovered</span>
                  <strong>
                    {companies.length.toString().padStart(2, "0")}
                  </strong>
                  <small>In your workspace</small>
                </div>
                <div>
                  <span>Ready for review</span>
                  <strong>{pending.length.toString().padStart(2, "0")}</strong>
                  <small>Waiting for your decision</small>
                </div>
                <div>
                  <span>Saved to pipeline</span>
                  <strong className="green">
                    {saved.length.toString().padStart(2, "0")}
                  </strong>
                  <small>Selected for further research</small>
                </div>
              </section>
              <section className="target-strip">
                <div>
                  <h2>Your ideal customer</h2>
                  <p>Focused discovery. Better conversations.</p>
                </div>
                <div className="target-tags">
                  <span>B2B SaaS</span>
                  <span>2–50 employees</span>
                  <span>United States</span>
                </div>
                <span className="fixed-target">Discovery target</span>
              </section>
            </>
          )}
          {["Companies", "Qualified Leads"].includes(page) && (
            <section className="lead-section">
              <div className="section-heading">
                <div>
                  <h2>
                    {page === "Companies" ? "Company discovery" : "Your leads"}{" "}
                    <span className="count">{shown.length}</span>
                  </h2>
                  <p>
                    Fit scores guide research. They do not establish outreach
                    eligibility.
                  </p>
                </div>
              </div>
              <div className="research-toolbar">
                <label>
                  Next discovery search
                  <select
                    aria-label="Discovery search"
                    value={profile}
                    disabled={busy}
                    onChange={(e) => chooseProfile(e.target.value)}
                  >
                    {searchProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy || !companies.length}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await researchRows(shown);
                    } catch (err) {
                      handleError(err);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Research shown (up to 20)
                </button>
                {researching && (
                  <button
                    onClick={() => {
                      stopResearch.current = true;
                    }}
                  >
                    Stop after current company
                  </button>
                )}
              </div>
              <div
                className="tabs qualification-tabs"
                aria-label="Qualification filters"
              >
                {(
                  [
                    ["all", "All fits"],
                    ["qualified", "Qualified"],
                    ["potential", "Potential"],
                    ["rejected", "Rejected"],
                    ["review", "Needs Review"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={qualificationFilter === value}
                    onClick={() => setQualificationFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="qualification-help">
                Qualification and your review decisions are separate. Rejected
                fits include unsuitable assessments and manual rejections.
                Discovery uses different first-page searches, never paid
                pagination.
              </p>
              <div className="toolbar">
                <div className="tabs" aria-label="Filter leads">
                  {(["all", "new", "saved", "rejected"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        aria-pressed={filter === status}
                        onClick={() => setFilter(status)}
                      >
                        {status === "all"
                          ? "All companies"
                          : status === "new"
                            ? "To review"
                            : status === "rejected"
                              ? "Manually rejected"
                              : status[0].toUpperCase() + status.slice(1)}
                      </button>
                    ),
                  )}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search companies"
                    placeholder="Search companies…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <p className="scroll-hint">
                Scroll sideways for fit scores and Save / Reject actions.
              </p>
              <CompanyTable
                shown={shown}
                busy={busy}
                query={query}
                update={update}
              />
              <div className="table-footer">
                <span>
                  {shown.length} companies ·{" "}
                  {workspace?.mode === "live"
                    ? "Hunter Discover"
                    : "Fictional demo dataset"}
                </span>
                <span>Every decision stays yours.</span>
              </div>
            </section>
          )}
          {page === "Companies" && (
            <section className="next-step">
              <ShieldCheck size={22} />
              <div>
                <h3>Research first. Outreach when you’re ready.</h3>
                <p>
                  Saved leads are a research shortlist. Outreach also requires
                  verified contacts, documented consent and an approved campaign
                  policy.
                </p>
              </div>
              <a href="#campaigns">
                Campaign policy <ArrowRight size={16} />
              </a>
            </section>
          )}
          {!["Companies", "Qualified Leads", "Settings"].includes(page) && (
            <AutomationPage key={page} page={page as AutomationPageName} />
          )}
          {page === "Settings" && <SettingsPage workspace={workspace} />}
          <footer>
            ChurnAutopsy <span>Growth starts with understanding.</span>
            <span>Private growth automation</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
