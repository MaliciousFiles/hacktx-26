import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RecordsCollector } from "./collector";
import type { RecordsPlan } from "./collector";
import { SnapshotClient } from "./fetch";
import type { CacheMode } from "./fetch";
import { houseClerkAdapter, govinfoCrecAdapter, govinfoBillstatusAdapter } from "./federal";
import { socrataVotesAdapter, civicClerkAdapter, legistarAdapter, austinCouncilAdapter, accBoardAdapter, aisdBoardAdapter, travisOfficeRecordsAdapter } from "./local";
import {
  tloBillHistoryAdapter,
  txHouseJournalAdapter,
  txSenateJournalAdapter,
  tloAuthorIndexAdapter,
  tloBillAnalysisAdapter,
  txLegislatorAdapter,
  tloGovernorReportAdapter,
} from "./texas";
import { scotxOrdersAdapter, tamesOpinionsAdapter, scjcSanctionsAdapter, txCourtOpinionsAdapter } from "./judicial";
import { agOpinionsAdapter, governorOrdersAdapter, lrlGovernorOrdersAdapter, texasRegisterAdapter } from "./executive";
import { officialMinutesAdapter } from "./minutes";
import { voteTravisAdapter } from "./ballot";
import { resolveHouseMember } from "./identity";
import { CONNECTOR_CAPABILITIES } from "./capabilities";

const houseIdentityConfig = z.object({ state: z.string().regex(/^[A-Z]{2}$/).optional() }).strict();
export const recordsAdapters = [
  houseClerkAdapter, govinfoCrecAdapter, govinfoBillstatusAdapter,
  tloBillHistoryAdapter, txHouseJournalAdapter, txSenateJournalAdapter,
  tloAuthorIndexAdapter, tloBillAnalysisAdapter, txLegislatorAdapter, tloGovernorReportAdapter,
  socrataVotesAdapter, civicClerkAdapter, legistarAdapter, austinCouncilAdapter,
  accBoardAdapter, aisdBoardAdapter, travisOfficeRecordsAdapter,
  scotxOrdersAdapter, tamesOpinionsAdapter, scjcSanctionsAdapter, txCourtOpinionsAdapter,
  agOpinionsAdapter, governorOrdersAdapter, lrlGovernorOrdersAdapter, texasRegisterAdapter,
  officialMinutesAdapter, voteTravisAdapter,
];

export function createRecordsCollector(options: {
  cacheDirectory?: string;
  cacheMode?: CacheMode;
  congressApiKey?: string;
  client?: SnapshotClient;
  plan?: RecordsPlan;
} = {}): RecordsCollector {
  for (const adapter of recordsAdapters) {
    if (!(adapter.kind in CONNECTOR_CAPABILITIES)) throw new Error(`Missing discovery/recovery capability declaration: ${adapter.kind}`);
  }
  return new RecordsCollector({
    plan: options.plan,
    client: options.client ?? new SnapshotClient({
      directory: options.cacheDirectory ?? fileURLToPath(new URL("../.cache/", import.meta.url)),
      mode: options.cacheMode,
      // Full-history scans fetch many pages per host (e.g. OAG opinions); give publisher
      // rate limits (429) more room: delays of 0.5s, 1s, 2s, 4s, 8s.
      intervalMs: 750,
      retries: 5,
      recovery: true,
    }),
    adapters: recordsAdapters,
    resolvers: {
      house: (request, client, config) => resolveHouseMember(request, client, {
        ...houseIdentityConfig.parse(config ?? {}), congressApiKey: options.congressApiKey,
      }),
    },
  });
}
