/** Normalize ballot office strings for plan / identity routing. */
export function normalizeOffice(office: string): string {
  return office.toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * U.S. House races only. Do not treat bare "representative" / "congress" as
 * federal — those collide with state house ballot labels and would wrongly
 * require a Congress.gov bioguide (the Ken Paxton class of bug).
 */
export function isUsHouseOffice(office: string): boolean {
  const key = normalizeOffice(office);
  return key === "us_house"
    || key === "house_rep"
    || key === "us_representative"
    || key === "united_states_representative";
}

/** U.S. Senate races only — not tx_senate / state senator. */
export function isUsSenateOffice(office: string): boolean {
  const key = normalizeOffice(office);
  return key === "us_senate"
    || key === "us_senator"
    || key === "united_states_senator";
}

export function isCongressionalOffice(office: string): boolean {
  return isUsHouseOffice(office) || isUsSenateOffice(office);
}

export function isTxAgOffice(office: string): boolean {
  const key = normalizeOffice(office);
  return key === "tx_ag" || key === "attorney_general" || key === "texas_attorney_general";
}

export function isGovernorOffice(office: string): boolean {
  return normalizeOffice(office) === "governor";
}

/**
 * Adapters that attribute acts only via a verified bioguide ID.
 * When congressional identity is unresolved, skip these — do not hard-block
 * name/tenure sources (Socrata, OAG opinions, TLO, minutes, …).
 */
export const BIOGUIDE_BOUND_ADAPTERS = new Set([
  "house-clerk",
  "govinfo-crec",
  "govinfo-billstatus",
]);
