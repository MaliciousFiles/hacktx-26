import { readFile } from "node:fs/promises";
import type { SqlConnection } from "./store.js";

export async function migrate(
  db: SqlConnection & { exec?: (sql: string) => Promise<unknown> },
): Promise<void> {
  const sql = await readFile(new URL("../../migrations/001_storage.sql", import.meta.url), "utf8");
  await db.query("BEGIN");
  try {
    if (db.exec) await db.exec(sql);
    else await db.query(sql);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function databaseStatus(db: SqlConnection) {
  const result = await db.query(`SELECT
    (SELECT count(*)::int FROM research.runs) AS runs,
    (SELECT count(*)::int FROM research.people) AS people,
    (SELECT count(*)::int FROM research.sources) AS sources,
    (SELECT count(*)::int FROM research.actions) AS actions,
    (SELECT count(*)::int FROM research.evidence) AS accepted_evidence,
    (SELECT count(*)::int FROM research.classification_attempts) AS classification_attempts,
    (SELECT count(*)::int FROM research.snapshots) AS snapshots,
    (SELECT count(*)::int FROM research.model_calls) AS model_calls,
    (SELECT count(*)::int FROM app_data.releases) AS published_releases`);
  return result.rows[0];
}
