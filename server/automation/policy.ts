import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AutomationState,
  CampaignPolicy,
  Contact,
  Consent,
} from "../../shared/automation.js";
import type { Company } from "../../shared/company.js";
const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) => !/[\r\n\x00-\x1f]/.test(s));
export const policySchema = z
  .object({
    name: clean(120).min(3),
    senderName: clean(120),
    senderEmail: z.literal("churnautopsy@gmail.com"),
    postalAddress: clean(300),
    senderCountry: z.enum(["CA", "US"]),
    countries: z
      .array(z.enum(["CA", "US"]))
      .min(1)
      .max(2),
    dailyLimit: z.number().int().min(1).max(20),
    monthlyLimit: z.number().int().min(1).max(300),
    searchCredits: z.number().int().min(0).max(100),
    verificationCredits: z.number().int().min(0).max(100),
    discoveryRequests: z.number().int().min(1).max(100),
    intervalHours: z.number().int().min(6).max(168),
    followUpDays: z
      .tuple([z.number().int().min(3).max(14), z.number().int().min(7).max(30)])
      .refine(([a, b]) => b > a),
    minimumScore: z.number().int().min(90).max(100),
    consentScope: z.literal("churnautopsy_audit_outreach"),
  })
  .strict();
export const consentSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    country: z.enum(["CA", "US"]),
    basis: z.literal("express_consent"),
    scope: z.literal("churnautopsy_audit_outreach"),
    source: z
      .url()
      .max(1000)
      .refine((v) => v.startsWith("https://")),
    statement: z.string().trim().min(20).max(2000),
    obtainedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (c) =>
      Date.parse(c.expiresAt) > Date.parse(c.obtainedAt) &&
      Date.parse(c.expiresAt) - Date.parse(c.obtainedAt) <= 366 * 86400000,
  );
export function policyHash(policy: CampaignPolicy) {
  return createHash("sha256")
    .update(JSON.stringify(policySchema.parse(policy)))
    .digest("hex");
}
export function evaluate(
  s: AutomationState,
  contact: Contact,
  company: Company | undefined,
  now = new Date(),
): Contact["eligibility"] {
  const reasons: string[] = [];
  const hash = policyHash(s.policy);
  const q = company?.qualification;
  if (contact.stopped || s.suppressions[contact.email])
    reasons.push("Contact stopped or permanently suppressed");
  if (!company || company.status === "rejected")
    reasons.push("Company unavailable or manually rejected");
  if (
    !q ||
    q.classification !== "confirmed" ||
    (q.score ?? 0) < s.policy.minimumScore
  )
    reasons.push("Business-model evidence is not qualified");
  if (
    !q ||
    now.getTime() - Date.parse(q.checkedAt) > 86400000 ||
    Date.parse(q.checkedAt) > now.getTime()
  )
    reasons.push("Website evidence is stale or missing");
  if (
    q?.flags.some((f) =>
      ["no_solicitation", "nonprofit", "agency", "consumer"].includes(f),
    )
  )
    reasons.push("Published restrictions or excluded business model");
  if (
    contact.verification !== "valid" ||
    !contact.verifiedAt ||
    now.getTime() - Date.parse(contact.verifiedAt) > 7 * 86400000 ||
    Date.parse(contact.verifiedAt) > now.getTime()
  )
    reasons.push("Fresh valid email verification required");
  const consent = s.consents.find((c) => c.email === contact.email);
  if (
    !consent ||
    consent.basis !== "express_consent" ||
    consent.scope !== s.policy.consentScope ||
    Date.parse(consent.obtainedAt) > now.getTime() ||
    Date.parse(consent.expiresAt) <= now.getTime()
  )
    reasons.push(
      "Documented, current express consent for this outreach is required",
    );
  if (consent && !s.policy.countries.includes(consent.country))
    reasons.push("Recipient jurisdiction is outside the approved policy");
  if (
    !s.approval ||
    s.approval.hash !== hash ||
    s.approval.mode !== contact.mode
  )
    reasons.push("Master campaign policy approval required");
  if (!s.policy.senderName || s.policy.postalAddress.length < 10)
    reasons.push("Sender identity and postal mailing address required");
  return {
    allowed: reasons.length === 0,
    reasons,
    checkedAt: now.toISOString(),
    policyHash: hash,
  };
}
export function recordConsent(
  s: AutomationState,
  input: Omit<Consent, "recordedAt">,
  now = new Date(),
) {
  const parsed = consentSchema.parse(input);
  if (
    Date.parse(parsed.obtainedAt) > now.getTime() ||
    Date.parse(parsed.expiresAt) <= now.getTime()
  )
    throw new Error("Consent dates must be current");
  s.consents = s.consents.filter((c) => c.email !== parsed.email);
  s.consents.push({ ...parsed, recordedAt: now.toISOString() });
}
