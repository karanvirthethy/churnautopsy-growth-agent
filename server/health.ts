import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectionCheck, ConnectionHealth } from "../shared/health.js";
export const demoHealth: ConnectionHealth = {
  supabase: { status: "demo", message: "Demo mode: no database request made." },
  hunter: { status: "demo", message: "Demo mode: no Hunter request made." },
};
export async function checkConnections(
  db: SupabaseClient,
  hunterKey: string,
  transport: typeof fetch = fetch,
): Promise<ConnectionHealth> {
  const supabase = async (): Promise<ConnectionCheck> => {
    try {
      // HEAD checks schema/access without returning company records or modifying data.
      const { error } = await db
        .from("companies")
        .select(
          "id,domain,name,industry,location,headcount,score,reasons,status,source,eligibility,created_at,updated_at,qualification",
          { head: true },
        )
        .limit(1);
      if (error) throw new Error("Unavailable");
      return {
        status: "healthy",
        message:
          "Database reachable; expected company columns accessible. No data changed.",
      };
    } catch {
      return {
        status: "error",
        message:
          "Check the Supabase project URL, secret binding, network access, and all Growth Agent migrations.",
      };
    }
  };
  const hunter = async (): Promise<ConnectionCheck> => {
    try {
      // Account is a read-only credential check, not discovery/enrichment or sending.
      const response = await transport(
        `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(hunterKey)}`,
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      if (!response.ok) throw new Error("Unavailable");
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("data" in body) ||
        !body.data ||
        typeof body.data !== "object" ||
        Array.isArray(body.data)
      )
        throw new Error("Unexpected response");
      return {
        status: "healthy",
        message:
          "Hunter account reachable. Discovery availability is checked when you find leads.",
      };
    } catch {
      return {
        status: "error",
        message:
          "Check the Hunter secret binding, account access, network access, and request limits.",
      };
    }
  };
  const [database, account] = await Promise.all([supabase(), hunter()]);
  return { supabase: database, hunter: account };
}
