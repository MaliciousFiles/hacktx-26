import { describe, expect, it } from "vitest";
import { austinCouncilAdapter } from "./austin-council";
import { mockContext, offsetPage } from "./test-helpers";

const endpoint = "https://datahub.austintexas.gov/resource/3c89-i35a.json";
const vote = (id: string, voter: string, district: string, cast: string) => ({
  meeting_date: "2025-03-06T00:00:00.000", meeting_type: "Austin City Council (Regular)", meeting_item_number: "1",
  item_description: "Approve the budget.", voter_name: voter, voter_district: district, vote_cast: cast,
  action_taken: "Approved", item_id: id, vote_id: `${id}_${voter}`,
});

describe("austinCouncilAdapter", () => {
  const rows = [
    vote("i1", "Zohaib \"Zo\" Qadri", "9", "Yes"), vote("i1", "Paige Ellis", "8", "No"),
  ];
  const respond = (counts: unknown[]) => (url: URL) =>
    url.searchParams.get("$group") ? counts : offsetPage(rows, url, "socrata");

  it("resolves the district from the dataset by first/last name (nickname in the dataset), then collects only that member's votes", async () => {
    const { context } = mockContext(respond([
      { voter_name: "Zohaib \"Zo\" Qadri", voter_district: "9", votes: "10" },
      { voter_name: "Paige Ellis", voter_district: "8", votes: "10" },
    ]), { name: "Zohaib Qadri" });
    context.window = { since: "2003-01-01", before: "2026-11-01" };
    const result = await austinCouncilAdapter.collect(context, {});
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ role: "Austin City Council District 9", stance: "yes" });
    expect(result.reason).toContain("District 9");
  });

  it("returns a partial gap, not an empty success, when the name is absent from the 2023+ dataset", async () => {
    const { context } = mockContext(respond([]), { name: "Greg Casar" });
    const result = await austinCouncilAdapter.collect(context, {});
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toContain("not proof of no record");
  });

  it("fails closed when the exact name appears under several districts", async () => {
    const { context } = mockContext(respond([
      { voter_name: "Alex Rivera", voter_district: "3", votes: "4" }, { voter_name: "Alex Rivera", voter_district: "5", votes: "2" },
    ]));
    const result = await austinCouncilAdapter.collect(context, {});
    expect(result).toMatchObject({ status: "needs_review", actions: [] });
  });

  it("ignores accents and quoted nicknames but never matches a different first name", async () => {
    const counts = [
      { voter_name: "José \"Chito\" Vela", voter_district: "4", votes: "10" },
      { voter_name: "Alison Alter", voter_district: "10", votes: "10" },
    ];
    const jose = mockContext(respond(counts), { name: "Jose Vela" });
    expect((await austinCouncilAdapter.collect(jose.context, {})).reason).toContain("District 4");
    const ryan = mockContext(respond(counts), { name: "Ryan Alter" });
    expect((await austinCouncilAdapter.collect(ryan.context, {})).status).toBe("partial");
  });
});
