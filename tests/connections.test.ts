import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { readConfig, type LiveConfig } from "../server/config";
import { createOwnerAuth, createServerSupabase } from "../server/supabase";
import { checkConnections } from "../server/health";
import { createApp } from "../server/app";
import { MemoryStore } from "../server/store";
const owner = "12345678-1234-4234-8234-123456789abc";
const config: LiveConfig = {
  mode: "live",
  supabaseUrl: "https://fictional.supabase.co",
  supabaseSecretKey: "sb_secret_synthetic-test-only",
  ownerUserId: owner,
  hunterApiKey: "synthetic-hunter-test-only",
};
const env = {
  DATA_MODE: "live",
  SUPABASE_URL: config.supabaseUrl,
  SUPABASE_SECRET_KEY: config.supabaseSecretKey,
  OWNER_USER_ID: owner,
  HUNTER_API_KEY: config.hunterApiKey,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
describe("server configuration", () => {
  it("keeps demo independent of provider credentials", () =>
    expect(readConfig({})).toEqual({ mode: "demo" }));
  it("accepts current secret keys and proxy placeholders without JWT assumptions", () => {
    expect(readConfig(env)).toEqual(config);
    expect(
      readConfig({ ...env, SUPABASE_SECRET_KEY: "proxy-placeholder" }),
    ).toMatchObject({ supabaseSecretKey: "proxy-placeholder" });
  });
  it("requires the new key name and validates URL/owner without revealing input", () => {
    expect(() =>
      readConfig({
        ...env,
        SUPABASE_SECRET_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "legacy",
      }),
    ).toThrow("SUPABASE_SECRET_KEY");
    for (const url of [
      "http://fictional.supabase.co",
      "https://evil.example",
      "https://secret@fictional.supabase.co",
      "https://fictional.supabase.co/?key=secret",
    ])
      expect(() => readConfig({ ...env, SUPABASE_URL: url })).toThrow(
        /^SUPABASE_URL must/,
      );
    expect(() => readConfig({ ...env, OWNER_USER_ID: "secret" })).toThrow(
      "OWNER_USER_ID must",
    );
  });
});
describe("Supabase transport and owner auth", () => {
  it.each([config.supabaseSecretKey, "proxy-placeholder"])(
    "uses apikey, not a secret bearer JWT (%s)",
    async (secret) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(json([]));
      await createServerSupabase(
        { ...config, supabaseSecretKey: secret },
        transport,
      )
        .from("companies")
        .select("domain");
      const headers = new Headers(transport.mock.calls[0][1]?.headers);
      expect(headers.get("apikey")).toBe(secret);
      expect(headers.has("authorization")).toBe(false);
      expect(transport.mock.calls[0][1]?.redirect).toBe("error");
      expect(transport.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    },
  );
  it("keeps user bearer tokens for verification and denies non-owners", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: owner }));
    const auth = createOwnerAuth(config, transport);
    expect(await auth.authenticate("user-jwt")).toBe(true);
    expect(
      new Headers(transport.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer user-jwt");
    transport.mockResolvedValue(json({ id: "another-user" }));
    expect(await auth.authenticate("other-jwt")).toBe(false);
    transport.mockResolvedValue(
      json({ message: "credential-containing-provider-error" }, 401),
    );
    expect(await auth.authenticate("invalid")).toBe(false);
  });
  it("authenticates owner login without altering the database client", async () => {
    const token = [
      Buffer.from('{"alg":"HS256"}').toString("base64url"),
      Buffer.from(
        JSON.stringify({
          sub: owner,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "signature",
    ].join(".");
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: owner },
      }),
    );
    const db = createServerSupabase(config, transport);
    expect(
      await createOwnerAuth(config, transport).login(
        "owner@example.com",
        "synthetic-password",
      ),
    ).toBe(token);
    expect(
      new Headers(transport.mock.calls[0][1]?.headers).has("authorization"),
    ).toBe(false);
    transport.mockResolvedValue(json([]));
    await db.from("companies").select("domain");
    expect(
      new Headers(transport.mock.calls.at(-1)?.[1]?.headers).has(
        "authorization",
      ),
    ).toBe(false);
    transport.mockResolvedValue(
      json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "someone-else" },
      }),
    );
    expect(
      await createOwnerAuth(config, transport).login(
        "other@example.com",
        "synthetic-password",
      ),
    ).toBeNull();
  });
});
describe("connection checks", () => {
  it("checks schema with HEAD and Hunter account with no enrichment or row retrieval", async () => {
    const database = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const hunter = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: { email: "private@example.com" } }));
    const result = await checkConnections(
      createServerSupabase(config, database),
      config.hunterApiKey,
      hunter,
    );
    expect(result.supabase.status).toBe("healthy");
    expect(result.hunter.status).toBe("healthy");
    expect(database).toHaveBeenCalledTimes(1);
    expect(database.mock.calls[0][1]?.method).toBe("HEAD");
    expect(String(database.mock.calls[0][0])).toContain("/rest/v1/companies?");
    expect(hunter).toHaveBeenCalledTimes(1);
    expect(String(hunter.mock.calls[0][0])).toContain("/v2/account?");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
  });
  it("redacts permission, schema, network and timeout errors independently", async () => {
    const database = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: config.supabaseSecretKey }, 403));
    const hunter = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(config.hunterApiKey));
    const result = await checkConnections(
      createServerSupabase(config, database),
      config.hunterApiKey,
      hunter,
    );
    expect(result.supabase.status).toBe("error");
    expect(result.hunter.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(config.supabaseSecretKey);
    expect(JSON.stringify(result)).not.toContain(config.hunterApiKey);
    hunter.mockResolvedValue(json({ data: {} }));
    expect(
      (
        await checkConnections(
          createServerSupabase(config, database),
          config.hunterApiKey,
          hunter,
        )
      ).hunter.status,
    ).toBe("healthy");
    hunter.mockResolvedValue(json({ data: null }));
    expect(
      (
        await checkConnections(
          createServerSupabase(config, database),
          config.hunterApiKey,
          hunter,
        )
      ).hunter.status,
    ).toBe("error");
  });
  it("requires the owner before any check and keeps demo offline", async () => {
    const health = vi.fn();
    const live = createApp({
      mode: "live",
      store: new MemoryStore(),
      discover: async () => [],
      authenticate: async (token) => token === "owner",
      health,
    });
    expect(
      (await request(live).post("/api/connections/health").send({})).status,
    ).toBe(401);
    expect(
      (
        await request(live)
          .post("/api/connections/health")
          .set("Cookie", "session=other")
          .send({})
      ).status,
    ).toBe(401);
    expect(health).not.toHaveBeenCalled();
    health.mockResolvedValue({
      supabase: { status: "healthy", message: "ok" },
      hunter: { status: "error", message: "unavailable" },
    });
    expect(
      (
        await request(live)
          .post("/api/connections/health")
          .set("Cookie", "session=owner")
          .send({})
      ).body.hunter.status,
    ).toBe("error");
    const demo = createApp({
      mode: "demo",
      store: new MemoryStore(),
      discover: async () => [],
      health,
    });
    health.mockClear();
    for (let i = 0; i < 3; i++)
      expect(
        (await request(demo).post("/api/connections/health").send({})).body
          .supabase.status,
      ).toBe("demo");
    expect(
      (await request(demo).post("/api/connections/health").send({})).status,
    ).toBe(429);
    expect(health).not.toHaveBeenCalled();
  });
});
