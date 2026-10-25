// Serves frozen, published releases only. No model calls, no writes, no request
// logging, no address/coordinates: clients send an official ballot-style ID.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import type { Api, CandidateIdentity } from "@ftb/types";
import type { ReleaseReader } from "./database";

type BallotResponse = Api["GET /ballot"]["res"];
interface RevealFile {
  releaseId: string;
  manifestHash: string;
  identities: CandidateIdentity[];
}

const safeId = /^[a-zA-Z0-9_-]{1,100}$/;

export function createApp(
  options: { releasesDir: string; reader?: never } | { reader: ReleaseReader; releasesDir?: never },
) {
  const app = new Hono();
  const cache = new Map<
    string,
    Promise<{ release: BallotResponse; reveal: RevealFile } | undefined>
  >();

  // Each release directory is written once by the pipeline and treated as immutable.
  function load(releaseId: string) {
    let entry = cache.get(releaseId);
    if (!entry) {
      entry = (async () => {
        if (options.reader) return options.reader.load(releaseId);
        const dir = join(options.releasesDir, releaseId);
        try {
          const release = JSON.parse(
            await readFile(join(dir, "releases", `${releaseId}.json`), "utf8"),
          ) as BallotResponse;
          const reveal = JSON.parse(await readFile(join(dir, "reveal.json"), "utf8")) as RevealFile;
          if (
            release.release.id !== releaseId ||
            release.ballot.releaseId !== releaseId ||
            reveal.releaseId !== releaseId ||
            !release.release.manifestHash ||
            reveal.manifestHash !== release.release.manifestHash
          )
            return undefined;
          return { release, reveal };
        } catch {
          return undefined;
        }
      })();
      cache.set(releaseId, entry);
      // A missing release may be published later; don't cache misses forever.
      void entry.then(
        (value) => {
          if (!value) cache.delete(releaseId);
        },
        () => {
          cache.delete(releaseId);
        },
      );
    }
    return entry;
  }

  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store"); // shared caches/logs shouldn't correlate ballot styles
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.onError((_error, c) => c.json({ error: "release_unavailable" }, 503));

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/ballot", async (c) => {
    const releaseId = c.req.query("releaseId") ?? "";
    const ballotStyleId = c.req.query("ballotStyleId") ?? "";
    if (!safeId.test(releaseId) || !ballotStyleId || ballotStyleId.length > 200)
      return c.json({ error: "invalid_request" }, 400);
    const loaded = await load(releaseId);
    // Same response for unknown release and unknown style: no enumeration hints.
    if (!loaded || loaded.release.ballot.ballotStyleId !== ballotStyleId)
      return c.json({ error: "not_found" }, 404);
    return c.json(loaded.release);
  });

  app.get("/reveal/:contestId", async (c) => {
    const releaseId = c.req.query("releaseId") ?? "";
    const contestId = c.req.param("contestId");
    if (!safeId.test(releaseId) || !safeId.test(contestId))
      return c.json({ error: "invalid_request" }, 400);
    const loaded = await load(releaseId);
    const contest = loaded?.release.contests.find((item) => item.id === contestId);
    if (!loaded || !contest) return c.json({ error: "not_found" }, 404);
    const identities = contest.candidateIds.map((id) =>
      loaded.reveal.identities.find((identity) => identity.id === id),
    );
    // Never return a partial or mismatched reveal: the client rejects unknown IDs.
    if (identities.some((identity) => !identity))
      return c.json({ error: "release_integrity" }, 500);
    const res: Api["GET /reveal/:contestId"]["res"] = {
      releaseId,
      contestId,
      identities: identities as CandidateIdentity[],
    };
    return c.json(res);
  });

  return app;
}
