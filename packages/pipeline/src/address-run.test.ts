import { describe, expect, it } from "vitest";
import { selectRoster, parseConsolidatedBallot } from "@ftb/records";
import { buildCorpusConfig } from "./address-run";
import { ballotRunSchema } from "./run";

describe("buildCorpusConfig", () => {
  const text = `United States Senator
Senador de los Estados Unidos
Ken Paxton (REP)
James Talarico (DEM)
City of Austin, City Council
Member, District 9
Ciudad de Austin, Miembro del Concejo
Municipal, Distrito 9
Zohaib “Zo” Qadri
Rich Heyman
`;
  const roster = selectRoster(parseConsolidatedBallot(text), {
    Precinct: 315,
    Split: "315.2",
    Congressional: "G37",
    Legislative: "L49",
    Senate: "N14",
    SBOE: "B05",
    Muni: "C10",
    MuniSMD: "CA9",
    ISD: "S01",
    ISDSMD: "T44",
    College: "ACC",
    Commissioner: "P03",
    JPConstable: "J05",
  });
  const config = buildCorpusConfig({
    releaseId: "corpus-test",
    asOfDate: "2026-10-25",
    election: { year: 2026, month: 11 },
    precinct: 315,
    provenanceUrl: "https://votetravis.gov/ballot.pdf",
    contests: roster.contests,
    web: { allowedPageHosts: ["kut.org"], speechDomains: ["kut.org"] },
    records: { documentCap: 25, houseRollCap: 100 },
  });

  it("is a valid ballot-run spec and is labeled as derived, not official", () => {
    const spec = ballotRunSchema.parse(config);
    expect(spec.demo).toBe(true);
    expect(spec.ballot.ballotStyleId).toMatch(/NOT-AN-OFFICIAL/);
    expect(spec.ballot.provenance.verifiedBy).toMatch(/unreviewed/);
    expect(spec.ballot.contests.map((c) => c.office)).toEqual(["us_senate", "city_council"]);
    expect(spec.campaignWindow).toEqual({ since: "2025-11-05", until: "2026-11-03" });
  });

  it("carries no address and claims no incumbency", () => {
    const json = JSON.stringify(config);
    expect(json).not.toMatch(/26th|600 W/i);
    for (const contest of config.ballot.contests)
      for (const candidate of contest.candidates) {
        expect(candidate.incumbent).toBe(false);
        expect(candidate.identifiers).toEqual({});
      }
  });
});
