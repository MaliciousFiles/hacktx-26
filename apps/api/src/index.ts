// Thin serving API (PLAN.md §4, §9 `Api`): serves frozen releases only. No model calls.
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app";
import pg from "pg";
import { databaseReader } from "./database";

const app = process.env.DATABASE_READ_URL
  ? createApp({
      reader: databaseReader(
        new pg.Pool({ connectionString: process.env.DATABASE_READ_URL, max: 5 }),
      ),
    })
  : createApp({
      releasesDir: resolve(process.env.RELEASES_DIR ?? "../../packages/pipeline/dist"),
    });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
