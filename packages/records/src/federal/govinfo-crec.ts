import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import type { Snapshot } from "../model";
import { inWindow, isoDate, normalizeVote, provenance, voteStance } from "../model";
import { count, parseXml, xmlText } from "../xml";
import {
  assertUniqueMembers, bioguide, many, memberId, mergeProvenance, positiveCount, result,
  rollCallId, sourceConfig, text, unresolvedIdentity, validateMargin,
} from "./shared";

export const govinfoCrecConfigSchema = sourceConfig(["www.govinfo.gov", "govinfo.gov", "api.govinfo.gov"]);
export type GovinfoCrecConfig = z.infer<typeof govinfoCrecConfigSchema>;

const voteSchema = z.object({
  "@chamber": z.enum(["SENATE", "HOUSE"]), "@congress": positiveCount, "@number": positiveCount,
  "@yescount": count, "@nocount": count, "@nvcount": count, "@presentcount": count.optional(),
  "@voteDate": text.optional(), voteDate: text.optional(),
  question: text.optional(), voteQuestion: text.optional(), title: text.optional(),
  result: xmlText.optional(),
  inDailyDigest: z.enum(["true", "false"]).optional(),
  congMember: many(z.object({ "@bioGuideId": bioguide, "@role": text })),
});
const contextSchema = z.object({
  titleInfo: many(z.object({ title: text })),
  originInfo: many(z.object({ dateIssued: text.optional() })),
  extension: many(z.object({
    granuleDate: text.optional(), congress: positiveCount.optional(), session: positiveCount.optional(),
    congVote: many(z.unknown()),
  })),
  relatedItem: many(z.unknown()),
});
const relationSchema = z.object({ "@type": z.string().optional() });
const voteHeaderSchema = z.object({
  "@chamber": z.enum(["SENATE", "HOUSE"]),
  inDailyDigest: z.enum(["true", "false"]).optional(),
});
const hostSchema = z.object({
  originInfo: many(z.object({ dateIssued: text.optional() })),
  extension: many(z.object({ congress: positiveCount.optional(), session: positiveCount.optional() })),
});

interface Metadata {
  documentDate?: { value: string; locator: string };
  congress?: { value: number; locator: string };
  session?: { value: number; locator: string };
}

function uniqueMetadata<T extends string | number>(values: { value: T; locator: string }[], label: string) {
  if (new Set(values.map(({ value }) => value)).size > 1) throw new Error(`Conflicting Congressional Record ${label}`);
  return values[0];
}

