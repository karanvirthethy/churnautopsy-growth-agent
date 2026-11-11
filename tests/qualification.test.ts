import { describe, it, expect, vi } from "vitest";
import { qualify } from "../server/qualify";
import { ResearchService } from "../server/research";
import { MemoryStore } from "../server/store";
import { mapHunter } from "../server/companies";
import {
  matchesQualification,
  type ResearchPage,
} from "../shared/qualification";
const page = (
  text: string,
  url = "https://fictional.example/",
): ResearchPage => ({ url, text, status: "ok" });
const positive = [
  page(
    "Cloud-based software for businesses. Our platform helps your team coordinate work.",
  ),
  page(
    "Monthly subscription plans billed annually.",
    "https://fictional.example/pricing",
  ),
];
describe("evidence-based classification", () => {
  // Synthetic regression scenarios based on the user-supplied negative examples.
  // They are not current website observations or stored prospect records.
  it.each([
    ["GNOME", "GNOME is a free software desktop environment."],
    ["GIMP", "GIMP is a freely distributed image manipulation program."],
    ["PHP", "PHP is an open-source scripting language."],
    [
      "The Tor Project",
      "The Tor Project is a 501(c)(3) nonprofit. We provide a free browser.",
    ],
  ])("flags %s without relying on a domain blacklist", (_name, text) => {
    const result = qualify([page(text)]);
    expect(result.classification).toBe("unsuitable");
    expect(result.score).toBe(0);
    expect(result.evidence.length).toBeGreaterThan(0);
  });
  it("confirms corroborated B2B hosted subscription evidence with traceable sources", () => {
    const q = qualify(positive);
    expect(q.classification).toBe("confirmed");
    expect(q.score).toBe(90);
    expect(
      q.evidence.some(
        (e) => e.url.endsWith("/pricing") && e.signal === "subscription",
      ),
    ).toBe(true);
  });
  it("does not turn negated subscription evidence into a confirmed fit", () => {
    const q = qualify([
      positive[0],
      page(
        "There is no subscription fee.",
        "https://fictional.example/pricing",
      ),
    ]);
    expect(q.classification).toBe("potential");
    expect(q.evidence.some((e) => e.signal === "subscription")).toBe(false);
  });
  it("retains corroboration when the homepage already mentions billing", () => {
    const q = qualify([
      page(positive[0].text + " Monthly subscription plans available."),
      positive[1],
    ]);
    expect(q.classification).toBe("confirmed");
    expect(q.evidence.filter((e) => e.signal === "subscription")).toHaveLength(
      2,
    );
  });
  it("does not reject commercially hosted open-source SaaS", () => {
    expect(
      qualify([
        page(positive[0].text + " Our software is open source."),
        positive[1],
      ]).classification,
    ).toBe("confirmed");
  });
  it("treats the public Plausible subscription model as a positive but single-source case", () => {
    // Short excerpts checked against official public README, 2026-11-11.
    // Source is one document; do not pretend it is independent pricing-page verification.
    const q = qualify([
      page(
        "Plausible Analytics is an open source, privacy-first web analytics tool. Available in managed cloud or self-hosted community edition. We’re trusted by thousands of paying subscribers to deliver their website and business insights. There’s a cost associated with providing an analytics service so we charge a subscription fee.",
        "https://github.com/plausible/analytics",
      ),
    ]);
    expect(q.classification).toBe("potential");
    expect(q.flags).toContain("open_source");
    expect(q.score).toBe(80);
  });
  it("recognizes official Outline hosted team software as potential without inventing subscription evidence", () => {
    const q = qualify([
      page(
        "A fast, collaborative, knowledge base for your team built using React and Node.js. A hosted version of the app is offered at getoutline.com.",
        "https://github.com/outline/outline",
      ),
    ]);
    expect(q.classification).toBe("potential");
    expect(q.score).toBe(65);
  });
  it.each([
    "We are a digital agency.",
    "Our consultancy builds custom software.",
    "This platform is for personal use only.",
  ])("flags explicit unsuitable business models: %s", (text) =>
    expect(qualify([page(text)]).classification).toBe("unsuitable"),
  );
  it("does not mistake nonprofit customers for a nonprofit vendor", () =>
    expect(
      qualify([
        page(positive[0].text + " Built for nonprofit customers too."),
        positive[1],
      ]).classification,
    ).toBe("confirmed"));
  it("holds conflicting nonprofit and SaaS evidence for human review", () => {
    const q = qualify([
      ...positive,
      page(
        "We are a nonprofit organization.",
        "https://fictional.example/about",
      ),
    ]);
    expect(q.classification).toBe("insufficient");
    expect(q.score).toBeNull();
  });
  it("leaves missing/inaccessible and marketing-only sites unscored", () => {
    for (const pages of [
      [],
      [page("Welcome to our innovative future.")],
      [{ ...page(""), status: "blocked" as const }],
    ])
      expect(qualify(pages).score).toBeNull();
  });
  it("flags partial evidence when pricing is inaccessible", () => {
    const q = qualify([
      positive[0],
      { ...positive[1], status: "unavailable", text: "" },
    ]);
    expect(q.classification).toBe("potential");
    expect(q.reasons.join(" ")).toContain("incomplete");
  });
});
describe("research persistence and deduplication", () => {
  it("shares concurrent work, caches persisted evidence, and preserves human decisions", async () => {
    const store = new MemoryStore();
    await store.discover([mapHunter({ domain: "fictional.example" })]);
    await store.setStatus("fictional.example", "rejected");
    const inspect = vi.fn().mockResolvedValue(positive);
    const service = new ResearchService(store, inspect);
    const [a, b] = await Promise.all([
      service.run("fictional.example"),
      service.run("fictional.example"),
    ]);
    expect(a).toEqual(b);
    await new ResearchService(store, inspect).run("fictional.example");
    expect(inspect).toHaveBeenCalledTimes(1);
    const saved = (await store.list())[0];
    expect(saved.status).toBe("rejected");
    expect(saved.qualification?.score).toBe(90);
    expect(saved.headcount).toBeNull();
    expect(saved.eligibility).toBe("not_assessed");
    expect(matchesQualification(saved, "rejected")).toBe(true);
    expect(matchesQualification(saved, "qualified")).toBe(false);
  });
  it("denies unknown companies and never fetches demo domains", async () => {
    const store = new MemoryStore();
    const inspect = vi.fn();
    const service = new ResearchService(store, inspect);
    await expect(service.run("unknown.example")).rejects.toThrow("not found");
    await store.discover([
      { ...mapHunter({ domain: "demo.example" }), source: "demo" },
    ]);
    await service.run("demo.example");
    expect(inspect).not.toHaveBeenCalled();
  });
});
