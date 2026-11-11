// Free-plan structured filters only. These are search criteria, not company facts.
export const searchProfiles = [
  {
    id: "customer-success",
    label: "Customer success & retention",
    keywords: [
      "customer success",
      "subscription analytics",
      "customer retention",
    ],
  },
  {
    id: "support",
    label: "Helpdesk & customer support",
    keywords: ["helpdesk", "customer support software", "support platform"],
  },
  {
    id: "revenue",
    label: "Billing & revenue operations",
    keywords: [
      "subscription billing",
      "revenue operations",
      "invoicing software",
    ],
  },
  {
    id: "sales",
    label: "Sales & CRM",
    keywords: ["sales automation", "CRM software", "sales platform"],
  },
  {
    id: "analytics",
    label: "Business analytics",
    keywords: ["product analytics", "business analytics", "web analytics"],
  },
  {
    id: "workflow",
    label: "Team workflow & operations",
    keywords: [
      "workflow automation",
      "project management software",
      "team collaboration",
    ],
  },
] as const;
export type SearchProfileId = (typeof searchProfiles)[number]["id"];