function parseVotes(xml: string) {
  const votes: {
    chamber: string; congress: number; session?: number; sessionLocator?: string; roll: number;
    date: string; documentDate: string; hasVoteDate: boolean; question: string; title: string; result: string;
    members: { id: string; raw: string; value: NonNullable<OfficialAction["vote"]>["value"]; index: number }[];
    margin: { yes: number; no: number; present: number; notVoting: number };
    locator: string; inDailyDigest: boolean; questionIsGranuleTitle: boolean; titleLocator: string; dateLocator: string; signature: string;
  }[] = [];
  let ignoredDailyDigest = 0;

  function visit(raw: unknown, path: string, inherited: Metadata): void {
    const node = contextSchema.parse(raw);
    const directDate = uniqueMetadata([
      ...node.extension.flatMap((extension, index) => extension.granuleDate
        ? [{ value: isoDate(extension.granuleDate), locator: `${path}/extension[${index + 1}]/granuleDate` }] : []),
      ...node.originInfo.flatMap((origin, index) => origin.dateIssued
        ? [{ value: isoDate(origin.dateIssued), locator: `${path}/originInfo[${index + 1}]/dateIssued` }] : []),
    ], "publication dates");
    const metadata: Metadata = {
      documentDate: directDate ?? inherited.documentDate,
      congress: uniqueMetadata(node.extension.flatMap((ext, index) => ext.congress
        ? [{ value: ext.congress, locator: `${path}/extension[${index + 1}]/congress` }] : []), "congresses") ?? inherited.congress,
      session: uniqueMetadata(node.extension.flatMap((ext, index) => ext.session
        ? [{ value: ext.session, locator: `${path}/extension[${index + 1}]/session` }] : []), "sessions") ?? inherited.session,
    };
    // A standalone granule's host can supply publication/session metadata, but
    // its votes, titles, and other nested records are NEVER traversed as granules.
    for (const [index, rawRelation] of node.relatedItem.entries()) {
      if (relationSchema.parse(rawRelation)["@type"] !== "host") continue;
      const host = hostSchema.parse(rawRelation);
      const hostPath = `${path}/relatedItem[${index + 1}]`;
      metadata.documentDate ??= uniqueMetadata(host.originInfo.flatMap((origin, originIndex) => origin.dateIssued
        ? [{ value: isoDate(origin.dateIssued), locator: `${hostPath}/originInfo[${originIndex + 1}]/dateIssued` }] : []), "host publication dates");
      metadata.congress ??= uniqueMetadata(host.extension.flatMap((ext, extensionIndex) => ext.congress
        ? [{ value: ext.congress, locator: `${hostPath}/extension[${extensionIndex + 1}]/congress` }] : []), "host congresses");
      metadata.session ??= uniqueMetadata(host.extension.flatMap((ext, extensionIndex) => ext.session
        ? [{ value: ext.session, locator: `${hostPath}/extension[${extensionIndex + 1}]/session` }] : []), "host sessions");
    }

    for (const [extensionIndex, extension] of node.extension.entries()) {
      for (const [voteIndex, rawVote] of extension.congVote.entries()) {
        const header = voteHeaderSchema.parse(rawVote);
        // This source supplies Senate votes; the House Clerk adapter handles
        // House rolls. Do not flatten or validate unrelated chamber members.
        if (header["@chamber"] !== "SENATE") continue;
        if (header.inDailyDigest === "true") { ignoredDailyDigest++; continue; }
        const vote = voteSchema.parse(rawVote);
        if (!metadata.documentDate) throw new Error("Structured vote is missing its granuleDate or publication document date");
        if (metadata.congress && metadata.congress.value !== vote["@congress"]) throw new Error("Vote congress conflicts with its publication context");
        const documentDate = metadata.documentDate.value;
        const actualDate = vote.voteDate ?? vote["@voteDate"];
        if (vote.voteDate && vote["@voteDate"] && isoDate(vote.voteDate) !== isoDate(vote["@voteDate"])) {
          throw new Error("Conflicting separately supplied vote dates");
        }
        // The title belongs to THIS granule, not the enclosing package or a sibling.
        const title = node.titleInfo[0]?.title;
        const question = vote.question ?? vote.voteQuestion ?? vote.title ?? title;
        if (!question) throw new Error("Structured vote has neither a question nor a granule title");
        const members = vote.congMember.map((member, index) => ({
          id: member["@bioGuideId"], raw: member["@role"], value: normalizeVote(member["@role"]), index: index + 1,
        }));
        assertUniqueMembers(members);
        const margin = {
          yes: vote["@yescount"], no: vote["@nocount"],
          present: vote["@presentcount"] ?? 0, notVoting: vote["@nvcount"],
        };
        validateMargin(members, margin);
        const locator = `${path}/extension[${extensionIndex + 1}]/congVote[${voteIndex + 1}]`;
        votes.push({
          chamber: "senate", congress: vote["@congress"], session: metadata.session?.value,
          sessionLocator: metadata.session?.locator, roll: vote["@number"],
          date: actualDate ? isoDate(actualDate) : documentDate, documentDate, hasVoteDate: Boolean(actualDate),
          question, title: vote.title ?? title ?? question, result: vote.result ?? "", members, margin, locator,
          inDailyDigest: false, questionIsGranuleTitle: !vote.question && !vote.voteQuestion && !vote.title,
          dateLocator: metadata.documentDate.locator, titleLocator: `${path}/titleInfo[1]/title`,
          signature: JSON.stringify({ margin, members: members.map((member) => `${member.id}:${member.value}`).sort() }),
        });
      }
    }
    for (const [index, relation] of node.relatedItem.entries()) {
      if (relationSchema.parse(relation)["@type"] === "constituent") {
        visit(relation, `${path}/relatedItem[${index + 1}]`, metadata);
      }
    }
  }
  visit(parseXml(xml, "mods").mods, "/mods", {});
  return { votes, ignoredDailyDigest };
}

/** Supports standalone granules and whole-day package MODS. Related constituent
 * granules inherit publication/session metadata, never sibling titles or members.
 * Daily Digest-flagged records are withheld; repeated rolls remain one event. */
export function parseGovinfoCrec(xml: string) {
  return parseVotes(xml);
}

