import { fileURLToPath } from "node:url";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import type { CacheMode } from "../fetch";
import {
  configuredState,
  findCongressMemberByState,
  findCongressMemberByStateDistrict,
} from "../identity/congress";
import { candidateNames } from "../model";

/**
 * Suggest a bioguide using only documented Congress.gov Member API routes
 * (https://api.congress.gov/ — MemberEndpoint.md / OpenAPI):
 *
 * - GET /v3/member/{stateCode} (paginated; currentMember=false for former members)
 * - GET /v3/member/{stateCode}/{district} when the race includes a House district
 * - GET /v3/member/{bioguideId} for detail verification (inside identity/congress)
 *
 * The unfiltered GET /v3/member list "cannot be filtered" by name
 * (MemberEndpoint.md). There is no documented `query` name-search parameter.
 */
export async function suggestBioguide(
  request: CandidateResearchRequest,
  options: {
    apiKey?: string;
    state?: string;
    cacheDirectory?: string;
    cacheMode?: CacheMode;
    client?: SnapshotClient;
  } = {},
): Promise<{ bioguide?: string; reason: string }> {
  if (request.candidate.identifiers?.bioguide) {
    return { bioguide: request.candidate.identifiers.bioguide, reason: "Using supplied bioguide." };
  }
  const key = options.apiKey?.trim();
  if (!key) {
    return { reason: "No CONGRESS_GOV_API_KEY; cannot look up bioguide via Congress.gov Member API." };
  }

  let state: string | undefined;
  try {
    state = configuredState(options.state);
  } catch {
    return { reason: "Invalid state filter for Congress.gov /member/{stateCode}." };
  }
  if (!state) {
    const segments = request.position.jurisdiction.toLowerCase().split(/[/:]/).filter(Boolean);
    const inferred = [...segments].reverse().find((part) => {
      try { return Boolean(configuredState(part)); } catch { return false; }
    });
    try { state = configuredState(inferred); } catch { state = undefined; }
  }
  if (!state) {
    return {
      reason: "Congress.gov name lookup requires documented /member/{stateCode}; no state on the race.",
    };
  }

  const client = options.client ?? new SnapshotClient({
    directory: options.cacheDirectory
      ?? fileURLToPath(new URL("../../.cache/congress-identity/", import.meta.url)),
    mode: options.cacheMode ?? "reuse",
  });
  const names = candidateNames(request);
  const district = request.position.district?.replace(/\D/g, "");

  // Prefer the narrower documented filter when a House district is on the race.
  // MemberEndpoint.md notes redistricted prior members can appear — uniqueness
  // + detail verification still required (fail closed if ambiguous).
  if (district && /^\d{1,2}$/.test(district)) {
    const byDistrict = await findCongressMemberByStateDistrict(client, state, district, names, key);
    if (byDistrict.status === "resolved" && byDistrict.bioguideId) {
      return {
        bioguide: byDistrict.bioguideId,
        reason: `Congress.gov /member/${state}/${district}: ${byDistrict.reason}`,
      };
    }
    if (byDistrict.status === "ambiguous") {
      return { reason: `Congress.gov /member/${state}/${district}: ${byDistrict.reason}` };
    }
  }

  const byState = await findCongressMemberByState(client, state, names, key);
  if (byState.status === "resolved" && byState.bioguideId) {
    return {
      bioguide: byState.bioguideId,
      reason: `Congress.gov /member/${state}: ${byState.reason}`,
    };
  }
  return { reason: `Congress.gov /member/${state}: ${byState.reason}` };
}
