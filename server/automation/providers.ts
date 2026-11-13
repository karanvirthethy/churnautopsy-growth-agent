import { qualifyWithModel, type QualificationModel } from "./qualification.js";
import { z } from "zod";
import type { Company } from "../../shared/company.js";
import type { Contact, Message } from "../../shared/automation.js";
import { discoverHunter } from "../hunter.js";
import type { SearchProfileId } from "../../shared/searches.js";
import { normalizeDomain, mapHunter } from "../companies.js";
import { qualify } from "../qualify.js";
import { researchWebsite } from "../website.js";
export interface FoundContact {
  email: string;
  name: string;
  role: string;
  sources: string[];
}
export interface Incoming {
  id: string;
  threadId: string;
  from: string;
  text: string;
  at: string;
  bounce: boolean;
}
export interface Providers {
  kind: "mock" | "live";
  discover(profile: SearchProfileId): Promise<Company[]>;
  research(domain: string): Promise<Company["qualification"]>;
  contacts(domain: string): Promise<FoundContact[]>;
  verify(email: string): Promise<"valid" | "invalid" | "unknown">;
  send(
    message: Message,
    contact: Contact,
    unsubscribe: string,
    senderName: string,
  ): Promise<{ id: string; threadId: string }>;
  inbox(since: string): Promise<Incoming[]>;
}
const sourceSchema = z.object({ uri: z.url() });
const foundSchema = z.object({
  value: z.email(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  sources: z.array(sourceSchema).default([]),
});
export class HunterContacts {
  constructor(
    private key: string,
    private enabled: boolean,
    private transport: typeof fetch = fetch,
  ) {}
  private async get(path: string, params: Record<string, string>) {
    if (!this.enabled) throw new Error("Paid Hunter access is disabled");
    const url = new URL(`https://api.hunter.io/v2/${path}`);
    for (const [key, value] of Object.entries({ ...params, api_key: this.key }))
      url.searchParams.set(key, value);
    try {
      const response = await this.transport(url, {
        redirect: "error",
        signal: AbortSignal.timeout(path === "email-verifier" ? 25000 : 15000),
      });
      if (!response.ok || response.status === 202) throw new Error();
      return await response.json();
    } catch {
      throw new Error("Hunter contact service unavailable");
    }
  }
  async contacts(domain: string): Promise<FoundContact[]> {
    domain = normalizeDomain(domain);
    const response = z
      .object({ data: z.object({ emails: z.array(foundSchema) }) })
      .parse(
        await this.get("domain-search", {
          domain,
          limit: "10",
          offset: "0",
          type: "personal",
          provenance: "found",
          seniority: "executive,senior",
          required_field: "full_name,position",
        }),
      );
    return response.data.emails
      .filter(
        (e) =>
          e.sources.length &&
          e.value.toLowerCase().endsWith(`@${domain}`) &&
          /founder|\bCEO\b|chief executive|customer success|head of (?:growth|retention)/i.test(
            e.position ?? "",
          ),
      )
      .slice(0, 1)
      .map((e) => ({
        email: e.value.toLowerCase(),
        name: [e.first_name, e.last_name].filter(Boolean).join(" "),
        role: e.position!,
        sources: e.sources
          .map((s) => s.uri)
          .filter((u) => u.startsWith("https://"))
          .slice(0, 5),
      }))
      .filter((e) => e.sources.length);
  }
  // Finder is supported for an already identified person; inferred addresses without public sources are discarded.
  async find(
    domain: string,
    firstName: string,
    lastName: string,
  ): Promise<FoundContact | null> {
    domain = normalizeDomain(domain);
    const result = z
      .object({
        data: z.object({
          email: z.email().nullable(),
          sources: z.array(sourceSchema).default([]),
          position: z.string().nullable().optional(),
        }),
      })
      .parse(
        await this.get("email-finder", {
          domain,
          first_name: firstName,
          last_name: lastName,
        }),
      );
    const d = result.data;
    if (!d.email?.toLowerCase().endsWith(`@${domain}`) || !d.sources.length)
      return null;
    return {
      email: d.email.toLowerCase(),
      name: `${firstName} ${lastName}`,
      role: d.position ?? "",
      sources: d.sources
        .map((s) => s.uri)
        .filter((s) => s.startsWith("https://")),
    };
  }
  async verify(email: string): Promise<"valid" | "invalid" | "unknown"> {
    const result = z
      .object({ data: z.object({ status: z.string() }) })
      .parse(await this.get("email-verifier", { email }));
    return result.data.status === "valid"
      ? "valid"
      : result.data.status === "invalid"
        ? "invalid"
        : "unknown";
  }
}
export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  mailbox: string;
}
export class GmailMailbox {
  constructor(
    private config: GmailConfig,
    private transport: typeof fetch = fetch,
  ) {}
  private async token() {
    try {
      const res = await this.transport("https://oauth2.googleapis.com/token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const data = z
        .object({ access_token: z.string().min(1) })
        .parse(await res.json());
      if (!res.ok) throw new Error();
      return data.access_token;
    } catch {
      throw new Error("Mailbox authorization unavailable");
    }
  }
  private async call(path: string, token: string, init: RequestInit = {}) {
    try {
      const response = await this.transport(
        `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
        {
          ...init,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      throw new Error("Mailbox request failed; delivery may be uncertain");
    }
  }
  async send(
    message: Message,
    contact: Contact,
    unsubscribe: string,
    senderName: string,
  ) {
    const token = await this.token();
    const profile = z
      .object({ emailAddress: z.email() })
      .parse(await this.call("profile", token));
    if (
      profile.emailAddress.toLowerCase() !== this.config.mailbox ||
      this.config.mailbox !== "churnautopsy@gmail.com"
    )
      throw new Error("Authorized mailbox does not match sender");
    if (
      /[\r\n]/.test(
        contact.email + senderName + message.subject + unsubscribe,
      ) ||
      !z.email().safeParse(contact.email).success
    )
      throw new Error("Invalid mail headers");
    const headers = [
      `From: =?UTF-8?B?${Buffer.from(senderName).toString("base64")}?= <${this.config.mailbox}>`,
      `To: ${contact.email}`,
      `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
      `Message-ID: <growth.${message.id}@gmail.com>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      `List-Unsubscribe: <${unsubscribe}>`,
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ];
    if (message.replyToId)
      headers.push(
        `In-Reply-To: <growth.${message.replyToId}@gmail.com>`,
        `References: <growth.${message.replyToId}@gmail.com>`,
      );
    const body = `${message.body}\n\nUnsubscribe: ${unsubscribe}`;
    const raw = Buffer.from(
      headers.join("\r\n") +
        "\r\n\r\n" +
        Buffer.from(body)
          .toString("base64")
          .match(/.{1,76}/g)!
          .join("\r\n"),
    ).toString("base64url");
    // Gmail has no idempotency key for send. Caller must reserve once and never retry an ambiguous send.
    return z.object({ id: z.string(), threadId: z.string() }).parse(
      await this.call("messages/send", token, {
        method: "POST",
        body: JSON.stringify({
          raw,
          ...(message.threadId ? { threadId: message.threadId } : {}),
        }),
      }),
    );
  }
  async inbox(since: string): Promise<Incoming[]> {
    const token = await this.token();
    const output: Incoming[] = [];
    let pageToken = "";
    const after = Math.floor((Date.parse(since) - 3600000) / 1000);
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({
        q: `after:${after} -in:sent -in:drafts`,
        maxResults: "20",
        includeSpamTrash: "true",
        ...(pageToken ? { pageToken } : {}),
      });
      const list = z
        .object({
          messages: z.array(z.object({ id: z.string() })).optional(),
          nextPageToken: z.string().optional(),
        })
        .parse(await this.call(`messages?${params}`, token));
      for (const item of list.messages ?? []) {
        const data = await this.call(
          `messages/${encodeURIComponent(item.id)}?format=full`,
          token,
        );
        const payload = data.payload ?? {};
        const headers: Array<{ name: string; value: string }> =
          payload.headers ?? [];
        const header = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
        const text = decodeBody(payload).slice(0, 12000);
        output.push({
          id: item.id,
          threadId: String(data.threadId ?? ""),
          from: extractAddress(header("from")),
          text,
          at: new Date(Number(data.internalDate)).toISOString(),
          bounce:
            /multipart\/report/i.test(header("content-type")) ||
            /mailer-daemon|postmaster/i.test(header("from")),
        });
      }
      pageToken = list.nextPageToken ?? "";
      if (!pageToken) return output;
    }
    throw new Error(
      "Mailbox backlog exceeds safe polling budget; sending paused",
    );
  }
}
function decodeBody(part: {
  mimeType?: string;
  body?: { data?: string };
  parts?: unknown[];
}): string {
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.parts ?? []).map((p) => decodeBody(p as typeof part)).join("\n");
}
export function extractAddress(input: string) {
  return (input.match(/<([^<>]+)>/)?.[1] ?? input).trim().toLowerCase();
}
export function liveProviders(
  key: string,
  paid: boolean,
  gmail: GmailMailbox,
  model?: QualificationModel,
): Providers {
  const hunter = new HunterContacts(key, paid);
  return {
    kind: "live",
    discover: discoverHunter.bind(null, key),
    research: async (domain) =>
      qualifyWithModel(await researchWebsite(domain), model),
    contacts: (domain) => hunter.contacts(domain),
    verify: (email) => hunter.verify(email),
    send: (...args) => gmail.send(...args),
    inbox: (since) => gmail.inbox(since),
  };
}
export function mockProviders(now = () => new Date()): Providers {
  return {
    kind: "mock",
    discover: async () => [
      mapHunter({
        domain: "auditpilot.example",
        organization: "Audit Pilot (fictional)",
      }),
    ],
    research: async (domain) =>
      qualify(
        [
          {
            url: `https://${domain}/`,
            status: "ok",
            text: "Cloud-based software for businesses. Our platform helps your team manage subscriptions.",
          },
          {
            url: `https://${domain}/pricing`,
            status: "ok",
            text: "Monthly subscription plans billed annually.",
          },
        ],
        now(),
      ),
    contacts: async (domain) => [
      {
        email: `founder@${domain}`,
        name: "Alex Example",
        role: "Founder",
        sources: [`https://${domain}/team`],
      },
    ],
    verify: async () => "valid",
    send: async (message) => ({
      id: `simulated-${message.id}`,
      threadId: `simulated-thread-${message.id}`,
    }),
    inbox: async () => [],
  };
}
