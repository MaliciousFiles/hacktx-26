import { normalizeName } from "../model";
import { normalizeVoteToken } from "./spans";
import type { ExtractRequest, ExtractionBatch, ExtractedVote } from "./types";

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
      consent: /consent/i.test(motionValue) || undefined,
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
    for (const part of match[1].split(/[;,]/)) {
      const name = part.trim();
      if (!name || (labels.size && !labels.has(normalizeName(name)))) continue;
      const local = match[1].indexOf(name);
      const abs = yesStart + local;
      const voteAbs = match.index + yesHeader.index!;
      votes.push({
        member: { value: name, start: abs, end: abs + name.length },
        vote: { value: yesHeader[0], start: voteAbs, end: voteAbs + yesHeader[0].length },
        motion: { value: motionValue, start: motionStart, end: match.index },
      });
    }
    for (const part of match[2].split(/[;,]/)) {
      const name = part.trim();
      if (!name || (labels.size && !labels.has(normalizeName(name)))) continue;
      const local = match[2].indexOf(name);
      const abs = noStart + local;
      const voteAbs = match.index + noHeader.index!;
      votes.push({
        member: { value: name, start: abs, end: abs + name.length },
        vote: { value: noHeader[0], start: voteAbs, end: voteAbs + noHeader[0].length },
        motion: { value: motionValue, start: motionStart, end: match.index },
      });
    }
  }

  return {
    votes: votes.filter((vote) => normalizeVoteToken(vote.vote.value) !== "other"),
  };
}
