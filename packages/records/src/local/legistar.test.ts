import { describe, expect, it } from "vitest";
import { legistarAdapter } from "./index";
import { mockContext, offsetPage } from "./test-helpers";

const config = { baseUrl: "https://webapi.legistar.com/v1/example", role: "City Council" };
function event(overrides: Record<string, unknown> = {}) {
  return { EventId: 3780, EventDate: "2026-09-22T00:00:00", EventBodyId: 138, EventBodyName: "City Council", ...overrides };
}
function item(overrides: Record<string, unknown> = {}) {
  return {
    EventItemId: 77698, EventItemEventId: 3780, EventItemTitle: "Action on the Consent Agenda",
    EventItemActionName: "Adopt the Consent Agenda", EventItemActionText: "All those present voted in favor.",
    EventItemConsent: 0, EventItemRollCallFlag: 0, ...overrides,
  };
}
function vote(overrides: Record<string, unknown> = {}) {
  return { VoteId: 42131, VotePersonId: 227, VotePersonName: "Alex Rivera", VoteValueId: 16, VoteValueName: "Aye", VoteResult: 1, VoteEventItemId: 77698, ...overrides };
}
function source(votes: unknown[] = [vote()], items: unknown[] = [item()], events: unknown[] = [event()]) {
  return (url: URL) => {
    if (url.pathname.endsWith("/events")) return offsetPage(events, url);
    if (url.pathname.endsWith("/eventitems")) return offsetPage(items, url);
    if (url.pathname.endsWith("/votes")) return offsetPage(votes, url);
    throw new Error(`Unexpected URL ${url.pathname}`);
  };
}

