import { z } from "zod";
import type { SnapshotClient } from "../fetch";

/**
 * Official precinct-keyed sample-ballot document list used by Travis County's
 * own sample-ballot embed (soe_sample_ballot_3.0.js: getUniqueParties).
 *
 * A precinct is the county's ballot-lookup key. A split (e.g. 315.2) is an
 * address-index subdivision, not a ballot-style ID, so it is never sent here.
 * The API returns published PDF documents only when the county has released
 * them; an empty list is "not published", not "no contests".
 */
export const TRAVIS_SAMPLE_BALLOT_API =
  "https://votetravis.gov/ce/mobile/seam/resource/rest/sampleballot/getUniqueParties";
export const TRAVIS_ELECTION_INVENTORY =
  "https://votetravis.gov/ce/mobile/seam/resource/rest/election/getElections";

const officialDocumentHosts = new Set([
  "assets01.aws.connect.clarityelections.com",
  "votetravis.gov",
  "www.votetravis.gov",
  "traviscountytx.gov",
  "www.traviscountytx.gov",
]);

const documentSchema = z
  .object({
    party: z
      .object({
        name: z.object({ englishText: z.string().min(1) }).passthrough(),
        partyAbbreviation: z.string().nullish(),
      })
      .passthrough(),
    sampleBallotDoc: z.object({ fileName: z.string().min(1) }).passthrough(),
    alternateBallotType: z
      .object({
        nameTxt: z.object({ englishText: z.string().min(1) }).passthrough(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const responseSchema = z
  .object({
    ballotType: z.string().min(1),
    ballotDocPath: z.string().url().optional(),
    PDFBallotDocs: z.array(documentSchema).default([]),
    finalPartyList: z.array(z.unknown()).optional(),
    ERROR: z.string().optional(),
  })
  .passthrough();

export interface TravisSampleBallotDocument {
  party: string;
  partyAbbreviation?: string;
  alternateBallotType?: string;
  fileName: string;
  url: string;
}

export interface TravisSampleBallotResult {
  electionId: number;
  /** County precinct number. Never a split, ZIP, district, or address. */
  precinctId: number;
  language: string;
  status: "published" | "not_published" | "interactive_not_supported";
  ballotType: string;
  documents: TravisSampleBallotDocument[];
  source: {
    url: string;
    snapshotId: string;
    contentHash: string;
    fetchedAt: string;
  };
  gaps: string[];
}

function officialDocumentUrl(path: string, fileName: string): string {
  const base = new URL(path);
  const url = new URL(fileName, base);
  if (url.protocol !== "https:" || !officialDocumentHosts.has(url.hostname))
    throw new Error("Sample-ballot document URL is not an allowlisted official host");
  if (!/\.pdf$/i.test(url.pathname))
    throw new Error("Sample-ballot document is not a PDF; refusing an unverified format");
  return url.href;
}

/**
 * Fetch the official sample-ballot document list for one election + precinct.
 * No address, voter registration, PID/SID, cookie, or CAPTCHA token is used.
 */
export async function fetchTravisSampleBallotDocuments(options: {
  client: SnapshotClient;
  electionId: number;
  precinctId: number;
  language?: string;
  onProgress?: (message: string) => void;
}): Promise<TravisSampleBallotResult> {
  if (!Number.isInteger(options.electionId) || options.electionId < 1)
    throw new Error("Official election ID must be a positive integer");
  if (!Number.isInteger(options.precinctId) || options.precinctId < 1)
    throw new Error("Official precinct ID must be a positive integer");
  const language = options.language ?? "en-US";
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) throw new Error("Unsupported language tag");
  const url = new URL(TRAVIS_SAMPLE_BALLOT_API);
  url.searchParams.set("electionId", String(options.electionId));
  url.searchParams.set("precinctId", String(options.precinctId));
  url.searchParams.set("lang", language);
  const snapshot = await options.client.get(url.href, { format: "json" });
  const data = responseSchema.parse(JSON.parse(snapshot.text));
  const source = {
    url: snapshot.sourceUrl,
    snapshotId: snapshot.id,
    contentHash: snapshot.contentHash,
    fetchedAt: snapshot.fetchedAt,
  };
  options.onProgress?.(
    `Official sample-ballot list: precinct ${options.precinctId}, ${data.PDFBallotDocs.length} document(s), type ${data.ballotType}`,
  );
  if (data.ERROR)
    return {
      electionId: options.electionId,
      precinctId: options.precinctId,
      language,
      status: "not_published",
      ballotType: data.ballotType,
      documents: [],
      source,
      gaps: [`Official sample-ballot endpoint reported: ${data.ERROR}`],
    };
  if (!data.PDFBallotDocs.length)
    return {
      electionId: options.electionId,
      precinctId: options.precinctId,
      language,
      status: data.ballotType === "PDF" ? "not_published" : "interactive_not_supported",
      ballotType: data.ballotType,
      documents: [],
      source,
      gaps: [
        `The official county sample-ballot list is empty for precinct ${options.precinctId}. That is "not published", not proof that the precinct has no contests.`,
        "The countywide consolidated ballot is a union reference and must not be used as this precinct's personal ballot.",
      ],
    };
  if (data.ballotType !== "PDF" || !data.ballotDocPath)
    return {
      electionId: options.electionId,
      precinctId: options.precinctId,
      language,
      status: "interactive_not_supported",
      ballotType: data.ballotType,
      documents: [],
      source,
      gaps: [
        "The county returned an interactive ballot list without published PDF documents. Interactive ballots require a voter lookup and are not scraped.",
      ],
    };
  const documents = data.PDFBallotDocs.map((document) => ({
    party: document.party.name.englishText,
    ...(document.party.partyAbbreviation
      ? { partyAbbreviation: document.party.partyAbbreviation }
      : {}),
    ...(document.alternateBallotType
      ? { alternateBallotType: document.alternateBallotType.nameTxt.englishText }
      : {}),
    fileName: document.sampleBallotDoc.fileName,
    url: officialDocumentUrl(data.ballotDocPath!, document.sampleBallotDoc.fileName),
  }));
  return {
    electionId: options.electionId,
    precinctId: options.precinctId,
    language,
    status: "published",
    ballotType: data.ballotType,
    documents,
    source,
    gaps: [
      "Published document list verified; contest/candidate extraction and roster verification still have to succeed before a ballot-wide run.",
    ],
  };
}

/**
 * Travis County's legacy REST service rejects Accept: application/json with 406
 * even though its callback-free response is valid JSON. Use this as the
 * SnapshotClient fetch implementation for these official endpoints.
 */
export function travisCountyFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(init?.headers);
  if (url.startsWith("https://votetravis.gov/ce/mobile/seam/resource/rest/"))
    headers.set("Accept", "*/*");
  return fetch(input, { ...init, headers });
}
