import { Send, Inbox, ArrowRight } from "lucide-react";
export function RoadmapPage({
  page,
  savedCount,
}: {
  page: "Campaigns" | "Inbox";
  savedCount: number;
}) {
  return (
    <section className="roadmap">
      <div className="roadmap-icon">
        {page === "Campaigns" ? <Send size={32} /> : <Inbox size={32} />}
      </div>
      <span className="badge">FUTURE PHASE</span>
      <h2>
        {page === "Campaigns"
          ? "A good introduction takes preparation."
          : "A quiet inbox, by design."}
      </h2>
      <p>
        {page === "Campaigns"
          ? "Build your shortlist now. Campaigns will require eligibility review, suppression checks, and your explicit approval before any message can leave the workspace."
          : "No mailbox is connected and no messages are sent. Future reply handling will keep conversations attached to their company and stop follow-ups when someone responds."}
      </p>
      <a href="#leads" className="primary">
        Review your leads <ArrowRight size={16} />
      </a>
      <div className="roadmap-facts">
        <span>{savedCount} companies saved</span>
        <span>0 emails sent</span>
        <span>Sending disabled</span>
      </div>
    </section>
  );
}
