import type {
  Evidence,
  Qualification,
  ResearchPage,
} from "../shared/qualification.js";
// Deliberately conservative, explainable heuristics. Text is evidence, never instructions.
const signals = {
  business:
    /\b(?:for (?:businesses|companies|organizations|teams)|business customers|business insights|business-to-business|B2B|your (?:business|company|team))\b/i,
  product:
    /\b(?:software|platform|analytics|helpdesk|CRM|dashboard|workspace|knowledge base)\b/i,
  hosted:
    /\b(?:cloud[- ](?:based|hosted)|hosted (?:service|software|platform)|software as a service|SaaS|no installation|managed hosting|managed cloud|hosted version|online (?:software|platform))\b/i,
  subscription:
    /\b(?:billed (?:monthly|annually|yearly)|monthly (?:subscription|plans?)|annual (?:subscription|plans?)|subscription fee|subscription business model|per (?:user|seat) per month|\/(?:month|mo|year)|per month|per year)\b/i,
  nonprofit:
    /\b(?:we are|we're|is|as) (?:a |an |registered |501\(c\)\(3\) )*(?:non[- ]?profit|not-for-profit)\b/i,
  agency:
    /\b(?:we are|we're|is|our) (?:a |an |digital |marketing |design |development |consulting )*(?:agency|consultancy)\b/i,
  consumer:
    /\b(?:for personal use only|consumer[- ]only|exclusively for (?:individuals|consumers)|not for (?:business|commercial) use)\b/i,
  open_source: /\b(?:open[- ]source|free software|freely distributed)\b/i,
  noncommercial_product:
    /\b(?:desktop environment|image editor|image manipulation program|scripting language|programming language|free (?:web )?browser)\b/i,
};
export function qualify(
  pages: ResearchPage[],
  now = new Date(),
): Qualification {
  const evidence: Evidence[] = [];
  const hit = (signal: keyof typeof signals) => {
    let found = false;
    for (const page of pages.filter((p) => p.status === "ok")) {
      // Preserve sentence context and avoid scoring isolated navigation labels.
      for (const sentence of page.text.split(/(?<=[.!?])\s+|\n+/)) {
        if (
          sentence.length < 12 ||
          sentence.length > 1000 ||
          !signals[signal].test(sentence)
        )
          continue;
        if (
          /\b(?:not|never) (?:an? )?(?:agency|nonprofit|non-profit|SaaS)\b/i.test(
            sentence,
          )
        )
          continue;
        if (
          ["business", "product", "hosted", "subscription"].includes(signal) &&
          /\b(?:not|never|no|without) (?:a |an |any )?(?:subscription|monthly subscription|annual subscription|billed|cloud[- ]based|hosted|SaaS|software as a service|for businesses)\b/i.test(
            sentence,
          )
        )
          continue;
        const match = sentence.search(signals[signal]);
        const start = Math.max(0, match - 100);
        evidence.push({
          signal,
          quote:
            (start ? "…" : "") +
            sentence.slice(start, start + 320) +
            (sentence.length > start + 320 ? "…" : ""),
          url: page.url,
        });
        found = true;
        break;
      }
    }
    return found;
  };
  const observed = Object.fromEntries(
    Object.keys(signals).map((key) => [key, hit(key as keyof typeof signals)]),
  ) as Record<keyof typeof signals, boolean>;
  const flags = ["nonprofit", "agency", "consumer", "open_source"].filter(
    (key) => observed[key as keyof typeof signals],
  );
  const reasons: string[] = [];
  const productFit =
    observed.business &&
    observed.product &&
    observed.hosted &&
    observed.subscription;
  const excluded = observed.nonprofit || observed.agency || observed.consumer;
  const freeProject =
    observed.open_source &&
    observed.noncommercial_product &&
    !observed.hosted &&
    !observed.subscription;
  let classification: Qualification["classification"] = "insufficient";
  let score: number | null = null;
  if (excluded && productFit) {
    reasons.push(
      "Conflicting commercial SaaS and exclusion signals; human review required.",
    );
  } else if (excluded || freeProject) {
    classification = "unsuitable";
    score = 0;
    reasons.push(
      excluded
        ? "Explicit nonprofit, agency, or consumer-only evidence does not match the target."
        : "Open-source desktop/language/browser project; no relevant hosted subscription evidence found in inspected pages.",
    );
  } else if (
    productFit &&
    new Set(
      evidence
        .filter((e) =>
          ["business", "hosted", "subscription"].includes(e.signal),
        )
        .map((e) => e.url),
    ).size >= 2
  ) {
    classification = "confirmed";
    score = 90;
    reasons.push(
      "Business audience, software product, hosted delivery, and recurring billing supported by multiple public pages.",
    );
  } else if (
    observed.business &&
    observed.product &&
    (observed.hosted || observed.subscription)
  ) {
    classification = "potential";
    score = 50 + (observed.hosted ? 15 : 0) + (observed.subscription ? 15 : 0);
    reasons.push(
      "Relevant business software signals found; hosted subscription evidence or independent page corroboration is incomplete.",
    );
  } else
    reasons.push(
      "Insufficient direct evidence of a business-facing hosted subscription product.",
    );
  if (pages.some((p) => p.status !== "ok"))
    reasons.push(
      "Some pages were unavailable or disallowed; this assessment is incomplete.",
    );
  if (observed.open_source && productFit && !excluded)
    reasons.push(
      "Open source is not an exclusion when a commercial hosted subscription is evidenced.",
    );
  reasons.push(
    "Score measures observed business-model fit only. Headcount, revenue, churn problems, and legal eligibility are not inferred.",
  );
  return {
    version: "rules-v1",
    classification,
    score,
    reasons,
    flags,
    evidence,
    sources: pages.map(({ url, status }) => ({ url, status })),
    checkedAt: now.toISOString(),
  };
}
