import { normalizeName } from "../model";
import { normalizeVoteToken } from "./spans";
import type { ExtractRequest, ExtractionBatch, ExtractedVote } from "./types";

/**
 * Consent is only claimed from this item's own text: the part of the preceding
 * window after the last blank line or numbered item marker. A neighboring
 * item's "Consent Agenda" heading must not mark this vote as consent.
 */
function isConsent(motionWindow: string): boolean {
  const boundary = Math.max(
    motionWindow.lastIndexOf("\n\n"),
    ...[...motionWindow.matchAll(/\n\s*(?:\d+[.)]|[A-Z][.)]|Item\s+\d+)/g)].map((m) => m.index),
  );
  return /\bconsent\b/i.test(motionWindow.slice(Math.max(0, boundary)));
}

/**
 * Split a printed member list into names with exact offsets. If semicolons are
 * present they separate members ("Bell, C.; Bell, K."), so commas stay inside
 * names; otherwise commas separate. Offsets advance, so a repeated name maps to
 * its own occurrence rather than the first one.
 */
function splitNames(list: string): { name: string; start: number }[] {
  const separator = list.includes(";") ? ";" : ",";
  const out: { name: string; start: number }[] = [];
  let offset = 0;
  for (const part of list.split(separator)) {
    const lead = part.length - part.trimStart().length;
    const name = part.trim();
    if (name) out.push({ name, start: offset + lead });
    offset += part.length + 1;
  }
  return out;
}

/**
 * Deterministic minutes/roll-call patterns common across BoardDocs/BoardBook/
 * Diligent/CivicPlus/PDF minutes. Prefer explicit "Name - Yes" rows and
 * Yeas/Nays blocks. Never invent participation from "motion carried unanimously"
 * alone when the candidate is not named.
 */
export function rulesExtractVotes(request: ExtractRequest): ExtractionBatch {
  const text = request.sourceText;
  const labels = new Set((request.memberLabels ?? []).map(normalizeName));
  const votes: ExtractedVote[] = [];

  const row = /^([A-Z][A-Za-z.'’ -]{1,60}?)\s*[-–:]\s*(Yes|No|Aye|Yea|Nay|Abstain|Present|Absent|Recused)\b/gim;
  let match: RegExpExecArray | null;
  while ((match = row.exec(text))) {
    const memberName = match[1].trim();
    if (labels.size && !labels.has(normalizeName(memberName))) continue;
    const voteRaw = match[2];
    const voteAt = match.index + match[0].lastIndexOf(voteRaw);
    const motionStart = Math.max(0, match.index - 200);
    // Span value must equal source.slice(start,end) exactly — never whitespace-normalize.
    const motionValue = text.slice(motionStart, match.index);
    votes.push({
      member: { value: memberName, start: match.index, end: match.index + memberName.length },
      vote: { value: voteRaw, start: voteAt, end: voteAt + voteRaw.length },
      motion: { value: motionValue, start: motionStart, end: match.index },
      consent: isConsent(motionValue) || undefined,
    });
  }

  const block = /(?:Yeas?|Ayes?)\s*:\s*([^\n]+)\n+(?:Nays?|Noes?)\s*:\s*([^\n]+)/gi;
  while ((match = block.exec(text))) {
    const yesStart = match.index + match[0].indexOf(match[1]);
    const noStart = match.index + match[0].indexOf(match[2]);
    const motionStart = Math.max(0, match.index - 180);
    const motionValue = text.slice(motionStart, match.index);
    const yesHeader = /Yeas?|Ayes?/i.exec(match[0])!;
    const noHeader = /Nays?|Noes?/i.exec(match[0])!;
    const consent = isConsent(motionValue) || undefined;
    for (const [list, listStart, header] of [
      [match[1], yesStart, yesHeader],
      [match[2], noStart, noHeader],
    ] as const) {
      const voteAbs = match.index + header.index!;
      for (const { name, start } of splitNames(list)) {
        if (labels.size && !labels.has(normalizeName(name))) continue;
        const abs = listStart + start;
        votes.push({
          member: { value: name, start: abs, end: abs + name.length },
          vote: { value: header[0], start: voteAbs, end: voteAbs + header[0].length },
          motion: { value: motionValue, start: motionStart, end: match.index },
          consent,
        });
      }
    }
  }

  return {
    votes: votes.filter((vote) => normalizeVoteToken(vote.vote.value) !== "other"),
  };
}
