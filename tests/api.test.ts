import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { MemoryStore } from "../server/store";
import { demoCompanies } from "../server/companies";
import { discoverHunter } from "../server/hunter";
describe("private API", () => {
  it("discovers, saves, rejects and preserves decisions across discovery", async () => {
    const app = createApp({
      mode: "demo",
      store: new MemoryStore(),
      discover: async () => demoCompanies,
    });
    const first = await request(app).post("/api/discover").send({});
    expect(first.status).toBe(200);
    expect(first.body.companies).toHaveLength(5);
    const domain = demoCompanies[0].domain;
    expect(
      (
        await request(app)
          .patch(`/api/companies/${domain}`)
          .send({ status: "saved" })
      ).status,
    ).toBe(200);
    await request(app).post("/api/discover").send({});
    expect(
      (await request(app).get("/api/companies")).body.companies[0].status,
    ).toBe("saved");
    await request(app)
      .patch(`/api/companies/${domain}`)
      .send({ status: "rejected" });
    expect(
      (await request(app).get("/api/companies")).body.companies[0].status,
    ).toBe("rejected");
  });
  it("rejects invalid mutations and cross-origin requests", async () => {
    const app = createApp({
      mode: "demo",
      store: new MemoryStore(),
      discover: async () => [],
    });
    expect(
      (
        await request(app)
          .patch("/api/companies/example.com")
          .send({ status: "sent" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/companies/example.com")
          .send({ status: "saved" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/api/discover")
          .set("Origin", "https://evil.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("requires owner authentication before any live data/provider access", async () => {
    const discover = vi.fn();
    const app = createApp({
      mode: "live",
      store: new MemoryStore(),
      discover,
      authenticate: async (token) => token === "owner",
    });
    expect((await request(app).get("/api/companies")).status).toBe(401);
    expect((await request(app).post("/api/discover").send({})).status).toBe(
      401,
    );
    expect(discover).not.toHaveBeenCalled();
    expect(
      (await request(app).get("/api/companies").set("Cookie", "session=other"))
        .status,
    ).toBe(401);
    expect(
      (await request(app).get("/api/companies").set("Cookie", "session=owner"))
        .status,
    ).toBe(200);
  });
  it("uses HttpOnly strict secure cookies for production login", async () => {
    const app = createApp({
      mode: "live",
      store: new MemoryStore(),
      discover: async () => [],
      login: async () => "token",
      secureCookies: true,
    });
    const res = await request(app)
      .post("/api/login")
      .send({ email: "owner@example.com", password: "test-only" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(res.headers["set-cookie"][0]).toContain("Secure");
    expect(res.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(res.body).not.toHaveProperty("token");
  });
  it("redacts provider errors", async () => {
    const app = createApp({
      mode: "demo",
      store: new MemoryStore(),
      discover: async () => {
        throw new Error("api_key=do-not-leak");
      },
    });
    const res = await request(app).post("/api/discover").send({});
    expect(res.status).toBe(502);
    expect(res.text).not.toContain("do-not-leak");
  });
  it("limits repeated credit-spending requests", async () => {
    const app = createApp({
      mode: "demo",
      store: new MemoryStore(),
      discover: async () => [],
    });
    for (let i = 0; i < 3; i++)
      expect((await request(app).post("/api/discover").send({})).status).toBe(
        200,
      );
    expect((await request(app).post("/api/discover").send({})).status).toBe(
      429,
    );
  });
});
describe("Hunter adapter", () => {
  it("uses bounded US small-business discovery and validates upstream results", async () => {
    const mock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              domain: "example.com",
              organization: "Example",
              industry: "Software",
              keywords: ["B2B", "SaaS"],
              country: "US",
              headcount: "11-50",
            },
          ],
        }),
      ),
    );
    try {
      const rows = await discoverHunter("test-key");
      expect(rows[0].score).toBe(100);
      const body = JSON.parse(String(mock.mock.calls[0][1]?.body));
      expect(body.limit).toBe(20);
      expect(body.headquarters_location.include[0].country).toBe("US");
      expect(body.headcount).toEqual(["1-10", "11-50"]);
    } finally {
      mock.mockRestore();
    }
  });
  it("fails on upstream errors instead of substituting demo data", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 429 }));
    try {
      await expect(discoverHunter("test-key")).rejects.toThrow("unavailable");
    } finally {
      mock.mockRestore();
    }
  });
});
