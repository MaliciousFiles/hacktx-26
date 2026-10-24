import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, isoDate, normalizeName, provenance, voteStance } from "../model";
import type { Snapshot } from "../model";

const adapterVersion = "tx-journal/v1";

const officialUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "HTTPS official URL required");

const configSchema = z.object({
  urls: z.array(officialUrl).min(1),
  role: z.string().trim().min(1),
  /** Exact journal labels for this candidate, e.g. "Bell, C." or "Eckhardt". */
  journalLabels: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
  memberIdentitySourceUrl: officialUrl,
  chamber: z.enum(["house", "senate"]),
}).strict();
export type TxJournalConfig = z.infer<typeof configSchema>;

export interface JournalVote {
  record?: number;
  question: string;
  date: string;
  yes: string[];
  no: string[];
  present: string[];
  /** Absolute offsets into plain text for each side list line. */
  yesSpan?: { start: number; end: number };
  noSpan?: { start: number; end: number };
  presentSpan?: { start: number; end: number };
  margin: { yes: number; no: number; present?: number };
  sameAsPrevious: boolean;
  deemedYeaExcept: boolean;
  locator: string;
  questionLocator: string;
}

const months: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function journalDate(text: string): string {
  const match = text.match(
    /\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),\s+([A-Z]+)\s+(\d{1,2}),\s+(\d{4})\b/i,
  );
  if (!match) throw new Error("Journal page lacks a weekday header date");
  const month = months[match[1].toLowerCase()];
  if (!month) throw new Error(`Unrecognized journal month: ${match[1]}`);
  return isoDate(`${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`);
}

function cleanMemberName(part: string): string {
  // Keep initials ("C.") but drop a trailing sentence period after a surname.
  return part
    .replace(/\([^)]*\)/g, "")
    .trim()
    .replace(/[;,\s]+$/g, "")
    .replace(/(?<=[A-Za-zÀ-ÖØ-öø-ÿ]{2})\.$/u, "");
}

function splitNames(raw: string): string[] {
  return raw.split(";").map(cleanMemberName).filter(Boolean);
}

function splitSenateNames(raw: string): string[] {
  return raw.split(",").map(cleanMemberName).filter(Boolean);
}

function countMatch(names: string[], expected: number, label: string): void {
  if (names.length !== expected) {
    throw new Error(`${label} list has ${names.length} names but declared total is ${expected}`);
  }
}

function labelSet(labels: string[]): Set<string> {
  return new Set(labels.map(normalizeName));
}

function findLabel(names: string[], labels: Set<string>): string | undefined {
  const hits = names.filter((name) => labels.has(normalizeName(name)));
  if (hits.length > 1) throw new Error("Multiple configured journal labels matched the same roll call side");
  return hits[0];
}

