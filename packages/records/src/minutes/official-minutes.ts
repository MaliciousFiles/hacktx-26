import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { createLlmExtractorFromEnv, extractVotes, normalizeVoteToken } from "../extract";
import type { SemanticExtractor } from "../extract";
import { inWindow, isoDate, normalizeName, provenance, voteStance } from "../model";

const adapterVersion = "official-minutes/v1";

const configSchema = z.object({
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  })).min(1),
  role: z.string().trim().min(1),
  body: z.string().trim().min(1),
  /** Exact member labels as printed in the minutes. */
  memberLabels: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
  /** Optional civil date when the document has no reliable printed date. Prefer document text. */
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actionType: z.enum([
    "board_vote", "budget_vote", "permit_vote", "rule_vote", "appointment",
  ]).default("board_vote"),
  /** Optional host suffix allowlist, e.g. ["boarddocs.com","roundrockisd.org"]. */
  allowedHostSuffixes: z.array(z.string().trim().min(1)).optional(),
  enableLlmFallback: z.boolean().default(true),
}).strict();

export type OfficialMinutesConfig = z.infer<typeof configSchema>;

function meetingDateFromText(plain: string, fallback?: string): string | undefined {
  const named = plain.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (named) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const month = months[named[1].toLowerCase()];
    if (month) return isoDate(`${named[3]}-${month}-${named[2].padStart(2, "0")}`);
  }
  const iso = plain.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(iso[0]);
  return fallback;
}

function hostOk(url: string, suffixes?: string[]): boolean {
  if (!suffixes?.length) return true;
  const host = new URL(url).hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`) || host.endsWith(suffix));
}

/**
 * Config-driven official minutes HTML/PDF for school boards, MUDs, city archives,
 * RRC/SBOE/GLO, Diligent/BoardDocs/BoardBook/IQM2/CivicWeb/CivicPlus, etc.
 * One adapter kind; each jurisdiction supplies its official publishing URL.
 * Rules first; optional cheap LLM fallback with exact span validation.
 */
export function createOfficialMinutesAdapter(llm?: SemanticExtractor): RecordsAdapter {
  return {
    kind: "official-minutes",
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

      const labels = new Set(config.memberLabels.map(normalizeName));
      const actions = new Map<string, OfficialAction>();
      const problems: string[] = [];
      const extractor = config.enableLlmFallback
        ? (llm ?? createLlmExtractorFromEnv())
        : undefined;

      for (const url of config.urls) {
        if (!hostOk(url, config.allowedHostSuffixes)) {
          problems.push(`Host not in allowedHostSuffixes: ${url}`);
          continue;
        }
        try {
          const isPdf = /\.pdf$/i.test(url);
          const snapshot = await context.client.get(url, { format: isPdf ? "pdf" : "html" });
          const plain = isPdf ? snapshot.text : htmlToPlainText(snapshot.text);
          const date = meetingDateFromText(plain, config.meetingDate);
          if (!date) {
            problems.push(`No meeting date in ${url}`);
            continue;
          }
          if (!inWindow(date, context.window)) continue;

          const extracted = await extractVotes(
            {
              schemaId: "official-minutes-votes",
              sourceText: plain,
              instruction: "Extract only roll-call or named member votes from these official minutes.",
              memberLabels: config.memberLabels,
            },
            extractor,
          );

          if (extracted.method === "llm" && extracted.batch.votes.length === 0) {
            problems.push(`LLM fallback returned no grounded votes for ${url}`);
          }

          for (const vote of extracted.batch.votes) {
            if (!labels.has(normalizeName(vote.member.value))) continue;
            const valueToken = normalizeVoteToken(vote.vote.value);
            if (valueToken === "other") continue;
            const voteDate = vote.date
              ? (meetingDateFromText(vote.date.value) ?? date)
              : date;
            if (!inWindow(voteDate, context.window)) continue;

            const id = `minutes:${createHash("sha256").update(JSON.stringify([
              url, context.request.candidate.id, voteDate, vote.member.value, vote.motion.value, vote.vote.value,
            ])).digest("hex")}`;
            const methodTag = extracted.method === "llm" ? `${adapterVersion}+${extracted.modelId}` : adapterVersion;
            actions.set(id, {
              id,
              actorId: context.request.candidate.id,
              issueIds: [],
              role: config.role,
              body: config.body,
              type: config.actionType,
              stance: voteStance(valueToken),
              date: voteDate,
              title: vote.motion.value.replace(/\s+/g, " ").trim().slice(0, 200) || "Minutes motion",
              officialText: vote.motion.value.replace(/\s+/g, " ").trim() || vote.motion.value,
              sourceUrl: snapshot.sourceUrl,
              extraction: isPdf ? "pdf" : "html",
              dateBasis: vote.date ? "action_date" : "document_date",
              consent: vote.consent === true ? true : undefined,
              attribution: { method: "named_record", sourceActorId: vote.member.value },
              vote: {
                value: valueToken,
                raw: vote.vote.value,
                question: vote.motion.value,
                questionBasis: "vote_question",
                method: "roll_call",
              },
              provenance: [
                provenance(snapshot, methodTag, textSpanLocator(vote.member.start, vote.member.end)),
                provenance(snapshot, methodTag, textSpanLocator(vote.vote.start, vote.vote.end)),
                provenance(snapshot, methodTag, textSpanLocator(vote.motion.start, vote.motion.end)),
              ],
            });
          }
        } catch (error) {
          problems.push(error instanceof Error ? error.message : "Minutes document failed");
        }
      }

      return {
        actions: [...actions.values()],
        status: problems.length ? (actions.size ? "partial" : "needs_review") : "complete",
        reason: problems.length
          ? problems.slice(0, 5).join(" ")
          : `Attributed ${actions.size} named vote(s) from official minutes.`,
      };
    },
  };
}

/** Default adapter using env-configured LLM fallback when present. */
export const officialMinutesAdapter: RecordsAdapter = createOfficialMinutesAdapter();
