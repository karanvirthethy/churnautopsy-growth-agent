import "dotenv/config";
import { readConfig } from "./config.js";
import { createServerSupabase } from "./supabase.js";
import { MemoryStore, SupabaseStore } from "./store.js";
import { buildAutomation } from "./automation/runtime.js";
const config = readConfig();
if (process.env.AUTOMATION_WORKER_ENABLED !== "true")
  throw new Error(
    "Worker disabled. Set AUTOMATION_WORKER_ENABLED only after configuration.",
  );
const db = config.mode === "live" ? createServerSupabase(config) : null;
const { engine } = buildAutomation(
  config,
  db,
  db ? new SupabaseStore(db) : new MemoryStore(),
);
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log(
  "Growth automation worker started; persisted policy and sending gates apply.",
);
while (!stopping) {
  try {
    await engine.tick();
  } catch {
    console.error(
      "Automation storage unavailable; no new work dispatched. Check service health.",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
