import { describe, it, expect } from "vitest";
import { normalizeDomain, mapHunter } from "../server/companies";
import { MemoryStore } from "../server/store";
const base = {
  domain: "WWW.Example.com",
  organization: "Example",
  industry: "Software Development",
  keywords: ["SaaS", "B2B"],
  country: "US",
  city: "Austin",
  headcount: "11-50",
};
describe("company ingestion", () => {
  it("normalizes equivalent website identities", () => {
    expect(normalizeDomain("https://WWW.Example.COM/path")).toBe("example.com");
    expect(normalizeDomain("example.com.")).toBe("example.com");
  });
  it.each([
    "javascript:alert(1)",
    "localhost",
    "http://127.0.0.1",
    "https://bad_name.com",
  ])("rejects unsafe domain %s", (value) =>
    expect(() => normalizeDomain(value)).toThrow(),
  );
  it("explains a complete fit without granting eligibility", () => {
    const company = mapHunter(base)!;
    expect(company.score).toBe(100);
    expect(company.eligibility).toBe("not_assessed");
    expect(company.reasons).toContain("B2B keyword match");
  });
  it("flags ambiguous small-company ranges", () => {
    const company = mapHunter({ ...base, headcount: "1-10" })!;
    expect(company.score).toBe(80);
    expect(company.reasons.join(" ")).toContain("confirm at least 2");
  });
  it("excludes outside-target and missing geography/size evidence", () => {
    expect(mapHunter({ ...base, country: "CA" })).toBeNull();
    expect(mapHunter({ ...base, headcount: "51-200" })).toBeNull();
    expect(mapHunter({ ...base, country: null })).toBeNull();
    expect(mapHunter({ ...base, industry: "Retail", keywords: [] })).toBeNull();
  });
  it("deduplicates repeat discovery without losing review decisions", async () => {
    const store = new MemoryStore();
    const row = mapHunter(base)!;
    await store.discover([row, row]);
    await store.setStatus(row.domain, "rejected");
    await store.discover([row]);
    expect(await store.list()).toEqual([{ ...row, status: "rejected" }]);
    expect(await store.setStatus("missing.example", "saved")).toBe(false);
  });
});
