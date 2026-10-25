import { z } from "zod";
import type { RecordProvenance } from "@ftb/types";
import { normalizeName, provenance } from "../model";
import { BIOGUIDE_ID, IDENTITY_ADAPTER, matchesFullName } from "./roster";
import type { IdentityLookup, IdentitySnapshotClient, MemberTerm } from "./types";

// Official endpoint/field documentation, checked against MemberEndpoint.md and
// openapi.json in LibraryOfCongress/api.congress.gov. No unofficial crosswalks.
const API_ROOT = "https://api.congress.gov/v3/member/";
const PAGE_LIMIT = 250;
const MAX_PAGES = 20;
const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  AS: "American Samoa", GU: "Guam", MP: "Northern Mariana Islands",
  PR: "Puerto Rico", VI: "Virgin Islands",
};
const termSchema = z.object({ stateCode: z.string().optional() });
const detailSchema = z.object({
  member: z.object({
    bioguideId: z.string().regex(BIOGUIDE_ID),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    lastname: z.string().optional(), // spelling in the official OpenAPI example
    middleName: z.string().optional(),
    suffixName: z.string().optional(),
    directOrderName: z.string().optional(),
    invertedOrderName: z.string().optional(),
    name: z.string().optional(),
    state: z.string().optional(),
    terms: z.union([
      z.array(termSchema),
      z.object({ item: z.array(termSchema) }),
    ]).optional(),
  }),
});
const listMemberSchema = z.object({
  bioguideId: z.string().regex(BIOGUIDE_ID),
  name: z.string().min(1),
  state: z.string().min(1),
});
const listSchema = z.object({
  members: z.array(listMemberSchema).max(PAGE_LIMIT),
  pagination: z.object({ count: z.number().int().nonnegative().max(PAGE_LIMIT * MAX_PAGES) }),
});

export function configuredState(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const state = value.trim().toUpperCase();
  if (!Object.hasOwn(STATES, state)) throw new Error("state must be a US state or territory postal code");
  return state;
}

function stateMatches(value: string | undefined, state: string): boolean {
  return value !== undefined &&
    (normalizeName(value) === normalizeName(state) || normalizeName(value) === normalizeName(STATES[state]));
}

function apiUrl(path: string, key: string, offset?: number): string {
  const url = new URL(path, API_ROOT);
  url.searchParams.set("format", "json");
  url.searchParams.set("api_key", key);
  if (offset !== undefined) {
    url.searchParams.set("currentMember", "false");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));
  }
  return url.href;
}

/** The API documents list/inverted names as "last, given [middle][, suffix]". */
function directName(value: string | undefined): string {
  if (!value) return "";
  const parts = value.split(",").map((part) => part.trim());
  if (parts.some((part) => !part)) return "";
  if (parts.length === 1) return value;
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  if (parts.length === 3) return `${parts[1]} ${parts[0]} ${parts[2]}`;
  return "";
}

const serviceTermSchema = z.object({
  chamber: z.string().optional(),
  startYear: z.number().int().optional(),
  endYear: z.number().int().optional(),
});
const serviceSchema = z.object({
  member: z.object({ terms: z.union([z.array(serviceTermSchema), z.object({ item: z.array(serviceTermSchema) })]).optional() }),
});

/** Best-effort Congress.gov service years for one verified bioguide ID. Undefined means unknown (scan everything). */
export async function fetchMemberTerms(client: IdentitySnapshotClient, id: string, key: string): Promise<MemberTerm[] | undefined> {
  try {
    const snapshot = await client.get(apiUrl(id, key), { format: "json" });
    const { member } = serviceSchema.parse(JSON.parse(snapshot.text));
    const raw = Array.isArray(member.terms) ? member.terms : member.terms?.item;
    if (!raw?.length) return undefined;
    const terms: MemberTerm[] = [];
    for (const term of raw) {
      const chamber = /house/i.test(term.chamber ?? "") ? "house" : /senate/i.test(term.chamber ?? "") ? "senate" : undefined;
      if (!chamber || term.startYear === undefined) return undefined; // incomplete data must not narrow the scan
      terms.push({ chamber, startYear: term.startYear, ...(term.endYear !== undefined ? { endYear: term.endYear } : {}) });
    }
    return terms;
  } catch { return undefined; }
}

export async function verifyCongressMember(
  client: IdentitySnapshotClient,
  id: string,
  names: Set<string>,
  key: string,
  state?: string,
): Promise<IdentityLookup> {
  let evidence: RecordProvenance[] = [];
  try {
    const snapshot = await client.get(apiUrl(id, key), { format: "json" });
    evidence = [provenance(snapshot, IDENTITY_ADAPTER, "/member")];
    const { member } = detailSchema.parse(JSON.parse(snapshot.text));
    if (member.bioguideId !== id) {
      return { status: "conflict", evidence, reason: "Congress.gov returned a different bioguide ID than requested." };
    }
    const first = member.firstName?.trim();
    const last = (member.lastName ?? member.lastname)?.trim();
    const firstLast = first && last ? `${first} ${last}` : "";
    const full = first && last ?
      [first, member.middleName, last, member.suffixName].filter(Boolean).join(" ") : "";
    const officialNames = [firstLast, full, member.directOrderName ?? "",
      directName(member.invertedOrderName), directName(member.name)]
      .filter((name) => normalizeName(name) !== normalizeName(last ?? ""));
    if (!officialNames.some((name) => normalizeName(name).includes(" "))) {
      return { status: "unresolved", evidence, reason: "Congress.gov did not return a usable full name; the bioguide ID remains unverified." };
    }
    if (!matchesFullName(names, officialNames)) {
      return { status: "conflict", evidence, reason: "The bioguide ID names a different person in Congress.gov; no candidate name or supplied full-name alias agrees." };
    }
    const terms = Array.isArray(member.terms) ? member.terms : member.terms?.item ?? [];
    if (state && !stateMatches(member.state, state) && !terms.some((term) => term.stateCode === state)) {
      if (!member.state?.trim() && !terms.some((term) => term.stateCode?.trim())) {
        return { status: "unresolved", evidence, reason: "Congress.gov did not return enough state information to verify the configured identity filter." };
      }
      return { status: "conflict", evidence, reason: "Congress.gov does not associate this member with the configured state identity filter." };
    }
    return { status: "resolved", bioguideId: id, evidence, reason: "Verified the bioguide ID and exact full name against the official Congress.gov member record, including former members." };
  } catch {
    // Do not echo client errors: they could contain a credential-bearing URL.
    return { status: "unresolved", evidence, reason: "Congress.gov member verification was unavailable or returned an invalid member document; the ID remains unverified." };
  }
}

