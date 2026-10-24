import { describe, expect, it } from "vitest";
import { socrataVotesAdapter, socrataVotesConfigSchema } from "./index";
import { mockContext, offsetPage } from "./test-helpers";

const config = { endpoint: "https://data.example.gov/resource/votes.json", role: "Historical Council D9" };
function row(overrides: Record<string, unknown> = {}) {
  return {
    meeting_date: "2026-08-27T00:00:00.000", meeting_item_number: "99",
    item_description: "Zoning ordinance", voter_name: "Alex Rivera", voter_district: "9",
    vote_cast: "Yes", action_taken: "Approved on all three readings",
    item_id: "260827_RG_099", vote_id: "vote-1", meeting_type: "Council",
    ...overrides,
  };
}

describe("socrata-votes", () => {
  it("combines groups split over pages, fetching all members rather than filtering the target", async () => {
    const rows = [
      row({ voter_name: 'Alex "Al" Rivera', vote_id: "1", vote_cast: "No" }),
      row({ voter_name: "Jamie Rivera", vote_id: "2", vote_cast: "Yes" }),
      row({ voter_name: "Sam Lee", vote_id: "3", vote_cast: "Abstain" }),
      row({ voter_name: "Taylor Jones", vote_id: "4", vote_cast: "Recused" }),
      row({ voter_name: "Pat Smith", vote_id: "5", vote_cast: "No" }),
    ];
    const { context, urls } = mockContext((url) => offsetPage(rows, url, "socrata"), { aliases: ['Alex "Al" Rivera'] });
    const result = await socrataVotesAdapter.collect(context, { ...config, pageSize: 2 });
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(1);
    const action = result.actions[0];
    expect(action).toMatchObject({
      actorId: "candidate-1", role: config.role, stance: "no",
      margin: { yes: 1, no: 2, abstain: 1, recused: 1 },
      vote: { value: "no", raw: "No", question: "Approved on all three readings" },
      extraction: "json", attribution: { method: "named_record" },
    });
    expect(action.consent).toBeUndefined();
    expect(action.provenance).toHaveLength(5);
    expect(new Set(action.provenance!.map((proof) => proof.snapshotId)).size).toBe(3);
    expect(action.provenance!.every((proof) => proof.contentHash.length === 64 && proof.adapter === "socrata-votes@1")).toBe(true);
    expect(urls.map((url) => url.searchParams.get("$offset"))).toEqual(["0", "2", "4"]);
    for (const url of urls) {
      expect(url.searchParams.get("$where")).toBe("meeting_date >= '2026-01-01T00:00:00' AND meeting_date < '2026-11-01T00:00:00'");
      expect(url.searchParams.get("$where")).not.toMatch(/voter|district|Rivera/);
      expect(url.searchParams.get("$order")).toBe("meeting_date ASC,item_id ASC,vote_id ASC");
    }
    expect(result.reason).toMatch(/not all official history/);
    expect(result.reason).toMatch(/freshness/);
  });

  it("does not match surnames or an unverified nickname", async () => {
    const { context } = mockContext(() => [row({ voter_name: "Jamie Rivera" }), row({ voter_name: 'Alex "Al" Rivera', vote_id: "2" })]);
    const result = await socrataVotesAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "complete", actions: [] });
  });

  it.each([
    ["Abstain", "abstain", "abstain", { yes: 1, no: 0, abstain: 1 }],
    ["Recused", "recused", "n/a", { yes: 1, no: 0, recused: 1 }],
    ["Absent", "not_voting", "n/a", { yes: 1, no: 0, absent: 1 }],
    ["Off Dais", "not_voting", "n/a", { yes: 1, no: 0, notVoting: 1 }],
    ["Offdais", "not_voting", "n/a", { yes: 1, no: 0, notVoting: 1 }],
    ["Present", "present", "n/a", { yes: 1, no: 0, present: 1 }],
  ])("preserves %s without converting it to opposition/abstention", async (raw, value, stance, margin) => {
    const { context } = mockContext(() => [row({ vote_cast: raw }), row({ voter_name: "Sam Lee", vote_id: "2" })]);
    const result = await socrataVotesAdapter.collect(context, config);
    expect(result.actions[0]).toMatchObject({ stance, margin, vote: { value, raw } });
    expect(result.status).toBe("complete");
  });

  it.each(["Withdrawn", "Withdrawn by staff", "No Action", "No action taken"])("does not manufacture an action for %s", async (action_taken) => {
    const { context } = mockContext(() => [row({ action_taken, vote_cast: action_taken })]);
    expect(await socrataVotesAdapter.collect(context, config)).toMatchObject({ status: "complete", actions: [] });
  });

  it("checks only a configured historic district, never the current election district", async () => {
    const { context } = mockContext(() => [row()]);
    expect((await socrataVotesAdapter.collect(context, config)).actions).toHaveLength(1);
    const result = await socrataVotesAdapter.collect(context, { ...config, candidateDistrict: "8" });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/historical district mismatch/);
    expect((await socrataVotesAdapter.collect(context, { ...config, candidateDistrict: "9" })).status).toBe("complete");
  });

  it.each([
    ["Approved on Consent", true],
    ["Adopted on Consent Agenda", true],
    ["Approved on all three readings", undefined],
    ["Approved after removal from consent agenda", undefined],
  ])("preserves explicit source consent labels without inferring it from unanimity: %s", async (action_taken, consent) => {
    // Austin's live 2026-08-27 JSON uses the literal "Approved on Consent".
    // Only the source action label differs; all four tallies are unanimous.
    const { context } = mockContext(() => [
      row({ action_taken }), row({ voter_name: "Sam Lee", vote_id: "2", action_taken }),
    ]);
    const result = await socrataVotesAdapter.collect(context, config);
    expect(result.status).toBe("complete");
    expect(result.actions[0].margin).toEqual({ yes: 2, no: 0 });
    expect(result.actions[0].consent).toBe(consent);
    expect(result.actions[0].vote!.question).toBe(action_taken);
  });

  it.each([
    ["duplicate vote ID", [row(), row({ voter_name: "Sam Lee" })]],
    ["duplicate normalized voter name", [row(), row({ voter_name: " ALEX   RIVERA ", vote_id: "2" })]],
    ["conflicting question", [row(), row({ voter_name: "Sam Lee", vote_id: "2", action_taken: "Amended" })]],
    ["unsupported vote", [row(), row({ voter_name: "Sam Lee", vote_id: "2", vote_cast: "Unknown" })]],
    ["source schema error", [row(), row({ voter_name: "Sam Lee", vote_id: "2", vote_cast: null })]],
  ])("rejects a tally with %s", async (_label, rows) => {
    const { context } = mockContext((url) => offsetPage(rows, url, "socrata"));
    const result = await socrataVotesAdapter.collect(context, { ...config, pageSize: 1 });
    expect(result).toMatchObject({ status: "partial", actions: [] });
  });

  it("rejects multiple target aliases appearing as separate member rows", async () => {
    const { context } = mockContext(() => [row(), row({ voter_name: "Alex Al Rivera", vote_id: "2" })], { aliases: ["Alex Al Rivera"] });
    const result = await socrataVotesAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/identity requires review/);
  });

  it("withholds even apparently complete items when a pagination guard truncates the source", async () => {
    const { context, urls } = mockContext(() => [row()]);
    const result = await socrataVotesAdapter.collect(context, { ...config, pageSize: 1, maxPages: 1 });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/maxPages=1/);
    expect(result.reason).toMatch(/tallies withheld/);
    expect(urls).toHaveLength(1);
  });

  it("withholds tallies after a later page request fails", async () => {
    const { context } = mockContext((url) => {
      if (url.searchParams.get("$offset") === "0") return [row()];
      throw new Error("network failure");
    });
    expect(await socrataVotesAdapter.collect(context, { ...config, pageSize: 1 })).toMatchObject({ status: "partial", actions: [] });
  });

  it("enforces both date boundaries even if the source ignores the filter", async () => {
    const { context } = mockContext(() => [
      row({ meeting_date: "2025-12-31", item_id: "old", vote_id: "old" }),
      row({ meeting_date: "2026-01-01", item_id: "inside", vote_id: "inside" }),
      row({ meeting_date: "2026-11-01", item_id: "cutoff", vote_id: "cutoff" }),
      row({ meeting_date: "2026-12-15", item_id: "future", vote_id: "future" }),
    ]);
    const result = await socrataVotesAdapter.collect(context, config);
    expect(result.actions.map((action) => action.date)).toEqual(["2026-01-01"]);
  });

  it("supports independently configured dataset columns and stable IDs", async () => {
    const columns = {
      meetingDate: "date", itemId: "item", voteId: "ballot", itemNumber: "number", description: "title",
      voterName: "member", voterDistrict: "district", voteCast: "choice", actionTaken: "question", body: "body",
    };
    const { context, urls } = mockContext(() => [{ date: "2026-09-01", item: "i1", ballot: "v1", title: "Motion", member: "Alex Rivera", choice: "Yes", question: "Amend" }]);
    const custom = { ...config, columns };
    const first = await socrataVotesAdapter.collect(context, custom);
    const second = await socrataVotesAdapter.collect(context, custom);
    expect(first.status).toBe("complete");
    expect(first.actions[0].id).toBe(second.actions[0].id);
    expect(first.actions[0].vote!.question).toBe("Amend");
    expect(urls[0].searchParams.get("$order")).toBe("date ASC,item ASC,ballot ASC");
    expect(socrataVotesConfigSchema.parse(config).columns.voteCast).toBe("vote_cast");
  });

  it.each([
    { ...config, endpoint: "not a URL" },
    { ...config, endpoint: "http://data.example.gov/votes.json" },
    { ...config, endpoint: "https://data.example.gov/votes.json?$where=voter_name='Alex'" },
    { ...config, columns: { voterName: "name; DROP TABLE" } },
    { ...config, pageSize: 0 },
  ])("rejects unsafe/invalid configuration before requesting a source", async (input) => {
    const { context, get } = mockContext(() => []);
    expect(await socrataVotesAdapter.collect(context, input)).toMatchObject({ status: "unavailable", actions: [] });
    expect(get).not.toHaveBeenCalled();
  });
});
