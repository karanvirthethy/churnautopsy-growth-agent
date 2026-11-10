import { SettingsPage } from "./pages/SettingsPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { useEffect, useState } from "react";
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
  ["Dashboard", LayoutDashboard],
  ["Leads", Building2],
  ["Campaigns", Send],
  ["Inbox", Inbox],
  ["Settings", Settings],
] as const;
type Page = (typeof navigation)[number][0];
import { request } from "./api";
import { CompanyTable } from "./components/CompanyTable";
export default function App() {
  const [page, setPage] = useState<Page>(
    () =>
      navigation.find(
        ([name]) => name.toLowerCase() === location.hash.slice(1),
      )?.[0] ?? "Dashboard",
  );
  const [workspace, setWorkspace] = useState<Workspace>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const [query, setQuery] = useState("");
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
        navigation.find(
          ([name]) => name.toLowerCase() === location.hash.slice(1),
        )?.[0] ?? "Dashboard",
      );
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  async function discover() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setWorkspace(await request<Workspace>("/discover", "POST", {}));
      setNotice(
        "Discovery complete. Existing review decisions were preserved.",
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
      (filter === "all" || c.status === filter) &&
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
        <a href="#dashboard" className="brand">
          <Activity size={26} />
          <span>
            ChurnAutopsy<small>Growth workspace</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <a
              href={`#${name.toLowerCase()}`}
              key={name}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {name === "Leads" && (
                <span className="nav-count">{companies.length}</span>
              )}
            </a>
          ))}
        </nav>
        <p className="scroll-hint nav-hint">
          Swipe navigation to see all five pages.
        </p>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={18} />
            <span>
              Private workspace<small>Single owner · Phase 1</small>
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
                {page === "Dashboard"
                  ? "Find your next great-fit customer."
                  : page === "Leads"
                    ? "A better pipeline starts here."
                    : page === "Campaigns"
                      ? "Thoughtful outreach starts with fit."
                      : page === "Inbox"
                        ? "Every conversation, in context."
                        : "Your workspace, under control."}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "Discover promising SaaS companies. Build a pipeline worth pursuing."
                  : page === "Leads"
                    ? "Review the evidence. Save the companies that belong in your pipeline."
                    : page === "Settings"
                      ? "Connection status, targeting, and the boundaries of Phase 1."
                      : "The foundation is here. Sending and reply handling are not enabled."}
              </p>
            </div>
            {["Dashboard", "Leads"].includes(page) && (
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
          {page === "Dashboard" && (
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
                <span className="fixed-target">Phase 1 target</span>
              </section>
            </>
          )}
          {["Dashboard", "Leads"].includes(page) && (
            <section className="lead-section">
              <div className="section-heading">
                <div>
                  <h2>
                    {page === "Dashboard" ? "Company discovery" : "Your leads"}{" "}
                    <span className="count">{shown.length}</span>
                  </h2>
                  <p>
                    Fit scores guide research. They do not establish outreach
                    eligibility.
                  </p>
                </div>
              </div>
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
          {page === "Dashboard" && (
            <section className="next-step">
              <ShieldCheck size={22} />
              <div>
                <h3>Research first. Outreach when you’re ready.</h3>
                <p>
                  Saved leads are a research shortlist. Legal eligibility, email
                  delivery, follow-ups, and replies are reserved for future
                  phases.
                </p>
              </div>
              <a href="#campaigns">
                What’s next <ArrowRight size={16} />
              </a>
            </section>
          )}
          {(page === "Campaigns" || page === "Inbox") && (
            <RoadmapPage page={page} savedCount={saved.length} />
          )}
          {page === "Settings" && <SettingsPage workspace={workspace} />}
          <footer>
            ChurnAutopsy <span>Growth starts with understanding.</span>
            <span>Phase 1 · Discovery & research</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