describe("legistar", () => {
  it("uses official person IDs and actual votes even when roll-call/consent flags are zero", async () => {
    const votes = [
      vote({ VoteValueName: "No" }),
      vote({ VoteId: 2, VotePersonId: 2, VotePersonName: "Jamie Rivera" }),
      vote({ VoteId: 3, VotePersonId: 3, VotePersonName: "Sam Lee", VoteValueName: "Abstain" }),
      vote({ VoteId: 4, VotePersonId: 4, VotePersonName: "Pat Smith", VoteValueName: "Recused" }),
      vote({ VoteId: 5, VotePersonId: 5, VotePersonName: "Taylor Jones", VoteValueName: "Non-voting" }),
      vote({ VoteId: 6, VotePersonId: 6, VotePersonName: "Morgan Doe", VoteValueName: "Absent" }),
    ];
    const { context, urls } = mockContext(source(votes), { identifiers: { "legistar:example": "227" } });
    const result = await legistarAdapter.collect(context, { ...config, bodyId: 138 });
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      actorId: "candidate-1", stance: "no", consent: true,
      margin: { yes: 1, no: 1, abstain: 1, recused: 1, notVoting: 1, absent: 1 },
      vote: { value: "no", raw: "No", question: "Adopt the Consent Agenda", method: "unknown" },
      attribution: { method: "member_id", sourceActorId: "227" }, extraction: "json",
    });
    expect(result.actions[0].provenance).toHaveLength(8);
    expect(urls.some((url) => url.pathname === "/v1/example/eventitems/77698/votes")).toBe(true);
    expect(urls[0].searchParams.get("$filter")).toBe("EventDate ge datetime'2026-01-01T00:00:00' and EventDate lt datetime'2026-11-01T00:00:00' and EventBodyId eq 138");
    expect(urls[0].searchParams.get("$orderby")).toBe("EventDate,EventId");
  });

  it("supports an explicitly configured actorId and verified full-name aliases", async () => {
    const { context } = mockContext(source([vote({ VotePersonName: 'Alex "Al" Rivera' })]), { aliases: ['Alex "Al" Rivera'] });
    const result = await legistarAdapter.collect(context, { ...config, actorId: 227 });
    expect(result.status).toBe("complete");
    expect(result.actions[0].attribution).toEqual({ method: "member_id", sourceActorId: "227" });
    expect(result.actions[0].provenance!.every((proof) => proof.adapter === "legistar@1")).toBe(true);
  });

  it("falls back only to an exact full name and retains the resulting source person ID", async () => {
    const { context } = mockContext(source());
    const result = await legistarAdapter.collect(context, config);
    expect(result.actions[0].attribution).toEqual({ method: "named_record", sourceActorId: "227" });
    expect(result.actions[0].vote!.raw).toBe("Aye");
  });

  it("retains an explicitly indicated roll-call method", async () => {
    const { context } = mockContext(source([vote()], [item({ EventItemRollCallFlag: 1 })]));
    const result = await legistarAdapter.collect(context, config);
    expect(result.actions[0].vote!.method).toBe("roll_call");
  });

  it("does not interpret an unmatched surname as the candidate or infer absence", async () => {
    const { context } = mockContext(source([vote({ VotePersonName: "Jamie Rivera" })]));
    const result = await legistarAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/unknown, not absent/);
  });

  it.each([
    ["missing value", { VoteValueName: undefined }],
    ["null value", { VoteValueName: null }],
    ["empty value", { VoteValueName: "" }],
    ["unsupported value", { VoteValueName: "Unspecified" }],
  ])("reports %s instead of using VoteResult or VoteValueId as a vote", async (_label, override) => {
    const { context } = mockContext(source([vote(override)]));
    const result = await legistarAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/schema error|unsupported vote/);
  });

  it.each([
    ["duplicate vote ID", vote({ VotePersonId: 2, VotePersonName: "Sam Lee" })],
    ["duplicate member ID", vote({ VoteId: 2, VotePersonName: "Sam Lee" })],
    ["conflicting full name", vote({ VoteId: 2, VotePersonId: 2, VotePersonName: " ALEX  RIVERA " })],
    ["wrong parent item", vote({ VoteId: 2, VotePersonId: 2, VotePersonName: "Sam Lee", VoteEventItemId: 888 })],
    ["unknown other member vote", vote({ VoteId: 2, VotePersonId: 2, VotePersonName: "Sam Lee", VoteValueName: "?" })],
  ])("rejects %s without an incorrect tally", async (_label, badVote) => {
    const { context } = mockContext(source([vote(), badVote]));
    expect(await legistarAdapter.collect(context, config)).toMatchObject({ status: "partial", actions: [] });
  });

  it("requires review when a configured member ID belongs to an unverified name", async () => {
    const { context } = mockContext(source([vote({ VotePersonName: "Jamie Rivera" })]));
    const result = await legistarAdapter.collect(context, { ...config, actorId: "227" });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/ID\/name mismatch/);
  });

  it("rejects conflicting configured and upstream member IDs before any source request", async () => {
    const { context, get } = mockContext(source(), { identifiers: { "legistar:example": "227" } });
    const result = await legistarAdapter.collect(context, { ...config, actorId: 228 });
    expect(result).toMatchObject({ status: "needs_review", actions: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects malformed upstream member IDs before any source request", async () => {
    const { context, get } = mockContext(source(), { identifiers: { "legistar:example": "wrong" } });
    expect(await legistarAdapter.collect(context, config)).toMatchObject({ status: "needs_review", actions: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it("enforces cutoff, lower boundary and body ID even if the server ignores its filter", async () => {
    const events = [
      event(), event({ EventId: 2, EventDate: "2026-11-01" }),
      event({ EventId: 3, EventDate: "2027-01-01" }), event({ EventId: 4, EventDate: "2025-12-31" }),
      event({ EventId: 5, EventBodyId: 999 }),
    ];
    const { context, urls } = mockContext(source([vote()], [item()], events));
    const result = await legistarAdapter.collect(context, { ...config, bodyId: 138 });
    expect(result.actions).toHaveLength(1);
    expect(result.status).toBe("partial");
    expect(result.reason).toMatch(/body ID mismatch/);
    expect(urls.filter((url) => url.pathname.endsWith("/eventitems"))).toHaveLength(1);
  });

  it("computes the full tally across vote pages and preserves page locators", async () => {
    const votes = [vote(), vote({ VoteId: 2, VotePersonId: 2, VotePersonName: "Sam Lee", VoteValueName: "No" }), vote({ VoteId: 3, VotePersonId: 3, VotePersonName: "Pat Smith", VoteValueName: "Recused" })];
    const { context, urls } = mockContext(source(votes));
    const result = await legistarAdapter.collect(context, { ...config, pageSize: 2 });
    expect(result.status).toBe("complete");
    expect(result.actions[0].margin).toEqual({ yes: 1, no: 1, recused: 1 });
    expect(urls.filter((url) => url.pathname.endsWith("/votes")).map((url) => url.searchParams.get("$skip"))).toEqual(["0", "2"]);
    expect(new Set(result.actions[0].provenance!.map((proof) => proof.snapshotId)).size).toBe(4);
  });

  it("withholds a margin when the votes pagination guard is reached", async () => {
    const { context } = mockContext(source([vote(), vote({ VoteId: 2, VotePersonId: 2, VotePersonName: "Sam Lee" })]));
    const result = await legistarAdapter.collect(context, { ...config, pageSize: 2, maxPages: 1 });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/maxPages=1/);
  });

  it("reports agendas-only/no structured votes as partial, never as no record", async () => {
    const { context } = mockContext(source([], [item({ EventItemActionName: null, EventItemActionText: null })]));
    const result = await legistarAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/agenda-only coverage cannot establish no record/);
  });

  it("never fabricates votes from unanimous text or applies a consent motion to other items", async () => {
    const items = [item(), item({ EventItemId: 77700, EventItemTitle: "Minutes", EventItemActionName: "Approved", EventItemActionText: "The minutes were approved on the consent agenda." })];
    const { context } = mockContext((url) => {
      if (url.pathname.endsWith("/events")) return [event()];
      if (url.pathname.endsWith("/eventitems")) return items;
      return url.pathname.includes("/77698/") ? [vote()] : [];
    });
    const result = await legistarAdapter.collect(context, config);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].title).toBe("Action on the Consent Agenda");
    expect(result.status).toBe("partial");
  });

  it.each([
    ["explicit flag", { EventItemConsent: 1, EventItemTitle: "Solar lighting", EventItemActionName: "Approved" }, true],
    ["explicit action", { EventItemConsent: 0, EventItemTitle: "Other Actions", EventItemActionName: "Adopt the Consent Agenda" }, true],
    ["unanimity", { EventItemConsent: 0, EventItemTitle: "Solar lighting", EventItemActionName: "Approved" }, undefined],
    ["pulled item", { EventItemConsent: 0, EventItemTitle: "Solar lighting", EventItemActionName: "Approved", EventItemActionText: "Pulled from the consent agenda. All voted yes." }, undefined],
  ])("sets consent only for %s", async (_label, overrides, consent) => {
    const { context } = mockContext(source([vote()], [item(overrides)]));
    const result = await legistarAdapter.collect(context, config);
    expect(result.actions[0].consent).toBe(consent);
  });

  it("keeps each motion event item distinct and uses stable per-member IDs", async () => {
    const { context } = mockContext((url) => {
      if (url.pathname.endsWith("/events")) return [event()];
      if (url.pathname.endsWith("/eventitems")) return [item({ EventItemActionName: "Amend" }), item({ EventItemId: 77700, EventItemActionName: "Final passage" })];
      const id = Number(url.pathname.split("/").at(-2));
      return [vote({ VoteEventItemId: id, VoteId: id })];
    });
    const result = await legistarAdapter.collect(context, config);
    const repeated = await legistarAdapter.collect(context, config);
    expect(result.actions).toHaveLength(2);
    expect(new Set(result.actions.map((action) => action.id)).size).toBe(2);
    expect(result.actions.map((action) => action.vote!.question).sort()).toEqual(["Amend", "Final passage"]);
    expect(result.actions.map((action) => action.id)).toEqual(repeated.actions.map((action) => action.id));
  });

  it("withholds ambiguous full-name fallback if separate items match different person IDs", async () => {
    const { context } = mockContext((url) => {
      if (url.pathname.endsWith("/events")) return [event()];
      if (url.pathname.endsWith("/eventitems")) return [item(), item({ EventItemId: 77700 })];
      const id = Number(url.pathname.split("/").at(-2));
      return [vote({ VoteEventItemId: id, VoteId: id, VotePersonId: id === 77698 ? 227 : 228 })];
    });
    const result = await legistarAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/different member IDs/);
  });

  it("fails closed on a foreign-origin continuation of vote rows", async () => {
    const { context, urls } = mockContext((url) => {
      if (url.pathname.endsWith("/events")) return [event()];
      if (url.pathname.endsWith("/eventitems")) return [item()];
      return { value: [vote()], "@odata.nextLink": "https://evil.example/votes" };
    });
    const result = await legistarAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/Unsafe OData nextLink/);
    expect(urls).toHaveLength(3);
  });

  it.each([
    ["wrong event relation", [item({ EventItemEventId: 99 })], [event()]],
    ["duplicate items", [item(), item()], [event()]],
    ["duplicate events", [item()], [event(), event()]],
  ])("rejects %s", async (_label, items, events) => {
    const { context } = mockContext(source([vote()], items, events));
    expect(await legistarAdapter.collect(context, config)).toMatchObject({ status: "partial", actions: [] });
  });
});
