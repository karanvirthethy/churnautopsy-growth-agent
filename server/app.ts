import type { ConnectionHealth } from "../shared/health.js";
import { demoHealth } from "./health.js";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Store } from "./store.js";
import type { Company } from "../shared/company.js";
interface Options {
  mode: "demo" | "live";
  store: Store;
  discover: () => Promise<Company[]>;
  authenticate?: (token: string) => Promise<boolean>;
  login?: (email: string, password: string) => Promise<string | null>;
  secureCookies?: boolean;
  health?: () => Promise<ConnectionHealth>;
}
export function createApp(options: Options) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "4kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "Cross-origin request denied" });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "JSON required" });
        return;
      }
    }
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, mode: options.mode }),
  );
  app.post(
    "/api/login",
    rateLimit({ windowMs: 15 * 60_000, limit: 10 }),
    async (req, res) => {
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(256) })
        .safeParse(req.body);
      if (!input.success || !options.login) {
        res.status(400).json({ error: "Valid email and password required" });
        return;
      }
      const token = await options.login(input.data.email, input.data.password);
      if (!token) {
        res
          .status(401)
          .json({ error: "Sign-in failed or user is not the workspace owner" });
        return;
      }
      res
        .cookie("session", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: options.secureCookies,
          maxAge: 3600_000,
          path: "/api",
        })
        .json({ ok: true });
    },
  );
  app.post("/api/logout", (_req, res) => {
    res.clearCookie("session", { path: "/api" }).json({ ok: true });
  });
  app.use("/api", async (req, res, next) => {
    if (options.mode === "demo") {
      next();
      return;
    }
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("session="))
      ?.slice(8);
    if (!token || !(await options.authenticate?.(decodeURIComponent(token)))) {
      res.status(401).json({ error: "Sign in to your private workspace" });
      return;
    }
    next();
  });
  app.post(
    "/api/connections/health",
    rateLimit({
      windowMs: 60_000,
      limit: 3,
      message: {
        error: "Connection check limit reached. Try again in one minute.",
      },
    }),
    async (_req, res) => {
      if (options.mode === "demo") {
        res.json(demoHealth);
        return;
      }
      if (!options.health) {
        res.status(503).json({ error: "Connection checks unavailable" });
        return;
      }
      res.json(await options.health());
    },
  );
  app.get("/api/companies", async (_req, res) =>
    res.json({ mode: options.mode, companies: await options.store.list() }),
  );
  app.post(
    "/api/discover",
    rateLimit({
      windowMs: 60_000,
      limit: 3,
      message: { error: "Discovery limit reached. Try again in one minute." },
    }),
    async (_req, res) => {
      const companies = await options.discover();
      await options.store.discover(companies);
      res.json({ mode: options.mode, companies: await options.store.list() });
    },
  );
  app.patch("/api/companies/:domain", async (req, res) => {
    const input = z
      .object({ status: z.enum(["saved", "rejected", "new"]) })
      .strict()
      .safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: "Invalid lead status" });
      return;
    }
    const updated = await options.store.setStatus(
      String(req.params.domain),
      input.data.status,
    );
    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      // Provider errors can contain API keys or prospect payloads; never log/reflect them.
      const malformed = error instanceof SyntaxError;
      res.status(malformed ? 400 : 502).json({
        error: malformed
          ? "Invalid JSON request"
          : "Service unavailable. Check server configuration, provider access, and database migrations, then retry.",
      });
    },
  );
  return app;
}