export async function findCongressMemberByState(
  client: IdentitySnapshotClient,
  state: string,
  names: Set<string>,
  key: string,
): Promise<IdentityLookup> {
  const evidence: RecordProvenance[] = [];
  const matches: { id: string; evidence: RecordProvenance }[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let total: number | undefined;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      // Documented: GET /v3/member/{stateCode}?currentMember=false&limit&offset
      const snapshot = await client.get(apiUrl(state, key, offset), { format: "json" });
      evidence.push(provenance(snapshot, IDENTITY_ADAPTER, "/members"));
      const data = listSchema.parse(JSON.parse(snapshot.text));
      if (total !== undefined && total !== data.pagination.count) throw new Error("Member count changed");
      total = data.pagination.count;
      if (offset + data.members.length > total) throw new Error("Inconsistent pagination");
      for (const [index, member] of data.members.entries()) {
        const match = stateMatches(member.state, state) && matchesFullName(names, [directName(member.name)]);
        if (match) matches.push({ id: member.bioguideId, evidence: provenance(snapshot, IDENTITY_ADAPTER, `/members/${index}`) });
        if (matches.length > 1) {
          return { status: "ambiguous", evidence: matches.map((member) => member.evidence), reason: "More than one official Congress.gov listing matches a supplied full name in the configured state; no identity was selected." };
        }
        if (ids.has(member.bioguideId)) throw new Error("Repeated member in pagination");
        ids.add(member.bioguideId);
      }
      offset += data.members.length;
      if (offset === total) {
        if (!matches.length) {
          return { status: "unresolved", evidence, reason: "No exact listed full-name match in the configured state's Congress.gov current/former member listing. List-name variants without a supplied matching alias remain unresolved." };
        }
        const match = matches[0];
        const verified = await verifyCongressMember(client, match.id, names, key, state);
        return { ...verified, evidence: [match.evidence, ...verified.evidence] };
      }
      if (!data.members.length) throw new Error("Incomplete member listing");
    }
  } catch {
    // Pagination must finish before a unique name can be treated as unique.
  }
  return { status: "unresolved", evidence, reason: "The Congress.gov historical state listing could not be read completely within the lookup cap; uniqueness was not established." };
}

/**
 * Documented filter: GET /v3/member/{stateCode}/{district}.
 * MemberEndpoint.md: prior members for a redistricted seat can appear; use
 * currentMember=true when only the sitting member is desired. For history
 * identity we keep currentMember=false and still require a unique full-name match.
 */
export async function findCongressMemberByStateDistrict(
  client: IdentitySnapshotClient,
  state: string,
  district: string,
  names: Set<string>,
  key: string,
  options: { currentMember?: boolean } = {},
): Promise<IdentityLookup> {
  if (!/^\d{1,2}$/.test(district)) {
    return { status: "unresolved", evidence: [], reason: "District filter must be a 1–2 digit House district number per Congress.gov /member/{stateCode}/{district}." };
  }
  const evidence: RecordProvenance[] = [];
  try {
    const url = new URL(`${state}/${district}`, API_ROOT);
    url.searchParams.set("format", "json");
    url.searchParams.set("api_key", key);
    url.searchParams.set("currentMember", options.currentMember === true ? "true" : "false");
    const snapshot = await client.get(url.href, { format: "json" });
    evidence.push(provenance(snapshot, IDENTITY_ADAPTER, `/member/${state}/${district}`));
    const data = z.object({ members: z.array(listMemberSchema) }).parse(JSON.parse(snapshot.text));
    const matches = data.members.filter((member) =>
      stateMatches(member.state, state) && matchesFullName(names, [directName(member.name)]));
    if (matches.length > 1) {
      return {
        status: "ambiguous",
        evidence,
        reason: "More than one Congress.gov /member/{stateCode}/{district} listing matches the supplied full name; no identity was selected.",
      };
    }
    if (matches.length === 0) {
      return {
        status: "unresolved",
        evidence,
        reason: "No exact full-name match in Congress.gov /member/{stateCode}/{district} for the configured filter.",
      };
    }
    const verified = await verifyCongressMember(client, matches[0].bioguideId, names, key, state);
    return { ...verified, evidence: [...evidence, ...verified.evidence] };
  } catch {
    return {
      status: "unresolved",
      evidence,
      reason: "Congress.gov /member/{stateCode}/{district} was unavailable or returned an invalid document.",
    };
  }
}
