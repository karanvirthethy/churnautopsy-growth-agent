import { z } from "zod";
export type LiveConfig = {
  mode: "live";
  supabaseUrl: string;
  supabaseSecretKey: string;
  ownerUserId: string;
  hunterApiKey: string;
};
export type Config = { mode: "demo" } | LiveConfig;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.DATA_MODE ?? "demo";
  if (mode === "demo") return { mode };
  if (mode !== "live") throw new Error("DATA_MODE must be demo or live");
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "OWNER_USER_ID",
    "HUNTER_API_KEY",
  ])
    if (!env[name]?.trim())
      throw new Error(`Missing required server configuration: ${name}`);
  let url: URL;
  try {
    url = new URL(env.SUPABASE_URL!);
  } catch {
    throw new Error("SUPABASE_URL must be a hosted Supabase HTTPS project URL");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("SUPABASE_URL must be a hosted Supabase HTTPS project URL");
  if (!z.uuid().safeParse(env.OWNER_USER_ID).success)
    throw new Error("OWNER_USER_ID must be the Supabase Auth user's UUID");
  // Do not JWT-decode or prefix-validate secrets: Codex may inject proxy placeholders.
  return {
    mode,
    supabaseUrl: url.origin,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY!,
    ownerUserId: env.OWNER_USER_ID!,
    hunterApiKey: env.HUNTER_API_KEY!,
  };
}
