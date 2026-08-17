import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260816000000_initial.sql", import.meta.url);

test("the initial Supabase migration can be applied to an existing preview schema", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.equal((migration.match(/create table if not exists public\./g) ?? []).length, 4);
  assert.equal((migration.match(/create index if not exists /g) ?? []).length, 2);
  assert.equal((migration.match(/drop trigger if exists /g) ?? []).length, 3);
  assert.equal((migration.match(/drop policy if exists /g) ?? []).length, 4);
});
