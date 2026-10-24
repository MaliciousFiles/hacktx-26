import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult } from "../adapters";
import { array, count, xmlText } from "../xml";

export const text = xmlText.pipe(z.string().min(1));
export const positiveCount = count.pipe(z.number().int().positive());
export const bioguide = z.string().regex(/^[A-Z]\d{6}$/);
export const many = <T extends z.ZodType>(schema: T) => z.preprocess(array, z.array(schema));

export function sourceConfig(hosts: string[]) {
  return z.object({
    urls: z.array(z.url().refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && hosts.includes(url.hostname) && !url.username && !url.password;
    }, "Expected an official public HTTPS source URL")).min(1),
    role: z.string().trim().min(1).optional(),
  });
}

export function memberId(context: AdapterContext): string | undefined {
  const parsed = bioguide.safeParse(context.request.candidate.identifiers?.bioguide);
  return parsed.success ? parsed.data : undefined;
}

export function unresolvedIdentity(): AdapterResult {
  return {
    actions: [], status: "needs_review",
    reason: "A verified candidate.identifiers.bioguide is required; names and surnames are never used to infer an official identity.",
  };
}

export function assertUniqueMembers(members: { id: string }[]): void {
  const seen = new Set<string>();
  for (const member of members) {
    if (seen.has(member.id)) throw new Error(`Duplicate member ID in roll call: ${member.id}`);
    seen.add(member.id);
  }
}

export function validateMargin(
  members: { value: NonNullable<OfficialAction["vote"]>["value"] }[],
  margin: { yes: number; no: number; present: number; notVoting: number },
): void {
  const actual = { yes: 0, no: 0, present: 0, notVoting: 0 };
  for (const member of members) {
    if (member.value === "not_voting") actual.notVoting++;
    else if (member.value === "yes" || member.value === "no" || member.value === "present") actual[member.value]++;
    else throw new Error("Unrecognized member vote cannot be reconciled against aggregate totals");
  }
  if (Object.keys(actual).some((key) => actual[key as keyof typeof actual] !== margin[key as keyof typeof margin])) {
    throw new Error("Member votes do not match aggregate totals");
  }
}

export function rollCallId(chamber: string, year: string, roll: number, id: string): string {
  return `us-congress:${chamber}:${year}:roll:${roll}:member:${id}`;
}

/** Map Clerk/LIS legis-num labels to a Congress.gov bill URL when parseable. */
export function congressMeasureUrl(congress: number, legisNum: string): string | undefined {
  // Clerk forms: "H R 4275", "H RES 953", "H J RES 12", "H CON RES 64", "S 123"
  const raw = legisNum.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  const match = /^(H|S)(?:\s+(R|RES|J\s+RES|CON\s+RES))?\s+(\d+)$/.exec(raw);
  if (!match) return undefined;
  const senate = match[1] === "S";
  const kind = (match[2] ?? "R").replace(/\s+/g, " ");
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number < 1) return undefined;
  const path =
    kind === "R" ? `${senate ? "senate" : "house"}-bill`
    : kind === "J RES" ? `${senate ? "senate" : "house"}-joint-resolution`
    : kind === "CON RES" ? `${senate ? "senate" : "house"}-concurrent-resolution`
    : `${senate ? "senate" : "house"}-resolution`;
  const mod = congress % 100;
  const ordinal = mod === 11 || mod === 12 || mod === 13 ? "th"
    : congress % 10 === 1 ? "st" : congress % 10 === 2 ? "nd" : congress % 10 === 3 ? "rd" : "th";
  return `https://www.congress.gov/bill/${congress}${ordinal}-congress/${path}/${number}`;
}

export function prettyLegisNum(legisNum: string): string {
  const raw = legisNum.trim().replace(/\s+/g, " ");
  return raw
    .replace(/^H\s+R\s+/i, "H.R. ")
    .replace(/^H\s+RES\s+/i, "H.Res. ")
    .replace(/^H\s+J\s+RES\s+/i, "H.J.Res. ")
    .replace(/^H\s+CON\s+RES\s+/i, "H.Con.Res. ")
    .replace(/^S\s+RES\s+/i, "S.Res. ")
    .replace(/^S\s+J\s+RES\s+/i, "S.J.Res. ")
    .replace(/^S\s+CON\s+RES\s+/i, "S.Con.Res. ")
    .replace(/^S\s+(\d+)/i, "S. $1");
}

export function mergeProvenance(target: OfficialAction, incoming: OfficialAction): void {
  const references = new Map((target.provenance ?? []).map((ref) => [`${ref.snapshotId}:${ref.locator}`, ref]));
  for (const ref of incoming.provenance ?? []) references.set(`${ref.snapshotId}:${ref.locator}`, ref);
  target.provenance = [...references.values()];
}

export function addAction(actions: Map<string, OfficialAction>, action: OfficialAction): void {
  const existing = actions.get(action.id);
  if (!existing) { actions.set(action.id, action); return; }
  if (existing.date !== action.date || existing.type !== action.type || existing.stance !== action.stance
    || JSON.stringify(existing.margin) !== JSON.stringify(action.margin)
    || JSON.stringify(existing.vote) !== JSON.stringify(action.vote)) {
    throw new Error(`Conflicting records for event ${action.id}`);
  }
  mergeProvenance(existing, action);
}

export function result(actions: Iterable<OfficialAction>, source: string, warnings: Set<string>): AdapterResult {
  const sorted = [...actions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!sorted.length) warnings.add("No attributable actions in the requested window; this is not proof of absence, inaction, or never having held office.");
  return {
    actions: sorted,
    status: warnings.size ? "partial" : "complete",
    reason: `Validated only the supplied ${source} URLs, not a complete career history. ${[...warnings].join(" ")}`.trim(),
  };
}
