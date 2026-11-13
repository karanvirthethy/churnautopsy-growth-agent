import { LocalQualificationModel } from "./qualification.js";
import type { Config } from "../config.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "../store.js";
import { GrowthEngine, safeEngineConfig } from "./engine.js";
import { MemoryAutomationStore, SupabaseAutomationStore } from "./state.js";
import { GmailMailbox, liveProviders, mockProviders } from "./providers.js";
export function buildAutomation(
  config: Config,
  db: SupabaseClient | null,
  companies: Store,
  env: NodeJS.ProcessEnv = process.env,
) {
  const live = config.mode === "live";
  const gmail =
    live &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REFRESH_TOKEN
      ? new GmailMailbox({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          refreshToken: env.GOOGLE_REFRESH_TOKEN,
          mailbox: "churnautopsy@gmail.com",
        })
      : undefined;
  const paid = live && env.ENABLE_PAID_HUNTER === "true";
  let base = "";
  if (env.UNSUBSCRIBE_BASE_URL) {
    const url = new URL(env.UNSUBSCRIBE_BASE_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("UNSUBSCRIBE_BASE_URL must be an HTTPS origin");
    base = url.origin;
  }
  // Missing mailbox configuration does not prevent dry runs or company discovery.
  const unavailable = new GmailMailbox({
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    mailbox: "churnautopsy@gmail.com",
  });
  const provider = live
    ? liveProviders(
        config.hunterApiKey,
        paid,
        gmail ?? unavailable,
        env.LOCAL_QUALIFICATION_MODEL
          ? new LocalQualificationModel(env.LOCAL_QUALIFICATION_MODEL)
          : undefined,
      )
    : undefined;
  const engine = new GrowthEngine(
    db ? new SupabaseAutomationStore(db) : new MemoryAutomationStore(),
    companies,
    mockProviders(),
    provider,
    {
      ...safeEngineConfig,
      paidHunterEnabled: paid,
      liveSendingConfigured:
        live && !!gmail && env.ENABLE_REAL_SENDING === "true",
      testSendingConfigured:
        live && !!gmail && env.ENABLE_TEST_SENDING === "true",
      workerEnabled: env.AUTOMATION_WORKER_ENABLED === "true",
      unsubscribeBase: base,
      unsubscribeSecret: env.UNSUBSCRIBE_SIGNING_SECRET ?? "",
    },
  );
  return {
    engine,
    gmail,
    testRecipient: env.TEST_RECIPIENT?.trim().toLowerCase(),
  };
}
