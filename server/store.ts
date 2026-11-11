import type { Qualification } from "../shared/qualification.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Company, LeadStatus } from "../shared/company.js";
export interface Store {
  list(): Promise<Company[]>;
  discover(companies: Company[]): Promise<void>;
  setQualification(
    domain: string,
    qualification: Qualification,
  ): Promise<boolean>;
  setStatus(domain: string, status: LeadStatus): Promise<boolean>;
}
export class MemoryStore implements Store {
  private rows = new Map<string, Company>();
  async list() {
    return [...this.rows.values()].map((row) => ({ ...row }));
  }
  async discover(companies: Company[]) {
    for (const row of companies)
      if (!this.rows.has(row.domain)) this.rows.set(row.domain, { ...row });
  }
  async setQualification(domain: string, qualification: Qualification) {
    const row = this.rows.get(domain);
    if (!row) return false;
    row.qualification = qualification;
    return true;
  }
  async setStatus(domain: string, status: LeadStatus) {
    const row = this.rows.get(domain);
    if (!row) return false;
    row.status = status;
    return true;
  }
}
export class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}
  async list(): Promise<Company[]> {
    const { data, error } = await this.db
      .from("companies")
      .select(
        "domain,name,industry,location,headcount,score,reasons,status,source,eligibility,qualification",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error("Database read failed");
    return data as Company[];
  }
  async discover(companies: Company[]) {
    if (!companies.length) return;
    const { error } = await this.db
      .from("companies")
      .upsert(companies, { onConflict: "domain", ignoreDuplicates: true });
    if (error) throw new Error("Database write failed");
  }
  async setQualification(domain: string, qualification: Qualification) {
    const { data, error } = await this.db
      .from("companies")
      .update({ qualification })
      .eq("domain", domain)
      .select("domain");
    if (error) throw new Error("Qualification persistence failed");
    return Boolean(data?.length);
  }
  async setStatus(domain: string, status: LeadStatus) {
    const { data, error } = await this.db
      .from("companies")
      .update({ status })
      .eq("domain", domain)
      .select("domain");
    if (error) throw new Error("Database write failed");
    return Boolean(data?.length);
  }
}
