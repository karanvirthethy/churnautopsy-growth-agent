import type { Company } from "./company.js";
export type ExecutionMode = "dry_run" | "live";
export interface CampaignPolicy {
  name: string;
  senderName: string;
  senderEmail: string;
  postalAddress: string;
  senderCountry: "CA" | "US";
  countries: Array<"CA" | "US">;
  dailyLimit: number;
  monthlyLimit: number;
  searchCredits: number;
  verificationCredits: number;
  discoveryRequests: number;
  intervalHours: number;
  followUpDays: [number, number];
  minimumScore: number;
  consentScope: "churnautopsy_audit_outreach";
}
export interface Consent {
  email: string;
  country: "CA" | "US";
  basis: "express_consent";
  scope: "churnautopsy_audit_outreach";
  source: string;
  statement: string;
  obtainedAt: string;
  expiresAt: string;
  recordedAt: string;
}
export interface Contact {
  id: string;
  mode: ExecutionMode;
  domain: string;
  name: string;
  role: string;
  email: string;
  sources: string[];
  verification: "pending" | "valid" | "invalid" | "unknown";
  verifiedAt?: string;
  eligibility: {
    allowed: boolean;
    reasons: string[];
    checkedAt: string;
    policyHash: string;
  };
  stopped?: string;
}
export type JobKind =
  "discover" | "research" | "contacts" | "verify" | "plan" | "send" | "sync";
export interface Job {
  id: string;
  key: string;
  kind: JobKind;
  mode: ExecutionMode;
  target: string;
  dueAt: string;
  state: "queued" | "running" | "done" | "failed" | "cancelled";
  attempts: number;
  leaseUntil?: string;
  error?: string;
}
export interface Message {
  id: string;
  contactId: string;
  mode: ExecutionMode;
  step: number;
  subject: string;
  body: string;
  policyHash: string;
  evidenceUrls: string[];
  dueAt: string;
  status:
    "queued" | "sending" | "sent" | "simulated" | "uncertain" | "cancelled";
  providerId?: string;
  threadId?: string;
  replyToId?: string;
  sentAt?: string;
}
export interface Reply {
  id: string;
  contactId: string;
  text: string;
  receivedAt: string;
  category:
    | "interested"
    | "not_interested"
    | "unsubscribe"
    | "bounce"
    | "needs_attention";
}
export interface Opportunity {
  id: string;
  contactId: string;
  stage:
    "interested" | "audit_requested" | "in_progress" | "converted" | "closed";
  createdAt: string;
  updatedAt: string;
  notes: string;
}
export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  entityId: string;
  detail: string;
}
export interface Usage {
  discovery: number;
  search: number;
  verification: number;
  sends: number;
  simulated: number;
}
export interface AutomationState {
  schema: 1;
  mode: ExecutionMode;
  paused: boolean;
  sendingEnabled: boolean;
  policy: CampaignPolicy;
  approval?: { hash: string; at: string; mode: ExecutionMode };
  testReceipt?: {
    at: string;
    providerId: string;
    recipient: string;
    contactId?: string;
    policyHash?: string;
    confirmedAt?: string;
  };
  nextDiscoveryAt?: string;
  nextSyncAt?: string;
  lastSyncAt?: string;
  lastHeartbeat?: string;
  profileIndex: number;
  prospects: Record<string, Company>;
  contacts: Contact[];
  consents: Consent[];
  suppressions: Record<string, { at: string; reason: string }>;
  jobs: Job[];
  messages: Message[];
  replies: Reply[];
  opportunities: Opportunity[];
  usage: Record<string, Usage>;
  dailySends: Record<string, number>;
  audit: AuditEvent[];
  alerts: Array<{
    id: string;
    at: string;
    message: string;
    acknowledged: boolean;
  }>;
}
export interface AutomationView extends AutomationState {
  capabilities: {
    liveSendingConfigured: boolean;
    paidHunterEnabled: boolean;
    testSendingConfigured: boolean;
    workerEnabled: boolean;
    unsubscribeConfigured: boolean;
  };
}
export const defaultPolicy: CampaignPolicy = {
  name: "ChurnAutopsy free churn audit",
  senderName: "",
  senderEmail: "churnautopsy@gmail.com",
  postalAddress: "",
  senderCountry: "CA",
  countries: ["US", "CA"],
  dailyLimit: 5,
  monthlyLimit: 50,
  searchCredits: 0,
  verificationCredits: 0,
  discoveryRequests: 30,
  intervalHours: 24,
  followUpDays: [4, 9],
  minimumScore: 90,
  consentScope: "churnautopsy_audit_outreach",
};
export function initialAutomation(): AutomationState {
  return {
    schema: 1,
    mode: "dry_run",
    paused: true,
    sendingEnabled: false,
    policy: { ...defaultPolicy },
    profileIndex: 0,
    prospects: {},
    contacts: [],
    consents: [],
    suppressions: {},
    jobs: [],
    messages: [],
    replies: [],
    opportunities: [],
    usage: {},
    dailySends: {},
    audit: [],
    alerts: [],
  };
}
