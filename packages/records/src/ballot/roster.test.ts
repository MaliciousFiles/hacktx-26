import { describe, expect, it } from "vitest";
import type { TravisDistrictAssignments } from "./lookup";
import { parseConsolidatedBallot, selectRoster } from "./roster";

// Excerpt of the extracted countywide bilingual PDF text (title English + Spanish, then names).
const TEXT = `Page 1 of 18
Republican = (REP)
State Offices
Oficinas Estatales
United States Senator
Senador de los Estados Unidos
Ken Paxton (REP)
Write-in / Voto Escrito
James Talarico (DEM)
United States Representative,
District 10
Representante de los Estados Unidos,
Distrito Núm. 10
Chris Gober (REP)
Caitlin Rourk (DEM)
United States Representative,
District 37
Representante de los Estados Unidos,
Distrito Núm. 37
Lauren B. Peña (REP)
Greg Casar (DEM)
Commissioner of the General
Land Office
Comisionado de la Oficina General de
Tierras
Dawn Buckingham (REP)
Benjamin Flores (DEM)
Judge, County Court at Law No. 1
Juez, Corte de Ley del Condado Núm.
1
District Judge, 147th Judicial
District
Juez del Distrito, 147 Distrito Judicial
Cliff Brown (DEM)SAMPLE BALLOT
BOLETA DE MUESTRA
City of Austin
General Municipal Election
City of Austin, City Council
Member, District 9
Ciudad de Austin, Miembro del Concejo
Municipal, Distrito 9
Rich Heyman
Zohaib “Zo” Qadri
Dave Thadani
Michael RamosSAMPLE BALLOT
City of Austin Proposition A
THIS IS A TAX INCREASE; the
FOR / A FAVOR
AGAINST / EN CONTRA
Austin ISD Board of Trustees,
District 4
Austin ISD Consejo Escolar, Distrito
4
Edward M. Bradfield
Tricia Mitchell Kim
Austin ISD Board of Trustees,
At-Large Position 9
Austin ISD Consejo Escolar,
Posición General 9
Cynthia Soliz
Coupland Independent School
District Voter Approved Tax
`;

const districts: TravisDistrictAssignments = {
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
};

describe("parseConsolidatedBallot", () => {
  const parsed = parseConsolidatedBallot(TEXT);
  const byTitle = Object.fromEntries(parsed.map((c) => [c.title, c]));

  it("joins wrapped English titles and drops the Spanish half", () => {
    expect(Object.keys(byTitle)).toContain("United States Representative, District 37");
    expect(Object.keys(byTitle)).toContain("Commissioner of the General Land Office");
  });

  it("reads party-tagged candidates and ignores write-in lines", () => {
    expect(byTitle["United States Senator"]!.candidates).toEqual([
      { name: "Ken Paxton", party: "Republican" },
      { name: "James Talarico", party: "Democrat" },
    ]);
  });

  it("attaches candidates to the last title block, not an earlier title without names", () => {
    expect(
      byTitle["District Judge, 147th Judicial District"]!.candidates.map((c) => c.name),
    ).toEqual(["Cliff Brown"]);
    expect(byTitle["Judge, County Court at Law No. 1"]).toBeUndefined();
  });

  it("parses nonpartisan names even when a page marker is glued to the last name", () => {
    expect(
      byTitle["City of Austin, City Council Member, District 9"]!.candidates.map((c) => c.name),
    ).toEqual(["Rich Heyman", "Zohaib “Zo” Qadri", "Dave Thadani", "Michael Ramos"]);
    expect(byTitle["City of Austin, City Council Member, District 9"]!.partisan).toBe(false);
  });

  it("does not treat measures or other districts' text as candidates", () => {
    expect(parsed.some((c) => /Proposition|Coupland/.test(c.title))).toBe(false);
  });
});

describe("selectRoster", () => {
  const roster = selectRoster(parseConsolidatedBallot(TEXT), districts);
  const titles = roster.contests.map((c) => c.title);

  it("keeps statewide offices and the address's own districts only", () => {
    expect(titles).toContain("United States Senator");
    expect(titles).toContain("United States Representative, District 37");
    expect(titles).toContain("City of Austin, City Council Member, District 9");
    expect(titles).not.toContain("United States Representative, District 10");
    expect(roster.skipped.map((s) => s.title)).toContain(
      "United States Representative, District 10",
    );
  });

  it("includes at-large school board seats but skips unmapped single-member districts", () => {
    expect(titles).toContain("Austin ISD Board of Trustees, At-Large Position 9");
    expect(titles).not.toContain("Austin ISD Board of Trustees, District 4");
    expect(
      roster.skipped.find((s) => s.title === "Austin ISD Board of Trustees, District 4")?.reason,
    ).toMatch(/not mapped/);
  });

  it("builds safe ids, parties and nickname aliases", () => {
    for (const contest of roster.contests) {
      expect(contest.id).toMatch(/^[a-zA-Z0-9_-]+$/);
      for (const candidate of contest.candidates) expect(candidate.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
    const council = roster.contests.find((c) => c.office === "city_council")!;
    const qadri = council.candidates.find((c) => c.name === "Zohaib Qadri")!;
    expect(qadri.aliases).toEqual(['Zohaib "Zo" Qadri', "Zo Qadri"]);
    const senate = roster.contests.find((c) => c.office === "us_senate")!;
    expect(senate).toMatchObject({ level: "federal", districtId: "TX", partisan: true });
    expect(senate.candidates[0]).toMatchObject({ name: "Ken Paxton", party: "Republican" });
  });

  it("skips jurisdictions that are not this address's", () => {
    const other = selectRoster(
      [{ title: "City of Elgin, Mayor", partisan: false, candidates: [{ name: "A B" }] }],
      districts,
    );
    expect(other.contests).toEqual([]);
    expect(other.skipped[0]!.title).toBe("City of Elgin, Mayor");
  });
});
