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

it("upgrades legacy Hunter metadata to unknown without changing decisions or demo records", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      await readFile("supabase/migrations/202611100001_companies.sql", "utf8"),
    );
    await db.exec(`insert into companies (domain,name,industry,location,headcount,score,source,status) values
      ('legacy.example','Legacy','Software','US','11-50',100,'hunter','saved'),
      ('demo.example','Demo','Software','US','11-50',90,'demo','rejected')`);
    await db.exec(
      await readFile(
        "supabase/migrations/202611100002_unverified_discovery.sql",
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select industry,location,headcount,score,status from companies where domain='legacy.example'",
        )
      ).rows[0],
    ).toEqual({
      industry: null,
      location: null,
      headcount: null,
      score: null,
      status: "saved",
    });
    expect(
      (
        await db.query(
          "select score,status from companies where domain='demo.example'",
        )
      ).rows[0],
    ).toEqual({ score: 90, status: "rejected" });
    await db.exec(
      "insert into companies (domain,name,source) values ('minimal.example','Minimal','hunter')",
    );
    expect(
      (
        await db.query(
          "select score,headcount from companies where domain='minimal.example'",
        )
      ).rows[0],
    ).toEqual({ score: null, headcount: null });
    await expect(db.exec("update companies set score=101")).rejects.toThrow(
      /check constraint/,
    );
    await db.exec("set role authenticated");
    await expect(db.query("select * from companies")).rejects.toThrow(
      /permission denied/,
    );
  } finally {
    await db.close();
  }
}, 15000);

it("existing migrations allow the secret-key service_role to store unknowns and preserve decisions on conflict", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    for (const file of [
      "202611100001_companies.sql",
      "202611100002_unverified_discovery.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec("set role service_role");
    await db.exec(
      "insert into companies (domain,name,source) values ('secret-key.example','Synthetic','hunter')",
    );
    await db.exec(
      "update companies set status='saved' where domain='secret-key.example'",
    );
    await db.exec(
      "insert into companies (domain,name,source) values ('secret-key.example','Synthetic','hunter') on conflict (domain) do nothing",
    );
    const { rows } = await db.query(
      "select industry,headcount,location,score,status,eligibility from companies",
    );
    expect(rows).toEqual([
      {
        industry: null,
        headcount: null,
        location: null,
        score: null,
        status: "saved",
        eligibility: "not_assessed",
      },
    ]);
    await db.exec("reset role; set role anon");
    await expect(db.query("select * from companies")).rejects.toThrow(
      /permission denied/,
    );
  } finally {
    await db.close();
  }
}, 15000);
