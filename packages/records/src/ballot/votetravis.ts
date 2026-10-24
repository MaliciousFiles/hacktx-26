import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { provenance } from "../model";

const adapterVersion = "votetravis/v1";

const configSchema = z.object({
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("votetravis.gov") ||
      url.hostname.endsWith("traviscountytx.gov") ||
      url.hostname.endsWith("traviscountyelections.org")
    );
  })).min(1),
}).strict();

/**
 * Official ballot HTML/PDF reference only.
 * Emits **no** OfficialAction and never invents or overrides ballot style
 * (PLAN §5 — official/manual style fallback stays with the ballot owner).
 * Coverage reason carries a short extracted contest inventory for pipeline review.
 */
export const voteTravisAdapter: RecordsAdapter = {
  kind: "votetravis-ballot",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const notes: string[] = [];
    const problems: string[] = [];

    for (const url of parsed.data.urls) {
      try {
        const isPdf = /\.pdf$/i.test(url);
        const snapshot = await context.client.get(url, { format: isPdf ? "pdf" : "html" });
        const plain = isPdf ? snapshot.text : htmlToPlainText(snapshot.text);
        const contests = [...plain.matchAll(/(?:President|United States|Governor|Judge|Council|Proposition|Mayor|Senator|Representative)[^\n]{0,80}/gi)]
          .slice(0, 20)
          .map((match) => match[0].replace(/\s+/g, " ").trim());
        const proof = provenance(
          snapshot,
          adapterVersion,
          textSpanLocator(0, Math.min(80, plain.length)),
        );
        notes.push(
          `Ballot reference ${snapshot.sourceUrl} (snapshot ${proof.snapshotId}); ` +
          `style must remain official/manual — contests noticed: ${contests.join(" | ") || "(none parsed)"}.`,
        );
        void context;
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "VoteTravis fetch failed");
      }
    }

    return {
      actions: [],
      status: problems.length ? "needs_review" : "complete",
      reason: problems.length
        ? problems.join(" ")
        : notes.join(" ") || "VoteTravis reference loaded; no OfficialAction emitted.",
    };
  },
};
