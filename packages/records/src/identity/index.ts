import type { CandidateResearchRequest } from "@ftb/types";
import { candidateNames, provenance, requestSchema } from "../model";
import type { Snapshot } from "../model";
import { configuredState, fetchMemberTerms, findCongressMemberByState, verifyCongressMember } from "./congress";
import { BIOGUIDE_ID, HOUSE_ROSTER_URL, IDENTITY_ADAPTER, matchesFullName, parseHouseRoster, rosterNames } from "./roster";
import type { HouseIdentityOptions, HouseIdentityResult, HouseRoster, IdentityLookup, IdentitySnapshotClient } from "./types";

export { HOUSE_ROSTER_URL, parseHouseRoster } from "./roster";
export type { MemberTerm, HouseIdentityOptions, HouseIdentityResult, HouseIdentityStatus, HouseRoster, HouseRosterMember, IdentitySnapshotClient } from "./types";

// Freeze one roster per client, including concurrent resolutions. A new client
// starts a new lookup session; failed loads are retryable, not cached forever.
const rosters = new WeakMap<IdentitySnapshotClient, Promise<{ snapshot: Snapshot; roster: HouseRoster }>>();
function loadRoster(client: IdentitySnapshotClient): Promise<{ snapshot: Snapshot; roster: HouseRoster }> {
  let pending = rosters.get(client);
  if (!pending) {
    pending = client.get(HOUSE_ROSTER_URL, { format: "xml", root: "MemberData" })
      .then((snapshot) => ({ snapshot, roster: parseHouseRoster(snapshot.text) }))
      .catch((error: unknown) => { rosters.delete(client); throw error; });
    rosters.set(client, pending);
  }
  return pending;
}

/** Identity only: never collects actions or treats the office sought as tenure.
 * A resolved member also carries Congress.gov service terms (best effort) so callers can skip years out of office. */
export async function resolveHouseMember(
  request: CandidateResearchRequest,
  client: IdentitySnapshotClient,
  options: HouseIdentityOptions = {},
): Promise<HouseIdentityResult> {
  const result = await resolveIdentity(request, client, options);
  const key = options.congressApiKey?.trim();
  const id = result.request.candidate.identifiers?.bioguide;
  if (result.status !== "resolved" || !key || !id) return result;
  const terms = await fetchMemberTerms(client, id, key);
  return terms ? { ...result, terms } : result;
}

async function resolveIdentity(
  request: CandidateResearchRequest,
  client: IdentitySnapshotClient,
  options: HouseIdentityOptions,
): Promise<HouseIdentityResult> {
  const before = `${request.year}-${String(request.month).padStart(2, "0")}-01`;
  const suppliedId = request.candidate.identifiers?.bioguide;
  const finish = (lookup: IdentityLookup): HouseIdentityResult => ({
    status: lookup.status,
    request: lookup.status === "resolved" ? {
      ...request,
      candidate: {
        ...request.candidate,
        identifiers: { ...request.candidate.identifiers, bioguide: lookup.bioguideId },
      },
    } : request,
    evidence: lookup.evidence,
    reason: `${lookup.reason} Lookup scope: the current House roster is not a history of all previous offices, and Congress.gov covers congressional members only; a missing match is not proof that a candidate never held office. Action dates must be before ${before} (exclusive); identity verification alone does not establish tenure.`,
  });
  if (suppliedId !== undefined && !BIOGUIDE_ID.test(suppliedId)) {
    return finish({ status: "conflict", evidence: [], reason: "The supplied bioguide ID has invalid format; expected an uppercase letter and six digits. No identity lookup was attempted." });
  }
  requestSchema.parse(request);
  const state = configuredState(options.state);
  const key = options.congressApiKey?.trim();
  const names = candidateNames(request);

  const evidence = [];
  let rosterUnavailable = false;
  try {
    const { snapshot, roster } = await loadRoster(client);
    const matches = roster.members.filter((member) => suppliedId !== undefined ?
      member.bioguideId === suppliedId :
      (!state || member.state === state) && matchesFullName(names, rosterNames(member)));
    if (matches.length > 1) {
      return finish({ status: "ambiguous", evidence: matches.map((member) => provenance(snapshot, IDENTITY_ADAPTER, member.locator)), reason: "More than one current House roster entry matches the identity; no member was selected." });
    }
    if (matches.length === 1) {
      const member = matches[0];
      const proof = [provenance(snapshot, IDENTITY_ADAPTER, member.locator)];
      if (!matchesFullName(names, rosterNames(member))) {
        return finish({ status: "conflict", evidence: proof, reason: "The supplied bioguide ID names a different current House member; no candidate name or supplied full-name alias agrees." });
      }
      if (state && member.state !== state) {
        return finish({ status: "conflict", evidence: proof, reason: "The supplied bioguide ID belongs to a member outside the configured state identity filter." });
      }
      return finish({ status: "resolved", bioguideId: member.bioguideId, evidence: proof, reason: "Verified an exact full name and bioguide ID against a unique official current House roster entry. The election office and district were not used to infer identity." });
    }
    evidence.push(provenance(snapshot, IDENTITY_ADAPTER, "/MemberData/members"));
  } catch {
    rosterUnavailable = true;
  }

  const rosterReason = rosterUnavailable ? "The current House roster was unavailable or invalid." :
    suppliedId !== undefined ? "The supplied bioguide ID is absent from the current House roster; it may belong to a former member." :
    "No exact full-name match was found in the configured current House roster scope.";
  if (!key) {
    return finish({ status: "unresolved", evidence, reason: `${rosterReason} Historical Congress.gov verification requires an explicitly configured congressApiKey; no default key or unofficial source was used.` });
  }
  if (suppliedId === undefined && !state) {
    return finish({ status: "unresolved", evidence, reason: `${rosterReason} Historical name lookup requires an explicit state identity filter or a supplied bioguide ID; no state was inferred from the election jurisdiction.` });
  }
  const historical = suppliedId !== undefined ?
    await verifyCongressMember(client, suppliedId, names, key, state) :
    await findCongressMemberByState(client, state!, names, key);
  return finish({ ...historical, evidence: [...evidence, ...historical.evidence], reason: `${rosterReason} ${historical.reason}` });
}
