import "dotenv/config";
import { readConfig } from "./config.js";
import { createServerSupabase, createOwnerAuth } from "./supabase.js";
import { checkConnections } from "./health.js";
import express from "express";
import path from "node:path";
import { createApp } from "./app.js";
import { demoCompanies } from "./companies.js";
import { discoverHunter } from "./hunter.js";
import { MemoryStore, SupabaseStore } from "./store.js";
const config = readConfig();
const mode = config.mode;
const live = config.mode === "live";
const db = config.mode === "live" ? createServerSupabase(config) : null;
const store = db ? new SupabaseStore(db) : new MemoryStore();
if (!live) await store.discover(demoCompanies);
const app = createApp({
  mode: live ? "live" : "demo",
  store,
  secureCookies: process.env.NODE_ENV === "production",
  discover: () =>
    config.mode === "live"
      ? discoverHunter(config.hunterApiKey)
      : Promise.resolve(demoCompanies),
  ...(config.mode === "live"
    ? {
        ...createOwnerAuth(config),
        health: () => checkConnections(db!, config.hunterApiKey),
      }
    : {}),
});
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log(`Growth workspace API listening (${mode} mode)`),
);
