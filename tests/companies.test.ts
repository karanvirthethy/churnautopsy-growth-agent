import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  mapHunter,
  HunterResponse,
} from "../server/companies";
import { MemoryStore } from "../server/store";
import minimal from "./fixtures/hunter-discover-minimal.json";
const base = minimal.data[0];
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
  it("retains documented minimal results with unknown attributes and no invented score", () => {
    const company = mapHunter(HunterResponse.parse(minimal).data[0]);
    expect(company).toMatchObject({
      domain: base.domain,
      name: base.organization,
      industry: null,
      location: null,
      headcount: null,
      score: null,
      eligibility: "not_assessed",
    });
    expect(company.reasons.join(" ")).toContain("unverified");
    expect(company).not.toHaveProperty("emails_count");
  });
  it("does not score from search filters, email counts, or undocumented extra fields", () => {
    const response = HunterResponse.parse({
      ...minimal,
      data: [
        {
          ...base,
          country: "US",
          headcount: "11-50",
          industry: "Software",
          keywords: ["SaaS", "B2B"],
          emails_count: { total: 5000 },
        },
      ],
    });
    expect(mapHunter(response.data[0])).toEqual(mapHunter(base));
  });
  it("uses canonical domain as a label when organization is missing", () => {
    expect(
      mapHunter({ domain: "WWW.Fictional.example", organization: null }).name,
    ).toBe("fictional.example");
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