/** House journal: named Yeas/Nays/Present lists after `(Record N): X Yeas, Y Nays, …`. */
export function parseHouseJournalVotes(plain: string, date: string): JournalVote[] {
  const votes: JournalVote[] = [];
  const header = /\((?:Record|RECORD)\s+(\d+)\):\s*(\d+)\s+Yeas?,\s*(\d+)\s+Nays?(?:,\s*(\d+)\s+Present,\s*not voting)?\./gi;
  let match: RegExpExecArray | null;
  while ((match = header.exec(plain))) {
    const record = Number(match[1]);
    const yesCount = Number(match[2]);
    const noCount = Number(match[3]);
    const presentCount = match[4] !== undefined ? Number(match[4]) : undefined;
    const after = plain.slice(match.index + match[0].length);
    const blockEnd = after.search(/\n(?:[A-Z0-9].{0,120}?by \(Record|\n[A-Z][A-Z0-9 ,.'-]{8,}\n)/);
    const block = blockEnd >= 0 ? after.slice(0, blockEnd) : after.slice(0, 4000);

    const blockOrigin = match.index + match[0].length;
    const yeas = /(?:^|\n)Yeas\s+[—–-]\s*([^\n]+)/i.exec(block);
    const nays = /(?:^|\n)Nays\s+[—–-]\s*([^\n]+)/i.exec(block);
    const present = /(?:^|\n)Present,\s*not voting\s+[—–-]\s*([^\n]+)/i.exec(block);
    if (!yeas && yesCount > 0) throw new Error(`Record ${record}: missing Yeas list`);
    if (!nays && noCount > 0) throw new Error(`Record ${record}: missing Nays list`);

    const yes = yeas ? splitNames(yeas[1]) : [];
    const no = nays ? splitNames(nays[1]) : [];
    const presentNames = present ? splitNames(present[1]) : [];
    countMatch(yes, yesCount, `Record ${record} Yeas`);
    countMatch(no, noCount, `Record ${record} Nays`);
    if (presentCount !== undefined) countMatch(presentNames, presentCount, `Record ${record} Present`);

    const listSpan = (side: RegExpExecArray | null) => {
      if (!side) return undefined;
      const start = blockOrigin + side.index + side[0].indexOf(side[1]);
      return { start, end: start + side[1].length };
    };

    const questionStart = Math.max(0, match.index - 240);
    const question = plain.slice(questionStart, match.index + match[0].length).replace(/\s+/g, " ").trim();
    votes.push({
      record,
      question,
      date,
      yes,
      no,
      present: presentNames,
      yesSpan: listSpan(yeas),
      noSpan: listSpan(nays),
      presentSpan: listSpan(present),
      margin: { yes: yesCount, no: noCount, ...(presentCount !== undefined ? { present: presentCount } : {}) },
      sameAsPrevious: false,
      deemedYeaExcept: false,
      locator: textSpanLocator(match.index, match.index + match[0].length),
      questionLocator: textSpanLocator(questionStart, match.index + match[0].length),
    });
  }
  return votes;
}

/**
 * Senate journal rules (fail closed):
 * - Full Yeas:/Nays: lists with matching totals → attribute named members.
 * - "Same as previous roll call" → reuse the immediately prior full roll's sides.
 * - "deemed to have voted Yea … except" → only attribute explicitly named exceptions;
 *   never invent Yea for unnamed members from a roster.
 */
export function parseSenateJournalVotes(plain: string, date: string): JournalVote[] {
  const votes: JournalVote[] = [];
  let previous: JournalVote | undefined;
  const lines = plain.split("\n");
  const joined = plain;

  const roll = /by the following vote:\s*Yeas?\s+(\d+),\s*Nays?\s+(\d+)\.(?:\s*\(Same as previous roll call\))?/gi;
  let match: RegExpExecArray | null;
  while ((match = roll.exec(joined))) {
    const yesCount = Number(match[1]);
    const noCount = Number(match[2]);
    const sameAsPrevious = /\(Same as previous roll call\)/i.test(match[0]);
    const questionStart = Math.max(0, match.index - 240);
    const question = joined.slice(questionStart, match.index + match[0].length).replace(/\s+/g, " ").trim();

    if (sameAsPrevious) {
      if (!previous) throw new Error("Senate roll call references a missing previous roll");
      const vote: JournalVote = {
        ...previous,
        question,
        date,
        sameAsPrevious: true,
        locator: textSpanLocator(match.index, match.index + match[0].length),
        questionLocator: textSpanLocator(questionStart, match.index + match[0].length),
      };
      votes.push(vote);
      continue;
    }

    const afterOrigin = match.index + match[0].length;
    const after = joined.slice(afterOrigin, afterOrigin + 2500);
    const yeas = /Yeas?:\s*([^\n]+)/i.exec(after);
    const nays = /Nays?:\s*([^\n]+)/i.exec(after);
    if (!yeas || !nays) throw new Error("Senate roll call is missing an explicit Yeas or Nays list");
    const yes = splitSenateNames(yeas[1]);
    const no = splitSenateNames(nays[1]);
    countMatch(yes, yesCount, "Senate Yeas");
    countMatch(no, noCount, "Senate Nays");
    const listSpan = (side: RegExpExecArray) => {
      const start = afterOrigin + side.index + side[0].indexOf(side[1]);
      return { start, end: start + side[1].length };
    };
    const vote: JournalVote = {
      question,
      date,
      yes,
      no,
      present: [],
      yesSpan: listSpan(yeas),
      noSpan: listSpan(nays),
      margin: { yes: yesCount, no: noCount },
      sameAsPrevious: false,
      deemedYeaExcept: false,
      locator: textSpanLocator(match.index, match.index + match[0].length),
      questionLocator: textSpanLocator(questionStart, match.index + match[0].length),
    };
    votes.push(vote);
    previous = vote;
  }

  // Explicit exceptions to a deemed-unanimous Yea — only named dissenters.
  const deemed = /All Members are deemed to have voted "Yea"[^.\n]*except as follows:\s*\n+Nays?:\s*([^\n]+)/gi;
  while ((match = deemed.exec(joined))) {
    const no = splitSenateNames(match[1]);
    const questionStart = Math.max(0, match.index - 200);
    const listStart = match.index + match[0].lastIndexOf(match[1]);
    votes.push({
      question: joined.slice(questionStart, match.index + match[0].length).replace(/\s+/g, " ").trim(),
      date,
      yes: [],
      no,
      present: [],
      noSpan: { start: listStart, end: listStart + match[1].length },
      margin: { yes: 0, no: no.length },
      sameAsPrevious: false,
      deemedYeaExcept: true,
      locator: textSpanLocator(match.index, match.index + match[0].length),
      questionLocator: textSpanLocator(questionStart, match.index + match[0].length),
    });
  }

  // "Senator X asked to be recorded as voting Nay/Yea"
  const asked = /Senators?\s+(.+?)\s+asked to be recorded as voting "(Yea|Nay)"/gi;
  while ((match = asked.exec(joined))) {
    const names = match[1].split(/\s+and\s+|,\s*/).map((n) => n.trim()).filter(Boolean);
    const side = match[2].toLowerCase() === "yea" ? "yes" : "no";
    const nameStart = match.index + match[0].indexOf(match[1]);
    const span = { start: nameStart, end: nameStart + match[1].length };
    votes.push({
      question: match[0],
      date,
      yes: side === "yes" ? names : [],
      no: side === "no" ? names : [],
      present: [],
      yesSpan: side === "yes" ? span : undefined,
      noSpan: side === "no" ? span : undefined,
      margin: { yes: side === "yes" ? names.length : 0, no: side === "no" ? names.length : 0 },
      sameAsPrevious: false,
      deemedYeaExcept: true,
      locator: textSpanLocator(match.index, match.index + match[0].length),
      questionLocator: textSpanLocator(match.index, match.index + match[0].length),
    });
  }

  void lines;
  return votes;
}

function actionId(chamber: string, date: string, record: number | string, candidateId: string, question: string): string {
  const key = [chamber, date, record, candidateId, normalizeName(question).slice(0, 160)];
  return `tx-journal:${createHash("sha256").update(JSON.stringify(key)).digest("hex")}`;
}

function memberLocator(plain: string, vote: JournalVote, rawLabel: string, value: "yes" | "no" | "present"): string {
  // Names repeat across roll calls; bind the label inside this vote's side-list span only.
  const span = value === "yes" ? vote.yesSpan : value === "no" ? vote.noSpan : vote.presentSpan;
  if (!span) throw new Error("Vote side list span missing for member provenance");
  const list = plain.slice(span.start, span.end);
  const escaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Allow a single trailing period in the source list; do not match longer surnames.
  const token = new RegExp(`(?<![A-Za-zÀ-ÖØ-öø-ÿ])${escaped}\\.?(?![A-Za-zÀ-ÖØ-öø-ÿ])`, "i");
  const local = token.exec(list);
  if (!local) throw new Error(`Journal label ${rawLabel} not found in vote side list`);
  return textSpanLocator(span.start + local.index, span.start + local.index + local[0].length);
}

function toAction(
  context: AdapterContext,
  config: TxJournalConfig,
  htmlSnapshot: Snapshot,
  plain: string,
  vote: JournalVote,
  rawLabel: string,
  value: "yes" | "no" | "present",
): OfficialAction {
  return {
    id: actionId(config.chamber, vote.date, vote.record ?? vote.locator, context.request.candidate.id, vote.question),
    actorId: context.request.candidate.id,
    issueIds: [],
    role: config.role,
    body: config.chamber === "house" ? "Texas House of Representatives" : "Texas Senate",
    type: "floor_vote",
    stance: voteStance(value),
    margin: vote.deemedYeaExcept ? undefined : vote.margin,
    date: vote.date,
    title: vote.record !== undefined ? `Record ${vote.record}: ${vote.question}` : vote.question,
    officialText: vote.question,
    sourceUrl: htmlSnapshot.sourceUrl,
    extraction: "html",
    dateBasis: "document_date",
    attribution: {
      method: "named_record",
      sourceActorId: rawLabel,
    },
    vote: {
      value,
      raw: value === "yes" ? "Yea" : value === "no" ? "Nay" : "Present, not voting",
      question: vote.question,
      questionBasis: "vote_question",
      method: "roll_call",
    },
    provenance: [
      provenance(htmlSnapshot, adapterVersion, vote.locator),
      provenance(htmlSnapshot, adapterVersion, vote.questionLocator),
      provenance(htmlSnapshot, adapterVersion, memberLocator(plain, vote, rawLabel, value)),
      provenance(htmlSnapshot, adapterVersion, `identity:${config.memberIdentitySourceUrl}`),
    ],
  };
}

async function collectJournal(context: AdapterContext, value: unknown): Promise<AdapterResult> {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    return {
      actions: [],
      status: "needs_review",
      reason: `Invalid journal configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    };
  }
  const config = parsed.data;
  if (config.memberCandidateId !== context.request.candidate.id) {
    return {
      actions: [],
      status: "needs_review",
      reason: "memberCandidateId must match the request candidate ID; journal labels cannot be reused for another candidate.",
    };
  }
  for (const label of config.journalLabels) {
    if (!normalizeName(label).includes(" ") && !/^[a-z'.-]+$/i.test(label)) {
      return { actions: [], status: "needs_review", reason: `Journal label looks malformed: ${label}` };
    }
  }

  const labels = labelSet(config.journalLabels);
  const actions = new Map<string, OfficialAction>();
  const problems: string[] = [];
  let parsedVotes = 0;

  for (const url of config.urls) {
    const host = new URL(url).hostname;
    if (config.chamber === "house" && !host.endsWith("journals.house.texas.gov") && !host.endsWith("journals.house.state.tx.us")) {
      problems.push(`House journal URL host not allowed: ${host}`);
      continue;
    }
    if (config.chamber === "senate" && !host.endsWith("journals.senate.texas.gov") && !host.endsWith("journals.senate.state.tx.us")) {
      problems.push(`Senate journal URL host not allowed: ${host}`);
      continue;
    }

    try {
      const snapshot = await context.client.get(url, { format: "html" });
      const plain = htmlToPlainText(snapshot.text);
      const date = journalDate(plain);
      if (!inWindow(date, context.window)) continue;
      const votes = config.chamber === "house"
        ? parseHouseJournalVotes(plain, date)
        : parseSenateJournalVotes(plain, date);
      parsedVotes += votes.length;

      for (const vote of votes) {
        try {
          const yea = findLabel(vote.yes, labels);
          const nay = findLabel(vote.no, labels);
          const present = findLabel(vote.present, labels);
          const hits = [yea && "yes", nay && "no", present && "present"].filter(Boolean);
          if (hits.length > 1) {
            problems.push(`Conflicting sides for record on ${date}: ${vote.question.slice(0, 80)}`);
            continue;
          }
          if (vote.deemedYeaExcept && !nay && !yea && !present) {
            // Candidate not among explicit exceptions — do not invent a Yea.
            continue;
          }
          if (!yea && !nay && !present) continue;
          const value = yea ? "yes" as const : nay ? "no" as const : "present" as const;
          const rawLabel = yea ?? nay ?? present!;
          const action = toAction(context, config, snapshot, plain, vote, rawLabel, value);
          actions.set(action.id, action);
        } catch (error) {
          problems.push(error instanceof Error ? error.message : "Vote attribution failed");
        }
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "Journal fetch/parse failed");
    }
  }

  if (actions.size === 0 && problems.length) {
    return { actions: [], status: "needs_review", reason: problems.join(" ") };
  }
  return {
    actions: [...actions.values()],
    status: problems.length ? "partial" : "complete",
    reason: problems.length
      ? `Parsed ${parsedVotes} journal roll calls; ${problems.length} issues: ${problems.slice(0, 3).join(" ")}`
      : `Parsed ${parsedVotes} journal roll calls from ${config.urls.length} page(s).`,
  };
}

export const txHouseJournalAdapter: RecordsAdapter = {
  kind: "tx-house-journal",
  collect: (context, config) => collectJournal(context, { ...(config as object), chamber: "house" }),
};

export const txSenateJournalAdapter: RecordsAdapter = {
  kind: "tx-senate-journal",
  collect: (context, config) => collectJournal(context, { ...(config as object), chamber: "senate" }),
};
