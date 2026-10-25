import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { migrate, databaseStatus } from "./migrate.js";
import { readResearchArchive } from "./archive.js";
import { importResearchArchive, publishStoredRelease, type SqlConnection } from "./store.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    local: { type: "string" },
    run: { type: "string" },
    approval: { type: "string" },
  },
});
const command = positionals[0];
if (!["migrate", "import", "status", "publish"].includes(command ?? ""))
  throw new Error(
    "Usage: db migrate|import|status|publish [--local directory] [--run run-directory] [--approval file]",
  );
let db: SqlConnection;
let close: () => Promise<unknown>;
if (values.local) {
  const { PGlite } = await import("@electric-sql/pglite");
  const local = new PGlite(resolve(values.local));
  db = local;
  close = () => local.close();
} else {
  if (!process.env.DATABASE_WRITE_URL)
    throw new Error("Set DATABASE_WRITE_URL or use --local directory");
  const client = new pg.Client({ connectionString: process.env.DATABASE_WRITE_URL });
  await client.connect();
  db = client;
  close = () => client.end();
}
try {
  if (command === "migrate") await migrate(db);
  if (command === "import" || command === "publish") {
    if (!values.run) throw new Error("--run is required");
    const directory = resolve(values.run);
    const archive = await readResearchArchive(directory);
    if (command === "import")
      console.log(
        JSON.stringify({
          ...(await importResearchArchive(db, archive)),
          archiveHash: archive.archiveHash,
        }),
      );
    else {
      if (!values.approval)
        throw new Error("--approval is required; importing never authorizes publication");
      const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
      const bundle = {
        release: await readJson(join(directory, "releases", `${archive.runId}.json`)),
        reveal: await readJson(join(directory, "reveal.json")),
      };
      console.log(
        JSON.stringify(
          await publishStoredRelease(db, archive, bundle, await readJson(resolve(values.approval))),
        ),
      );
    }
  }
  console.log(JSON.stringify(await databaseStatus(db)));
} finally {
  await close();
}
