import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { normalizeName, provenance } from "../model";

const adapterVersion = "tlo-author-index/v1";

const configSchema = z.object({
  url: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("capitol.texas.gov") ||
      url.hostname.endsWith("legis.texas.gov") ||
      url.hostname.endsWith("lrl.texas.gov")
    );
  }, "Official TLO/LRL HTTPS author or member index URL required"),
  /** Display name as printed in the index, e.g. "Buckley". */
  memberName: z.string().trim().min(1),
  /** Session code as printed, e.g. "H-A3585". */
  memberCode: z.string().trim().min(1).regex(/^[HS]-A\d+$/i),
  memberCandidateId: z.string().trim().min(1),
}).strict();

export type TloAuthorIndexConfig = z.infer<typeof configSchema>;

export interface AuthorIndexEntry {
  name: string;
  code: string;
  locator: string;
}

/** Parse `Name (H-A1234)` / `Name (S-A1234)` entries from an official author index page. */
export function parseAuthorIndex(plain: string): AuthorIndexEntry[] {
  const entries: AuthorIndexEntry[] = [];
  const pattern = /([A-Za-zÀ-ÖØ-öø-ÿ.' -]+?)\s*\(([HS]-A\d+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(plain))) {
    const name = match[1].trim();
    const code = match[2].toUpperCase();
    if (!name || normalizeName(name).split(/\s+/).length < 1) continue;
    entries.push({
      name,
      code,
      locator: textSpanLocator(match.index, match.index + match[0].length),
    });
  }
  return entries;
}

/**
 * Identity evidence only — emits no OfficialAction votes.
 * Binds pipeline candidate → official session member code when the printed
 * name+code pair is present exactly once on the configured official page.
 */
export const tloAuthorIndexAdapter: RecordsAdapter = {
  kind: "tlo-author-index",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.memberCandidateId !== context.request.candidate.id) {
      return {
        actions: [],
        status: "needs_review",
        reason: "memberCandidateId must match the request candidate ID",
      };
    }

    const snapshot = await context.client.get(config.url, { format: "html" });
    const plain = htmlToPlainText(snapshot.text);
    const entries = parseAuthorIndex(plain);
    const hits = entries.filter((entry) =>
      normalizeName(entry.name) === normalizeName(config.memberName) &&
      entry.code.toUpperCase() === config.memberCode.toUpperCase()
    );
    if (hits.length !== 1) {
      return {
        actions: [],
        status: "needs_review",
        reason: hits.length === 0
          ? `Author index does not contain ${config.memberName} (${config.memberCode})`
          : `Author index has ambiguous matches for ${config.memberName} (${config.memberCode})`,
      };
    }

    // Surface binding via coverage reason + empty actions. Pipeline stores the
    // verified code on the candidate identifiers when integrating this adapter.
    const proof = provenance(snapshot, adapterVersion, hits[0].locator);
    return {
      actions: [],
      status: "complete",
      reason: `Verified identity ${config.memberName} (${hits[0].code}) at ${proof.locator}; snapshot ${proof.snapshotId}`,
    };
  },
};
