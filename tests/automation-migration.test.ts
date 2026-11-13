import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { initialAutomation } from "../shared/automation";
import { randomUUID } from "node:crypto";
it("atomically claims state, retains immutable audit and forbids suppression removal or browser access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    for (const name of [
      "202611100001_companies.sql",
      "202611100002_unverified_discovery.sql",
      "202611110001_company_qualification.sql",
      "202611120001_growth_automation.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    await db.exec(
      "insert into companies(domain,name,source,status) values('existing.example','Existing','hunter','saved');set role service_role;",
    );
    const state = initialAutomation();
    state.audit.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      action: "test",
      entityId: "state",
      detail: "No credentials",
    });
    const cas = (rev: number, s: typeof state) =>
      db.query<{ ok: boolean }>(
        "select public.growth_compare_and_swap($1,$2::jsonb) as ok",
        [rev, JSON.stringify(s)],
      );
    expect((await cas(0, state)).rows[0].ok).toBe(true);
    expect((await cas(0, state)).rows[0].ok).toBe(false);
    state.suppressions["optout@example.test"] = {
      at: new Date().toISOString(),
      reason: "unsubscribe",
    };
    expect((await cas(1, state)).rows[0].ok).toBe(true);
    const cleared = structuredClone(state);
    cleared.suppressions = {};
    await expect(cas(2, cleared)).rejects.toThrow("Suppression removal");
    expect(
      (await db.query("select count(*)::int as count from growth_audit")).rows,
    ).toEqual([{ count: 1 }]);
    expect((await db.query("select status from companies")).rows).toEqual([
      { status: "saved" },
    ]);
    await expect(db.exec("delete from growth_audit")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role;set role authenticated");
    await expect(db.query("select state from growth_runtime")).rejects.toThrow(
      /permission denied/,
    );
    await expect(cas(2, state)).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
}, 20000);
