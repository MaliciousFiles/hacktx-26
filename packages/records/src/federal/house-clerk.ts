import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { inWindow, isoDate, normalizeVote, provenance, voteStance } from "../model";
import { count, parseXml, xmlText } from "../xml";
import {
  addAction, assertUniqueMembers, bioguide, congressMeasureUrl, many, memberId,
  positiveCount, prettyLegisNum, result, rollCallId, sourceConfig, text,
  unresolvedIdentity, validateMargin,
} from "./shared";

export const houseClerkConfigSchema = sourceConfig(["clerk.house.gov"]);
export type HouseClerkConfig = z.infer<typeof houseClerkConfigSchema>;

const totalsSchema = z.object({
  "yea-total": count, "nay-total": count, "present-total": count, "not-voting-total": count,
});
const candidateTotalSchema = z.object({ candidate: text, "candidate-total": count });
const rollSchema = z.object({
  "vote-metadata": z.object({
    congress: positiveCount,
    chamber: z.enum(["U.S. House of Representatives", "House"]),
    "rollcall-num": positiveCount,
    "legis-num": xmlText.optional(),
    "vote-question": text,
    "vote-desc": xmlText.optional(),
    "action-date": text,
    "vote-totals": z.object({
      "totals-by-vote": totalsSchema.optional(),
      "totals-by-candidate": many(candidateTotalSchema),
    }),
  }),
  "vote-data": z.object({
    "recorded-vote": many(z.object({
      legislator: z.object({ "@name-id": bioguide }),
      vote: text,
    })),
  }),
});

function houseDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoDate(raw);
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = match ? months.indexOf(match[2].toLowerCase()) + 1 : 0;
  if (!match || !month) throw new Error(`Invalid House action date: ${raw}`);
  return isoDate(`${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`);
}

/** Parses only aggregate totals and member IDs/votes; party metadata is discarded. */
export function parseHouseClerk(xml: string) {
  const roll = rollSchema.parse(parseXml(xml, "rollcall-vote")["rollcall-vote"]);
  const meta = roll["vote-metadata"];
  const totals = meta["vote-totals"];
  const choices = totals["totals-by-candidate"];
  const namedChoice = choices.length > 0;
  const speakerElection = /election.*speaker/i.test(meta["vote-question"]);
  if (namedChoice === Boolean(totals["totals-by-vote"])) throw new Error("Expected exactly one aggregate totals format");
  if (speakerElection && !namedChoice) throw new Error("Speaker election requires named-candidate totals");
  const members = roll["vote-data"]["recorded-vote"].map((vote, index) => {
    const normalized = normalizeVote(vote.vote);
    return {
      id: vote.legislator["@name-id"], raw: vote.vote, index: index + 1,
      // A vote for a named Speaker candidate is not an affirmative policy vote.
      value: namedChoice && normalized !== "present" && normalized !== "not_voting" ? "other" as const : normalized,
    };
  });
  assertUniqueMembers(members);
  let margin: { yes: number; no: number; present: number; notVoting: number } | undefined;
  if (namedChoice) {
    const expected = new Map<string, number>();
    for (const choice of choices) {
      if (expected.has(choice.candidate)) throw new Error("Duplicate candidate in aggregate totals");
      expected.set(choice.candidate, choice["candidate-total"]);
    }
    const actual = new Map<string, number>();
    for (const member of members) {
      if (!expected.has(member.raw)) throw new Error("Member choice missing from aggregate candidate totals");
      actual.set(member.raw, (actual.get(member.raw) ?? 0) + 1);
    }
    if ([...expected].some(([choice, total]) => (actual.get(choice) ?? 0) !== total)) {
      throw new Error("Member votes do not match aggregate candidate totals");
    }
  } else {
    const aggregate = totals["totals-by-vote"]!;
    margin = {
      yes: aggregate["yea-total"], no: aggregate["nay-total"],
      present: aggregate["present-total"], notVoting: aggregate["not-voting-total"],
    };
    validateMargin(members, margin);
  }
  const legisNum = meta["legis-num"]?.trim() || undefined;
  return {
    congress: meta.congress, roll: meta["rollcall-num"], date: houseDate(meta["action-date"]),
    question: meta["vote-question"], description: meta["vote-desc"] ?? "", legisNum, members, margin,
    candidateTotals: choices.map((choice) => ({ candidate: choice.candidate, total: choice["candidate-total"] })),
  };
}

export const houseClerkAdapter: RecordsAdapter = {
  kind: "house-clerk",
  async collect(context, config) {
    const options = houseClerkConfigSchema.parse(config);
    const id = memberId(context);
    if (!id) return unresolvedIdentity();
    const actions = new Map<string, OfficialAction>();
    const warnings = new Set<string>();
    for (const url of [...new Set(options.urls)].sort()) {
      let snapshot;
      try {
        snapshot = await context.client.get(url, { format: "xml", root: "rollcall-vote" });
      } catch {
        warnings.add("Some roll-call URLs were missing or not valid Clerk rollcall-vote XML; skipped without coding absence.");
        continue;
      }
      let roll;
      try { roll = parseHouseClerk(snapshot.text); }
      catch {
        warnings.add("Some roll-call documents failed validation; skipped without coding absence.");
        continue;
      }
      if (!inWindow(roll.date, context.window)) continue;
      const member = roll.members.find((entry) => entry.id === id);
      if (!member) {
        warnings.add("Some supplied roll calls do not identify the requested member; missing votes are not coded as absence.");
        continue;
      }
      const measureUrl = roll.legisNum ? congressMeasureUrl(roll.congress, roll.legisNum) : undefined;
      const legisLabel = roll.legisNum ? prettyLegisNum(roll.legisNum) : undefined;
      const titleCore = roll.description || roll.question;
      addAction(actions, {
        id: rollCallId("house", roll.date.slice(0, 4), roll.roll, id),
        actorId: context.request.candidate.id, issueIds: [], role: options.role ?? "U.S. House of Representatives",
        body: "U.S. House of Representatives", type: "floor_vote", stance: voteStance(member.value),
        ...(roll.margin ? { margin: roll.margin } : {}), date: roll.date,
        title: legisLabel ? `${legisLabel} — ${titleCore}` : titleCore,
        officialText: [
          legisLabel ? `Measure: ${legisLabel}` : undefined,
          measureUrl ? `Measure URL: ${measureUrl}` : undefined,
          `Vote record: ${snapshot.sourceUrl}`,
          roll.question,
          roll.description || undefined,
        ].filter(Boolean).join("\n"),
        sourceUrl: snapshot.sourceUrl, ...(measureUrl ? { measureUrl } : {}), extraction: "xml",
        attribution: { method: "member_id", sourceActorId: id },
        vote: {
          value: member.value, raw: member.raw, question: roll.question, method: "roll_call",
          ...(roll.legisNum ? { legisNum: roll.legisNum } : {}),
        },
        provenance: [
          provenance(snapshot, "house-clerk/v1", "/rollcall-vote/vote-metadata"),
          provenance(snapshot, "house-clerk/v1", `/rollcall-vote/vote-data/recorded-vote[${member.index}]`),
          ...(roll.legisNum ? [provenance(snapshot, "house-clerk/v1", "/rollcall-vote/vote-metadata/legis-num")] : []),
        ],
      });
    }
    return result(actions.values(), "House Clerk", warnings);
  },
};
