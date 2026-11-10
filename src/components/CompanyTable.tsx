import { ArrowUpRight, Check, X, RefreshCw, Building2 } from "lucide-react";
import type { Company, LeadStatus } from "../../shared/company";
interface Props {
  shown: Company[];
  busy: boolean;
  query: string;
  update: (company: Company, status: LeadStatus) => Promise<void>;
}
export function CompanyTable({ shown, busy, query, update }: Props) {
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Company results; scroll horizontally for fit scores and review actions"
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">
          Company discovery results and review actions
        </caption>
        <thead>
          <tr>
            <th>Company</th>
            <th>Industry & location</th>
            <th>Employees</th>
            <th>Lead fit</th>
            <th>Review</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((company) => (
            <tr key={company.domain}>
              <td>
                <div className="company-cell">
                  <span className="company-avatar">
                    {company.name
                      .split(" ")
                      .map((word) => word[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>{company.name}</strong>
                    {company.source === "demo" ? (
                      <span className="domain">{company.domain}</span>
                    ) : (
                      <a
                        href={`https://${company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {company.domain}
                        <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </td>
              <td>
                <span>{company.industry ?? "Industry unverified"}</span>
                <small>{company.location ?? "Location unverified"}</small>
              </td>
              <td>
                <span>{company.headcount ?? "Unverified"}</span>
                {company.headcount === "1-10" && (
                  <small className="amber">Verify 2+ employees</small>
                )}
              </td>
              <td>
                <details>
                  <summary>
                    <span
                      className={`score ${company.score !== null && company.score >= 90 ? "high" : ""}`}
                    >
                      {company.score ?? "Unscored"}
                      {company.score !== null && <small>/100</small>}
                    </span>
                  </summary>
                  <ul>
                    {company.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </details>
              </td>
              <td>
                {company.status === "new" ? (
                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() => update(company, "saved")}
                      aria-label={`Save ${company.name}`}
                    >
                      <Check size={15} /> Save
                    </button>
                    <button
                      disabled={busy}
                      className="icon-button"
                      onClick={() => update(company, "rejected")}
                      aria-label={`Reject ${company.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="actions">
                    <span
                      className={company.status === "saved" ? "green" : "muted"}
                    >
                      {company.status === "saved" ? "Saved" : "Rejected"}
                    </span>
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() => update(company, "new")}
                      aria-label={`Return ${company.name} to review`}
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && (
        <div className="empty">
          <Building2 size={28} />
          <h3>No companies here yet</h3>
          <p>
            {query
              ? "Try another company name or clear your search."
              : "Find leads or choose a different review filter."}
          </p>
        </div>
      )}
    </div>
  );
}
