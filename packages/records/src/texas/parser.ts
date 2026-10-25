import { z } from "zod";
import { isoDate } from "../model";
import { array, count, parseXml, xmlText } from "../xml";
import { tloBillIdentity } from "./urls";
import type { TloBillIdentity } from "./urls";

export type TloChamber = "house" | "senate";
export interface TloAffiliation {
  kind:
    | "primary_author"
    | "joint_author"
    | "coauthor"
    | "primary_sponsor"
    | "joint_sponsor"
    | "cosponsor";
  name: string;
  locator: string;
  // These rosters have no individual join dates. Never impute the filing date.
}

export interface TloCommittee {
  chamber: TloChamber;
  name: string;
  status?: string;
  subcommitteeName?: string;
  subcommitteeStatus?: string;
  votes: { yes?: number; no?: number; presentNotVoting?: number; absent?: number };
  locator: string;
  // Aggregate context only; no individual member vote is present in this XML.
}

export interface TloHistoryAction {
  actionCode: string;
  date: string;
  dateRaw: string;
  description: string;
  comment: string;
  actionTimestamp?: string;
  chamber?: TloChamber;
  locator: string;
}

export interface TloVoteReference extends TloHistoryAction {
  kind: "record_vote" | "journal_vote";
  rollCallNumber?: string;
  // A journal lookup hint, NOT evidence of any named member's vote or question.
}

export interface TloBill extends TloBillIdentity {
  bill: string;
  chamber: TloChamber;
  lastUpdate?: string;
  source?: string;
  disclaimer?: string;
  lastAction?: string;
  /** Latest caption, NOT a caption proven effective on every historical action date. */
  caption?: { text: string; version?: string; locator: string };
  affiliations: TloAffiliation[];
  committees: TloCommittee[];
  subjects: string[];
  actions: TloHistoryAction[];
  voteReferences: TloVoteReference[];
}

const record = z.record(z.string(), z.unknown());
const eventSchema = z.object({
  actionNumber: z.string().regex(/^[A-Z]\d{3}$/),
  date: z.string(),
  description: xmlText.pipe(z.string().min(1)),
  comment: xmlText.optional().default(""),
  actionTimestamp: xmlText.optional(),
});

function children(value: unknown): Record<string, unknown> {
  return value === undefined || value === "" ? {} : record.parse(value);
}

function text(value: unknown): string {
  return xmlText.parse(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  return text(value) || undefined;
}

function sourceDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid TLO action date: ${value}`);
  return isoDate(`${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`);
}

function affiliations(root: Record<string, unknown>): TloAffiliation[] {
  const result: TloAffiliation[] = [];
  for (const field of ["authors", "coauthors", "sponsors", "cosponsors"] as const) {
    const names = text(root[field])
      .split("|")
      .map((name) => name.trim())
      .filter(Boolean);
    for (const [index, name] of names.entries()) {
      const kind =
        field === "authors"
          ? index === 0
            ? "primary_author"
            : "joint_author"
          : field === "sponsors"
            ? index === 0
              ? "primary_sponsor"
              : "joint_sponsor"
            : field === "coauthors"
              ? "coauthor"
              : "cosponsor";
      result.push({ kind, name, locator: `/billhistory/${field}` });
    }
  }
  return result;
}

function committees(root: Record<string, unknown>): TloCommittee[] {
  const result: TloCommittee[] = [];
  const section = children(root.committees);
  for (const chamber of ["house", "senate"] as const) {
    for (const [index, value] of array(section[chamber]).entries()) {
      const item = children(value);
      const name = text(item["@name"]);
      if (!name) continue;
      const votes: TloCommittee["votes"] = {};
      const keys = {
        yes: "ayeVotes",
        no: "nayVotes",
        presentNotVoting: "presentNotVotingVotes",
        absent: "absentVotes",
      } as const;
      for (const [key, attr] of Object.entries(keys)) {
        const raw = item[`@${attr}`];
        if (raw !== undefined && raw !== "") votes[key as keyof typeof votes] = count.parse(raw);
      }
      result.push({
        chamber,
        name,
        votes,
        status: optionalText(item["@status"]),
        subcommitteeName: optionalText(item["@subcommitteeName"]),
        subcommitteeStatus: optionalText(item["@subcommitteeStatus"]),
        locator: `/billhistory/committees/${chamber}[${index + 1}]`,
      });
    }
  }
  return result;
}

/** Pure structured-XML parser. Preserves undated affiliations, aggregate committee
 * counts and journal references separately from candidate-attributed actions.
 * It never follows the billtext HTML/PDF URLs embedded in a history document. */
export function parseTloBillHistory(originalText: string): TloBill {
  // Remove BOM only from the parser input, never from the immutable snapshot.
  const root = record.parse(
    parseXml(originalText.replace(/^\uFEFF/, ""), "billhistory").billhistory,
  );
  const bill = z.string().parse(root["@bill"]);
  const match = /^(\d{2,3})\((R|[1-9])\)\s+(HB|SB|HJR|SJR|HCR|SCR|HR|SR)\s+(\d{1,5})$/.exec(bill);
  if (!match) throw new Error(`Invalid TLO bill identifier: ${bill}`);
  const identity = tloBillIdentity(`${match[1]}${match[2]}`, match[3], Number(match[4]));
  const actions = array(children(root.actions).action).map((value, index): TloHistoryAction => {
    const event = eventSchema.parse(value);
    return {
      actionCode: event.actionNumber,
      date: sourceDate(event.date),
      dateRaw: event.date,
      description: event.description,
      comment: event.comment,
      actionTimestamp: event.actionTimestamp || undefined,
      chamber: event.actionNumber.startsWith("H")
        ? "house"
        : event.actionNumber.startsWith("S")
          ? "senate"
          : undefined,
      locator: `/billhistory/actions/action[${index + 1}]`,
    };
  });
  const voteReferences: TloVoteReference[] = [];
  for (const event of actions) {
    const kind = /^record vote$/i.test(event.description)
      ? "record_vote"
      : /^vote recorded in journal$/i.test(event.description)
        ? "journal_vote"
        : undefined;
    if (kind) {
      voteReferences.push({
        ...event,
        kind,
        rollCallNumber: /\bRV\s*#\s*(\d+)\b/i.exec(event.comment)?.[1],
      });
    }
  }
  return {
    ...identity,
    bill,
    chamber: identity.billType.startsWith("H") ? "house" : "senate",
    lastUpdate: optionalText(root["@lastUpdate"]),
    source: optionalText(root["@source"]),
    disclaimer: optionalText(root["@disclaimer"]),
    lastAction: optionalText(root.lastaction),
    caption:
      root.caption === undefined
        ? undefined
        : {
            text: text(root.caption),
            version:
              typeof root.caption === "string"
                ? undefined
                : optionalText(children(root.caption)["@version"]),
            locator: "/billhistory/caption",
          },
    affiliations: affiliations(root),
    committees: committees(root),
    subjects: array(children(root.subjects).subject).map(text),
    actions,
    voteReferences,
  };
}
