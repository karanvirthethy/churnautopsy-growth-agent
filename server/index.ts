import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import path from "node:path";
import { createApp } from "./app.js";
import { demoCompanies } from "./companies.js";
import { discoverHunter } from "./hunter.js";
import { MemoryStore, SupabaseStore } from "./store.js";
const mode = process.env.DATA_MODE ?? "demo";
if (!["demo", "live"].includes(mode))
  throw new Error("DATA_MODE must be demo or live");
const live = mode === "live";
if (live)
  for (const key of [
    "HUNTER_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OWNER_USER_ID",
  ])
    if (!process.env[key])
      throw new Error(`Missing required server configuration: ${key}`);
const db = live
  ? createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  : null;
const store = db ? new SupabaseStore(db) : new MemoryStore();
if (!live) await store.discover(demoCompanies);
const app = createApp({
  mode: live ? "live" : "demo",
  store,
  secureCookies: process.env.NODE_ENV === "production",
  discover: () =>
    live
      ? discoverHunter(process.env.HUNTER_API_KEY!)
      : Promise.resolve(demoCompanies),
  authenticate: async (token) => {
    const { data, error } = await db!.auth.getUser(token);
    return !error && data.user?.id === process.env.OWNER_USER_ID;
  },
  login: async (email, password) => {
    if (!db) return null;
    // Separate client prevents sign-in from replacing the service-role client's auth context.
    const auth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password,
    });
    return !error && data.user?.id === process.env.OWNER_USER_ID
      ? (data.session?.access_token ?? null)
      : null;
  },
});
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log(`Growth workspace API listening (${mode} mode)`),
);
