import { z } from "zod";
import type { SnapshotClient } from "../fetch";

export const TRAVIS_ADDRESS_INDEX =
  "https://taxmaps.traviscountytx.gov/arcgis/rest/services/VotingAddresses/VA/MapServer/0/query";
export const TRAVIS_ELECTION_PAGE =
  "https://votetravis.gov/current-election-information/current-election/";
const fields = [
  "OBJECTID",
  "Address",
  "City",
  "ZIP",
  "Precinct",
  "Split",
  "Congressional",
  "Legislative",
  "Senate",
  "SBOE",
  "Muni",
  "MuniSMD",
  "ISD",
  "ISDSMD",
  "College",
  "Commissioner",
  "JPConstable",
];
const rowSchema = z
  .object({
    OBJECTID: z.number().int(),
    Address: z.string(),
    City: z.string().nullable(),
    ZIP: z.number().int(),
    Precinct: z.number().int().nullable(),
    Split: z.string().nullable(),
  })
  .passthrough();
const pageSchema = z.object({
  features: z.array(z.object({ attributes: rowSchema })),
  exceededTransferLimit: z.boolean().optional(),
});

/** Public county district assignments for one address row. */
export interface TravisDistrictAssignments {
  Precinct: number;
  Split: string;
  Congressional: string;
  Legislative: string;
  Senate: string;
  SBOE: string;
  Muni: string;
  MuniSMD: string;
  ISD: string;
  ISDSMD: string;
  College: string;
  Commissioner: string;
  JPConstable: string;
}

const districtFields = [
  "Congressional",
  "Legislative",
  "Senate",
  "SBOE",
  "Muni",
  "MuniSMD",
  "ISD",
  "ISDSMD",
  "College",
  "Commissioner",
  "JPConstable",
] as const;

function assignDistricts(row: z.infer<typeof rowSchema>): TravisDistrictAssignments {
  return {
    Precinct: row.Precinct ?? 0,
    Split: row.Split ?? "",
    ...(Object.fromEntries(
      districtFields.map((field) => [field, String(row[field] ?? "")]),
    ) as Pick<TravisDistrictAssignments, (typeof districtFields)[number]>),
  };
}

function normalizeStreet(value: string): string {
  const replacements: Record<string, string> = {
    WEST: "W",
    EAST: "E",
    NORTH: "N",
    SOUTH: "S",
    STREET: "ST",
    AVENUE: "AVE",
    BOULEVARD: "BLVD",
    ROAD: "RD",
    DRIVE: "DR",
    LANE: "LN",
  };
  return value
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => replacements[word] ?? word)
    .join(" ");
}

/** Address stays in process memory. Only a whole ZIP-level public address index
 * is requested; never call voter registration/person lookup or an online geocoder.
 * This resolves districts, NOT an official election-specific ballot style. */
export async function lookupTravisDistricts(
  address: string,
  options: { client: SnapshotClient; onProgress?: (message: string) => void; maxPages?: number },
) {
  const parsed = /^(.+?)(?:,\s*|\s+)(Austin),?\s+(?:TX|Texas)\s+(\d{5})(?:-\d{4})?\s*$/i.exec(
    address.trim(),
  );
  if (!parsed)
    throw new Error(
      "Use a complete Austin street address, city, TX and five-digit ZIP; input is not logged",
    );
  const street = normalizeStreet(parsed[1]);
  const zip = Number(parsed[3]);
  const matches: z.infer<typeof rowSchema>[] = [];
  const seen = new Set<number>();
  const snapshots: { id: string; contentHash: string; sourceUrl: string; fetchedAt: string }[] = [];
  let offset = 0;
  let exhausted = false;
  for (let page = 0; page < (options.maxPages ?? 100); page++) {
    const url = new URL(TRAVIS_ADDRESS_INDEX);
    for (const [key, value] of Object.entries({
      f: "json",
      where: `ZIP = ${zip}`,
      outFields: fields.join(","),
      returnGeometry: "false",
      resultRecordCount: "2000",
      resultOffset: String(offset),
      orderByFields: "OBJECTID",
    }))
      url.searchParams.set(key, value);
    const snapshot = await options.client.get(url.href, { format: "json" });
    const data = pageSchema.parse(JSON.parse(snapshot.text));
    snapshots.push({
      id: snapshot.id,
      contentHash: snapshot.contentHash,
      sourceUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.fetchedAt,
    });
    for (const { attributes } of data.features) {
      if (seen.has(attributes.OBJECTID))
        throw new Error("Address index repeated rows; pagination is incomplete");
      seen.add(attributes.OBJECTID);
      if (attributes.ZIP !== zip) throw new Error("Address index escaped the requested ZIP");
      if (
        normalizeStreet(attributes.Address) === street &&
        attributes.City?.toUpperCase() === "AUSTIN"
      )
        matches.push(attributes);
    }
    offset += data.features.length;
    options.onProgress?.(`Address index: page ${page + 1}, ${offset} public rows checked locally`);
    if (!data.exceededTransferLimit) {
      exhausted = true;
      break;
    }
    if (!data.features.length) throw new Error("Address index pagination stalled");
  }
  if (!exhausted) throw new Error("Address index page budget reached; no ballot selection is safe");
  const districts = matches.map(assignDistricts);
  const unique = new Map(districts.map((entry) => [JSON.stringify(entry), entry]));
  return {
    status:
      unique.size === 1 && districts[0]?.Precinct && districts[0]?.Split
        ? ("districts_resolved" as const)
        : matches.length
          ? ("ambiguous" as const)
          : ("not_found" as const),
    districts: unique.size === 1 ? districts[0] : undefined,
    matchingRows: matches.length,
    checkedRows: offset,
    snapshots,
    ballotStyleId: null,
    gaps: [
      "Public district assignments are not an election-specific ballot-style crosswalk. Use the official precinct-keyed sample-ballot list and verify its complete contest roster before launching a ballot-wide crawl.",
    ],
  };
}
