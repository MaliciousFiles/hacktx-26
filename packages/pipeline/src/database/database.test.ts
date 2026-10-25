import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { migrate, databaseStatus } from "./migrate";
import { readResearchArchive, sha256 } from "./archive";
import { importResearchArchive, publishStoredRelease } from "./store";
import { releaseManifestInput } from "@ftb/types/releases";
import { databaseReader } from "../../../../apps/api/src/database";
import { createApp } from "../../../../apps/api/src/app";

describe("immutable PostgreSQL research and serving storage", () => {
  it("imports transactionally, isolates research, publishes only approved frozen data and serves pinned releases", async () => {
    const db = new PGlite();
    const directory = await mkdtemp(join(tmpdir(), "ww-db-"));
    try {
      await migrate(db);
      await migrate(db);
      const input = {
        spec: { releaseId: "r1", asOfDate: "2026-10-24", demo: false, ballot: { contests: [] } },
        policy: { issues: [] },
        researchOnly: false,
      };
      const research = {
        configHash: sha256(JSON.stringify(input)),
        demo: false,
        analysisEvaluated: false,
        sources: [],
        actions: [],
        evidence: [],
        classificationAttempts: [],
        review: [],
        candidateAnalysis: {},
        coverage: [],
      };
      const write = async (kind: string, data: unknown) =>
        writeFile(join(directory, `${kind}.json`), JSON.stringify(data));
      await write("input", input);
      await write("research", research);
      await write("acquisition", { configHash: research.configHash });
      await write("coverage", { releaseId: "r1" });
      const archive = await readResearchArchive(directory);
      expect((await importResearchArchive(db, archive)).reused).toBe(false);
      expect((await importResearchArchive(db, archive)).reused).toBe(true);
      await expect(
        importResearchArchive(db, { ...archive, archiveHash: "a".repeat(64) }),
      ).rejects.toThrow("immutable");
      await expect(db.query("UPDATE research.runs SET experimental=true")).rejects.toThrow(
        "Immutable",
      );
      await expect(db.query("TRUNCATE research.review_items")).rejects.toThrow("Immutable");
      expect(await databaseReader(db).load("r1")).toBeUndefined();
      const payload = {
        release: {
          id: "r1",
          asOfDate: "2026-10-24",
          manifestHash: "",
          configVersions: {},
          modelVersions: {},
          campaignWindow: { since: "2025-11-01", until: "2026-11-03" },
        },
        ballot: {
          id: "b1",
          releaseId: "r1",
          ballotStyleId: "STYLE",
          contestIds: [],
          requiresJudicialDeck: false,
        },
        contests: [],
        candidates: [],
        citations: [],
        cards: [],
      };
      payload.release.manifestHash = sha256(releaseManifestInput(payload));
      const bundle = {
        release: payload,
        reveal: { releaseId: "r1", manifestHash: payload.release.manifestHash, identities: [] },
      };
      const approval = {
        decision: "publish",
        reviewedBy: "synthetic-test",
        reviewedAt: "2026-10-24T00:00:00Z",
        archiveHash: archive.archiveHash,
        manifestHash: payload.release.manifestHash,
      };
      await expect(
        publishStoredRelease(db, { ...archive, experimental: true }, bundle, approval),
      ).rejects.toThrow("Experimental");
      await expect(
        publishStoredRelease(db, archive, bundle, { ...approval, archiveHash: "a".repeat(64) }),
      ).rejects.toThrow("hash mismatch");
      await expect(
        publishStoredRelease(
          db,
          archive,
          { ...bundle, release: { ...payload, address: "private" } },
          approval,
        ),
      ).rejects.toThrow();
      expect((await publishStoredRelease(db, archive, bundle, approval)).reused).toBe(false);
      expect((await publishStoredRelease(db, archive, bundle, approval)).reused).toBe(true);
      const app = createApp({ reader: databaseReader(db) });
      expect((await app.request("/ballot?releaseId=r1&ballotStyleId=STYLE")).status).toBe(200);
      expect((await app.request("/ballot?releaseId=r1&ballotStyleId=OTHER")).status).toBe(404);
      expect((await app.request("/ballot?releaseId=r2&ballotStyleId=STYLE")).status).toBe(404);
      expect((await app.request("/research")).status).toBe(404);
      expect((await databaseStatus(db)).published_releases).toBe(1);
      await db.exec(`CREATE ROLE test_api_reader;
        GRANT USAGE ON SCHEMA app_data TO test_api_reader;
        GRANT SELECT ON app_data.releases, app_data.reveals TO test_api_reader;
        SET ROLE test_api_reader;`);
      expect(await databaseReader(db).load("r1")).toEqual(bundle);
      await expect(db.query("SELECT * FROM research.people")).rejects.toThrow("permission denied");
      await expect(db.query("DELETE FROM app_data.reveals")).rejects.toThrow("permission denied");
      await db.query("RESET ROLE");
      const broken = {
        ...archive,
        runId: "broken",
        input: {
          ...archive.input,
          spec: {
            ...archive.input.spec,
            ballot: { contests: [{ id: "c", candidates: [{ id: "p", name: "Test" }] }] },
          },
        },
      };
      await expect(importResearchArchive(db, broken)).rejects.toThrow("coverage");
      expect((await databaseStatus(db)).runs).toBe(1);
      await write("research", {
        ...research,
        sources: [
          {
            id: "s",
            contestId: "c",
            type: "campaign",
            url: "https://example.org",
            contentHash: "0".repeat(64),
            originalText: "text",
            text: "text",
          },
        ],
      });
      await expect(readResearchArchive(directory)).rejects.toThrow("content hash");
    } finally {
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