type CrecVote = ReturnType<typeof parseGovinfoCrec>["votes"][number];

function actionFor(vote: CrecVote, snapshot: Snapshot, actorId: string, id: string, role?: string): OfficialAction {
  const member = vote.members.find((entry) => entry.id === id)!;
  const body = vote.chamber === "senate" ? "U.S. Senate" : "U.S. House of Representatives";
  return {
    id: rollCallId(vote.chamber, vote.date.slice(0, 4), vote.roll, id), actorId, issueIds: [], role: role ?? body, body,
    type: "floor_vote", stance: voteStance(member.value), margin: vote.margin, date: vote.date,
    dateBasis: vote.hasVoteDate ? "action_date" : "document_date",
    title: vote.title, officialText: vote.question, sourceUrl: snapshot.sourceUrl, extraction: "xml",
    attribution: { method: "member_id", sourceActorId: id },
    vote: {
      value: member.value, raw: member.raw, question: vote.question, method: "roll_call",
      questionBasis: vote.questionIsGranuleTitle ? "document_title" : "vote_question",
    },
    provenance: [
      provenance(snapshot, "govinfo-crec/v1", vote.locator),
      provenance(snapshot, "govinfo-crec/v1", `${vote.locator}/congMember[${member.index}]`),
      provenance(snapshot, "govinfo-crec/v1", vote.hasVoteDate ? `${vote.locator}/voteDate|${vote.locator}/@voteDate` : vote.dateLocator),
      ...(vote.questionIsGranuleTitle ? [provenance(snapshot, "govinfo-crec/v1", vote.titleLocator)] : []),
      ...(vote.sessionLocator ? [provenance(snapshot, "govinfo-crec/v1", vote.sessionLocator)] : []),
    ],
  };
}

export const govinfoCrecAdapter: RecordsAdapter = {
  kind: "govinfo-crec",
  async collect(context, config) {
    const options = govinfoCrecConfigSchema.parse(config);
    const id = memberId(context);
    if (!id) return unresolvedIdentity();
    const events = new Map<string, { vote: CrecVote; action: OfficialAction }>();
    const warnings = new Set<string>();
    for (const url of [...new Set(options.urls)].sort()) {
      const snapshot = await context.client.get(url, { format: "xml", root: "mods" });
      const { votes, ignoredDailyDigest } = parseGovinfoCrec(snapshot.text);
      if (ignoredDailyDigest) warnings.add("Structured records flagged inDailyDigest=true are withheld rather than counted as new vote events.");
      if (!votes.length) warnings.add("Some supplied granules contain no structured votes; speaking members are not treated as voters.");
      for (const vote of votes) {
        // A later Record edition cannot smuggle facts past the requested cutoff.
        if (!inWindow(vote.date, context.window) || vote.documentDate >= context.window.before) continue;
        if (!vote.members.some((member) => member.id === id)) {
          warnings.add("Some supplied votes do not identify the requested member; this does not establish absence.");
          continue;
        }
        const action = actionFor(vote, snapshot, context.request.candidate.id, id, options.role);
        const existing = events.get(action.id);
        if (existing) {
          if (existing.vote.congress !== vote.congress || existing.vote.signature !== vote.signature
            || (existing.vote.session !== undefined && vote.session !== undefined && existing.vote.session !== vote.session)
            || (existing.vote.hasVoteDate && vote.hasVoteDate && existing.vote.date !== vote.date)) {
            throw new Error(`Conflicting Congressional Record publications for ${action.id}`);
          }
          const preferIncoming = !existing.vote.hasVoteDate && vote.hasVoteDate;
          if (preferIncoming) {
            mergeProvenance(action, existing.action);
            events.set(action.id, { vote, action });
          } else mergeProvenance(existing.action, action);
        } else events.set(action.id, { vote, action });
      }
    }
    if ([...events.values()].some(({ vote }) => !vote.hasVoteDate)) {
      warnings.add("Action dates use granuleDate (the Congressional Record document date) where no separate actual vote date is supplied; actual vote dates remain unverified.");
    }
    if ([...events.values()].some(({ vote }) => vote.questionIsGranuleTitle)) {
      warnings.add("A granule title is retained where the structured vote has no separate question; it is not inferred to be final passage.");
    }
    return result([...events.values()].map(({ action }) => action), "GovInfo Congressional Record Senate", warnings);
  },
};
