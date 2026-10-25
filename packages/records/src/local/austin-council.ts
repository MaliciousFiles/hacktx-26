import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { isContested } from "../model";
import { socrataVotesAdapter } from "./socrata";

/**
 * Austin City Council votes with the council district resolved from the official
 * dataset itself. A tiny exact-name query finds the district(s) listed beside the
 * candidate's name in `voter_name`/`voter_district`; only then are the full vote
 * rows collected and filtered to that district by the Socrata adapter. Name-only
 * matching can't cross districts, and an ambiguous district fails closed.
 *
 * The dataset begins in 2023, so earlier council service is an explicit gap.
 */
const configSchema = z.object({
  endpoint: z.string().url().default("https://datahub.austintexas.gov/resource/3c89-i35a.json"),
  /** Keep only contested votes (minority >= 10%), closest first, at most this many. 0 = keep all votes. */
  maxVotes: z.number().int().min(0).max(20000).default(300),
}).strict();

const nameSuffixes = new Set(["jr", "sr", "ii", "iii", "iv"]);

function councilTokens(name: string): string[] {
  return name.normalize("NFD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en-US")
    .replace(/["“”][^"“”]*["“”]/g, " ").replace(/[.,'-]/g, " ")
    .split(/\s+/).filter((token) => token && !nameSuffixes.has(token));
}

/** Same person by first and last name, ignoring accents, nicknames in quotes, and suffixes. */
export function sameCouncilName(a: string, b: string): boolean {
  const left = councilTokens(a);
  const right = councilTokens(b);
  if (left.length < 2 || right.length < 2) return false;
  return left[0] === right[0] && left[left.length - 1] === right[right.length - 1];
}

const countRow = z.object({ voter_name: z.string(), voter_district: z.string().nullish(), votes: z.string() });

export const austinCouncilAdapter: RecordsAdapter = {
  kind: "austin-council-votes",
  async collect(context, input) {
    const parsed = configSchema.safeParse(input ?? {});
    if (!parsed.success) return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    const { endpoint, maxVotes } = collectionConfig(parsed.data, context);
    // Dataset names carry nicknames and accents (`Zohaib "Zo" Qadri`, `José "Chito" Vela`), so the
    // whole (small) voter list is fetched once and compared by first + last name.
    const raw = [context.request.candidate.name, ...(context.request.candidate.aliases ?? [])];
    const url = new URL(endpoint);
    url.searchParams.set("$select", "voter_name,voter_district,count(*) as votes");
    url.searchParams.set("$group", "voter_name,voter_district");
    url.searchParams.set("$limit", "500");
    const snapshot = await context.client.get(url.href, { format: "json" });
    const voters = z.array(countRow).parse(JSON.parse(snapshot.text));
    const rows = voters.filter((voter) => raw.some((name) => sameCouncilName(name, voter.voter_name)));
    const districts = [...new Set(rows.map((row) => (row.voter_district ?? "").trim()))];
    if (rows.length === 0) {
      return {
        actions: [], status: "partial",
        reason: "No council votes under this exact name in the official Austin votes dataset (2023-01 onward). Earlier council service predates the dataset; this is not proof of no record.",
      };
    }
    if (districts.length !== 1 || !districts[0]) {
      return { actions: [], status: "needs_review", reason: `Exact name appears under several council districts (${districts.join(", ")}); identity requires review.` };
    }
    const district = districts[0];
    const role = district === "0" ? "Austin Mayor" : `Austin City Council District ${district}`;
    // The vote adapter matches voter_name exactly, so hand it the dataset's own spelling.
    const datasetNames = [...new Set(rows.map((row) => row.voter_name))];
    const named = {
      ...context,
      request: {
        ...context.request,
        candidate: { ...context.request.candidate, aliases: [...(context.request.candidate.aliases ?? []), ...datasetNames] },
      },
    };
    const result = await socrataVotesAdapter.collect(named, { endpoint, role, candidateDistrict: district });
    let actions = result.actions;
    let selection = "";
    if (maxVotes > 0) {
      const share = (margin: { yes: number; no: number }) => Math.min(margin.yes, margin.no) / (margin.yes + margin.no);
      const contested = actions.filter((action) => action.margin && isContested(action.margin));
      contested.sort((a, b) => share(b.margin!) - share(a.margin!) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      selection = ` Kept ${Math.min(contested.length, maxVotes)} of ${actions.length} votes (contested, closest first).`;
      actions = contested.slice(0, maxVotes);
    }
    return {
      ...result,
      actions,
      reason: `District ${district} from the dataset's own voter_district beside the exact name. ${result.reason}${selection}`,
    };
  },
};
