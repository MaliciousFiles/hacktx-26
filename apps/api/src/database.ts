import { createHash } from "node:crypto";
import { assertReleaseBundle, releaseManifestInput, type ReleaseBundle } from "@ftb/types/releases";

export interface ReleaseReader {
  load(releaseId: string): Promise<ReleaseBundle | undefined>;
}

/** Only app_data is queried. Supply a role with SELECT on those two tables only. */
export function databaseReader(db: {
  query(sql: string, parameters: any[]): Promise<{ rows: any[] }>;
}): ReleaseReader {
  return {
    async load(releaseId) {
      const { rows } = await db.query(
        `SELECT r.payload AS release, v.payload AS reveal, r.manifest_hash
        FROM app_data.releases r JOIN app_data.reveals v USING (release_id)
        WHERE r.release_id=$1`,
        [releaseId],
      );
      if (!rows.length) return undefined;
      const bundle: unknown = { release: rows[0].release, reveal: rows[0].reveal };
      assertReleaseBundle(bundle);
      const hash = createHash("sha256").update(releaseManifestInput(bundle.release)).digest("hex");
      if (
        bundle.release.release.id !== releaseId ||
        hash !== rows[0].manifest_hash ||
        hash !== bundle.release.release.manifestHash
      )
        throw new Error("Stored release integrity failure");
      return bundle;
    },
  };
}
