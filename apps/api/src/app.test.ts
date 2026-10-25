import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";

let dir: string;
const release = {
  release: {
    id: "r1",
    asOfDate: "2026-10-24",
    campaignWindow: { since: "2025-11-08", until: "2026-11-03" },
    manifestHash: "h1",
    configVersions: {},
    modelVersions: {},
  },
  ballot: {
    id: "b",
    releaseId: "r1",
    ballotStyleId: "STYLE-1",
    contestIds: ["c1"],
    requiresJudicialDeck: false,
  },
  contests: [{ id: "c1", candidateIds: ["p1", "p2"] }],
  candidates: [],
  cards: [],
  citations: [],
};
const reveal = {
  releaseId: "r1",
  manifestHash: "h1",
  identities: [
    { id: "p1", name: "A" },
    { id: "p2", name: "B" },
    { id: "other", name: "C" },
  ],
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ftb-api-"));
  await mkdir(join(dir, "r1", "releases"), { recursive: true });
  await writeFile(join(dir, "r1", "releases", "r1.json"), JSON.stringify(release));
  await writeFile(join(dir, "r1", "reveal.json"), JSON.stringify(reveal));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("frozen release API", () => {
  it("serves only the requested official style of a pinned release", async () => {
    const app = createApp({ releasesDir: dir });
    const ok = await app.request("/ballot?releaseId=r1&ballotStyleId=STYLE-1");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect((await app.request("/ballot?releaseId=r1&ballotStyleId=OTHER")).status).toBe(404);
    expect((await app.request("/ballot?releaseId=..%2Fetc&ballotStyleId=STYLE-1")).status).toBe(
      400,
    );
  });

  it("reveals only that contest's identities and rejects integrity mismatches", async () => {
    const app = createApp({ releasesDir: dir });
    const body = (await (await app.request("/reveal/c1?releaseId=r1")).json()) as {
      identities: { id: string }[];
    };
    expect(body.identities.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect((await app.request("/reveal/missing?releaseId=r1")).status).toBe(404);
    await writeFile(
      join(dir, "r1", "reveal.json"),
      JSON.stringify({ ...reveal, manifestHash: "different" }),
    );
    expect((await createApp({ releasesDir: dir }).request("/reveal/c1?releaseId=r1")).status).toBe(
      404,
    );
  });
});
