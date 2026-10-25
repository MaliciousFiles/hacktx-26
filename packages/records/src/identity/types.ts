import type { CandidateResearchRequest, RecordProvenance } from "@ftb/types";
import type { SnapshotClient } from "../fetch";

/** Structural dependency so tests can inject snapshots without making requests. */
export type IdentitySnapshotClient = Pick<SnapshotClient, "get">;

export type HouseIdentityStatus = "resolved" | "unresolved" | "ambiguous" | "conflict";

export interface HouseIdentityOptions {
  /** Explicit postal code of a state represented, never inferred from the race. */
  state?: string;
  congressApiKey?: string;
}

export interface HouseIdentityResult {
  status: HouseIdentityStatus;
  request: CandidateResearchRequest;
  evidence: RecordProvenance[];
  reason: string;
}

/** Only identity fields are projected from the official roster; never party. */
export interface HouseRosterMember {
  bioguideId: string;
  officialName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  state: string;
  district: string;
  stateDistrict: string;
  locator: string;
}

export interface HouseRoster {
  congress: number;
  members: HouseRosterMember[];
}

export type IdentityLookup = {
  evidence: RecordProvenance[];
  reason: string;
} & (
  | { status: "resolved"; bioguideId: string }
  | { status: Exclude<HouseIdentityStatus, "resolved"> }
);
