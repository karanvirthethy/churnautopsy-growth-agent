import { it, expect, vi } from "vitest";
import { HunterContacts, GmailMailbox } from "../server/automation/providers";
import type { Contact, Message } from "../shared/automation";
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
it("Hunter contact calls are disabled without the separate paid gate", async () => {
  const fetcher = vi.fn();
  const hunter = new HunterContacts("test-secret", false, fetcher);
  await expect(hunter.contacts("fictional.example")).rejects.toThrow(
    "disabled",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses found-source Hunter addresses, appropriate roles and explicit verifier status", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        data: {
          emails: [
            {
              value: "founder@fictional.example",
              first_name: "Alex",
              last_name: "Example",
              position: "Founder",
              sources: [{ uri: "https://fictional.example/team" }],
            },
            {
              value: "guessed@fictional.example",
              position: "CEO",
              sources: [],
            },
            {
              value: "other@external.example",
              position: "CEO",
              sources: [{ uri: "https://fictional.example/team" }],
            },
          ],
        },
      }),
    )
    .mockResolvedValueOnce(json({ data: { status: "accept_all" } }));
  const hunter = new HunterContacts("test-secret", true, fetcher);
  const rows = await hunter.contacts("fictional.example");
  expect(rows).toHaveLength(1);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("provenance")).toBe("found");
  expect(url.searchParams.get("limit")).toBe("10");
  expect(await hunter.verify(rows[0].email)).toBe("unknown");
});
it("Finder refuses an inferred address without a public source", async () => {
  const hunter = new HunterContacts(
    "test-secret",
    true,
    vi
      .fn()
      .mockResolvedValue(
        json({ data: { email: "guessed@fictional.example", sources: [] } }),
      ),
  );
  expect(await hunter.find("fictional.example", "Alex", "Example")).toBeNull();
});
const contact = { id: "test", email: "recipient@example.test" } as Contact;
const message = {
  id: "00000000-0000-4000-8000-000000000001",
  subject: "A free churn audit",
  body: "Verified business-model evidence. Sender address.",
} as Message;
it("Gmail verifies the mailbox and builds plain-text MIME with working unsubscribe headers", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ access_token: "test-access" }))
    .mockResolvedValueOnce(json({ emailAddress: "churnautopsy@gmail.com" }))
    .mockResolvedValueOnce(json({ id: "message-1", threadId: "thread-1" }));
  const gmail = new GmailMailbox(
    {
      clientId: "test-client",
      clientSecret: "test-client-secret",
      refreshToken: "test-refresh",
      mailbox: "churnautopsy@gmail.com",
    },
    fetcher,
  );
  await gmail.send(
    message,
    contact,
    "https://unsubscribe.example/u/test",
    "Sender Name",
  );
  expect(String(fetcher.mock.calls[2][0])).toBe(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  );
  const raw = JSON.parse(fetcher.mock.calls[2][1].body).raw;
  const mime = Buffer.from(raw, "base64url").toString();
  expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  expect(mime).toContain("Message-ID: <growth.");
  expect(mime).toContain("Content-Type: text/plain");
  expect(mime).not.toContain("test-refresh");
});
it("Gmail fails closed for a different authorized mailbox and never retries send", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ access_token: "test-access" }))
    .mockResolvedValueOnce(json({ emailAddress: "other@example.test" }));
  const gmail = new GmailMailbox(
    {
      clientId: "test-client",
      clientSecret: "test-secret",
      refreshToken: "test-refresh",
      mailbox: "churnautopsy@gmail.com",
    },
    fetcher,
  );
  await expect(
    gmail.send(
      message,
      contact,
      "https://unsubscribe.example/u/test",
      "Sender",
    ),
  ).rejects.toThrow("does not match");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("Gmail decodes inbound plain text and detects delivery failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ access_token: "test-access" }))
    .mockResolvedValueOnce(json({ messages: [{ id: "incoming" }] }))
    .mockResolvedValueOnce(
      json({
        threadId: "thread",
        internalDate: Date.parse("2026-11-12T00:00:00Z"),
        payload: {
          mimeType: "multipart/report",
          headers: [
            {
              name: "From",
              value: "Mail Delivery <mailer-daemon@example.test>",
            },
            { name: "Content-Type", value: "multipart/report" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(
                  "Delivery failed to recipient@example.test",
                ).toString("base64url"),
              },
            },
          ],
        },
      }),
    );
  const gmail = new GmailMailbox(
    {
      clientId: "test-client",
      clientSecret: "test-secret",
      refreshToken: "test-refresh",
      mailbox: "churnautopsy@gmail.com",
    },
    fetcher,
  );
  const result = await gmail.inbox("2026-11-11T00:00:00Z");
  expect(result[0].bounce).toBe(true);
  expect(result[0].text).toContain("Delivery failed");
});
it("Hunter pending HTTP 202 never becomes verified", async () => {
  const hunter = new HunterContacts(
    "test-secret",
    true,
    vi.fn().mockResolvedValue(new Response("", { status: 202 })),
  );
  await expect(hunter.verify("pending@fictional.example")).rejects.toThrow(
    "unavailable",
  );
});
