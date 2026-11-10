import { createClient } from "@supabase/supabase-js";
import type { LiveConfig } from "./config.js";
export function createServerSupabase(
  config: LiveConfig,
  transport: typeof fetch = fetch,
) {
  const safeFetch: typeof fetch = async (input, init) => {
    try {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== config.supabaseUrl)
        throw new Error("Unexpected destination");
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set("apikey", config.supabaseSecretKey);
      // sb_secret_ and proxy placeholders are not JWTs. Keep real user JWTs intact.
      if (headers.get("Authorization") === `Bearer ${config.supabaseSecretKey}`)
        headers.delete("Authorization");
      const timeout = AbortSignal.timeout(10000);
      const signal = init?.signal
        ? AbortSignal.any([init.signal, timeout])
        : timeout;
      return await transport(input, {
        ...init,
        headers,
        signal,
        redirect: "error",
      });
    } catch {
      throw new Error("Supabase request failed");
    }
  };
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: safeFetch },
  });
}
export function createOwnerAuth(
  config: LiveConfig,
  transport: typeof fetch = fetch,
) {
  // Never sign in on the persistence client: auth sessions must not replace its elevated key.
  return {
    authenticate: async (token: string) => {
      try {
        const { data, error } = await createServerSupabase(
          config,
          transport,
        ).auth.getUser(token);
        return !error && data.user?.id === config.ownerUserId;
      } catch {
        return false;
      }
    },
    login: async (email: string, password: string) => {
      try {
        const { data, error } = await createServerSupabase(
          config,
          transport,
        ).auth.signInWithPassword({ email, password });
        return !error && data.user?.id === config.ownerUserId
          ? (data.session?.access_token ?? null)
          : null;
      } catch {
        return null;
      }
    },
  };
}
