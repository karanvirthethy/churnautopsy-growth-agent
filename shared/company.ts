import type { Qualification } from "./qualification";
export type LeadStatus = "new" | "saved" | "rejected";
export interface Company {
  domain: string;
  name: string;
  industry: string | null;
  location: string | null;
  headcount: string | null;
  score: number | null;
  reasons: string[];
  status: LeadStatus;
  source: "demo" | "hunter";
  eligibility: "not_assessed";
  qualification?: Qualification | null;
}
export interface Workspace {
  mode: "demo" | "live";
  companies: Company[];
  discoveredDomains?: string[];
}
