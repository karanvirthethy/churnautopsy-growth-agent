import type { Store } from "./store.js";
import type { Qualification } from "../shared/qualification.js";
import { qualify } from "./qualify.js";
import { researchWebsite } from "./website.js";
export class ResearchService {
  private active = new Map<string, Promise<Qualification>>();
  constructor(
    private store: Store,
    private inspect = researchWebsite,
    private now = () => new Date(),
  ) {}
  async run(domain: string): Promise<Qualification> {
    const existing = this.active.get(domain);
    if (existing) return existing;
    if (this.active.size) throw new Error("Research already in progress");
    const job = this.perform(domain);
    this.active.set(domain, job);
    try {
      return await job;
    } finally {
      this.active.delete(domain);
    }
  }
  private async perform(domain: string) {
    const company = (await this.store.list()).find((c) => c.domain === domain);
    if (!company) throw new Error("Company not found");
    const previous = company.qualification;
    const age = previous
      ? this.now().getTime() - Date.parse(previous.checkedAt)
      : Infinity;
    if (
      previous &&
      age >= 0 &&
      age <
        (previous.sources.some((s) => s.status !== "ok")
          ? 30 * 60_000
          : 24 * 3600_000)
    )
      return previous;
    // Fictional demo records never trigger network access.
    const pages =
      company.source === "demo"
        ? [
            {
              url: `https://${domain}`,
              status: "unavailable" as const,
              text: "",
            },
          ]
        : await this.inspect(domain);
    const assessment = qualify(pages, this.now());
    if (!(await this.store.setQualification(domain, assessment)))
      throw new Error("Company no longer available");
    return assessment;
  }
}
