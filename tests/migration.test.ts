import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
it("migration enforces deduplication, status/eligibility boundaries, and denies browser roles", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      await readFile("supabase/migrations/202611100001_companies.sql", "utf8"),
    );
    const insert = `insert into companies (domain,name,industry,location,headcount,score,source) values ('fictional.example','Fictional','Software','US','11-50',90,'demo')`;
    await db.exec(insert);
    await expect(db.exec(insert)).rejects.toThrow(/unique/);
    await expect(
      db.exec("update companies set eligibility='approved'"),
    ).rejects.toThrow(/check constraint/);
    await expect(db.exec("update companies set status='sent'")).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      db.exec("update companies set domain='WWW.Example.com'"),
    ).rejects.toThrow(/check constraint/);
    await db.exec("update companies set status='saved'");
    expect(
      (await db.query<{ status: string }>("select status from companies"))
        .rows[0].status,
    ).toBe("saved");
    await db.exec("set role anon");
    await expect(db.query("select * from companies")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await expect(db.query("select * from companies")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    expect((await db.query("select * from companies")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 15000);
