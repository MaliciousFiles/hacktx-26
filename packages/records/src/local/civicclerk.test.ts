import { describe, expect, it } from "vitest";
import { civicClerkAdapter } from "./index";
import { mockContext, offsetPage } from "./test-helpers";

const config = { baseUrl: "https://county.api.civicclerk.com/v1", role: "County Commissioner" };
function event(overrides: Record<string, unknown> = {}) {
  return { id: 3709, startDateTime: "2026-10-06T09:00:00Z", eventDate: "2026-10-06T09:00:00Z", agendaId: 2331, categoryName: "Commissioners Court", ...overrides };
}
function motion(overrides: Record<string, unknown> = {}) {
  return { motionName: "Approve Item", initiatedBy: "Sam Lee", secondedBy: "Pat Smith", passFail: 1, yesVotes: ["Alex Rivera", "Sam Lee"], noVotes: ["Jamie Rivera"], abstainVotes: [], ...overrides };
}
function item(overrides: Record<string, unknown> = {}) {
  return { id: 37971, agendaObjectItemName: "Public hearing", agendaObjectItemDescription: "Source description", minutesItemVotes: [motion()], childItems: [], ...overrides };
}
function source(meeting: unknown, events: unknown[] = [event()]) {
  return (url: URL) => url.pathname.endsWith("/Events") ? { value: offsetPage(events, url) } : meeting;
}

describe("civicclerk", () => {
  it("preserves nested items, separate motions, explicit consent and source JSON pointers", async () => {
    const meeting = { id: 2331, items: [item({
      id: 10, agendaObjectItemName: "Consent Motion",
      childItems: [
        item({ id: 11, agendaObjectItemName: "Consent child", minutesItemVotes: [] }),
        item({ id: 12, agendaObjectItemDescription: "Opaque <br> markup", minutesItemVotes: [
          motion({ motionName: "Open the Public Hearing.", yesVotes: ["Sam Lee"], noVotes: ["Alex Rivera", "Jamie Rivera"], abstainVotes: ["Pat Smith"] }),
          motion({ motionName: "Close the Public Hearing.", yesVotes: ["Sam Lee", "Jamie Rivera"], noVotes: [], abstainVotes: ["Alex Rivera"] }),
        ] }),
      ],
    })] };
    const { context } = mockContext(source(meeting));
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(3);
    expect(new Set(result.actions.map((action) => action.id)).size).toBe(3);
    const consent = result.actions.find((action) => action.title === "Consent Motion")!;
    expect(consent.consent).toBe(true);
    expect(consent.margin).toEqual({ yes: 2, no: 1, abstain: 0 });
    const opened = result.actions.find((action) => action.vote!.question.startsWith("Open"))!;
    expect(opened).toMatchObject({ stance: "no", margin: { yes: 1, no: 2, abstain: 1 }, vote: { value: "no", raw: "noVotes: Alex Rivera" } });
    expect(opened.consent).toBeUndefined();
    expect(opened.officialText).toContain("Opaque <br> markup");
    expect(opened.provenance!.map((proof) => proof.locator)).toContain("/items/0/childItems/1/minutesItemVotes/0");
    expect(result.actions.some((action) => action.title === "Consent child")).toBe(false);
    expect(result.actions.find((action) => action.vote!.question.startsWith("Close"))!.stance).toBe("abstain");
    expect(result.reason).toMatch(/government-designated/);
  });

  it("does not infer absence from a missing name, motion initiator, or surname match", async () => {
    const { context } = mockContext(source({ items: [item({ minutesItemVotes: [motion({ initiatedBy: "Alex Rivera", yesVotes: ["Jamie Rivera"], noVotes: [], abstainVotes: [] })] })] }));
    const result = await civicClerkAdapter.collect(context, config);
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toMatch(/unknown, not absent/);
  });

  it("uses only verified full-name aliases", async () => {
    const meeting = { items: [item({ minutesItemVotes: [motion({ yesVotes: ['Alex "Al" Rivera'], noVotes: [] })] })] };
    const { context } = mockContext(source(meeting), { aliases: ['Alex "Al" Rivera'] });
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.actions[0].vote!.raw).toBe('yesVotes: Alex "Al" Rivera');
    expect(result.status).toBe("complete");
  });

  it("retains exact source names in raw vote evidence while normalizing only identity comparison", async () => {
    const { context } = mockContext(source({ items: [item({ minutesItemVotes: [motion({ yesVotes: ["  ALEX   RIVERA  "], noVotes: [] })] })] }));
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.status).toBe("complete");
    expect(result.actions[0].vote!.raw).toBe("yesVotes:   ALEX   RIVERA  ");
  });

  it.each([
    ["a missing array", motion({ noVotes: undefined })],
    ["a null array", motion({ abstainVotes: null })],
    ["duplicate names", motion({ yesVotes: ["Alex Rivera", " ALEX   RIVERA "] })],
    ["conflicting vote arrays", motion({ noVotes: ["Alex Rivera"] })],
    ["an invalid array value", motion({ yesVotes: [42] })],
  ])("rejects %s instead of publishing an incomplete/conflicting margin", async (_label, badMotion) => {
    const { context } = mockContext(source({ items: [item({ minutesItemVotes: [badMotion] })] }));
    expect(await civicClerkAdapter.collect(context, config)).toMatchObject({ status: "partial", actions: [] });
  });

  it("rejects multiple verified aliases on distinct member rows", async () => {
    const { context } = mockContext(source({ items: [item({ minutesItemVotes: [motion({ yesVotes: ["Alex Rivera", "Alex Al Rivera"] })] })] }), { aliases: ["Alex Al Rivera"] });
    expect(await civicClerkAdapter.collect(context, config)).toMatchObject({ status: "partial", actions: [] });
  });

  it("requests the explicit interval and never fetches meetings on/after cutoff or before since", async () => {
    const events = [
      event(), event({ id: 2, agendaId: 2, startDateTime: "2026-11-01", eventDate: "2026-11-01" }),
      event({ id: 3, agendaId: 3, startDateTime: "2027-01-01", eventDate: "2027-01-01" }),
      event({ id: 4, agendaId: 4, startDateTime: "2025-12-31", eventDate: "2025-12-31" }),
    ];
    const { context, urls } = mockContext(source({ id: 2331, items: [item()] }, events));
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.actions).toHaveLength(1);
    expect(urls.filter((url) => url.pathname.includes("/Meetings/"))).toHaveLength(1);
    expect(urls[0].searchParams.get("$filter")).toBe("startDateTime ge 2026-01-01T00:00:00Z and startDateTime lt 2026-11-01T00:00:00Z");
    expect(urls[0].searchParams.get("$orderby")).toBe("startDateTime,id");
  });

  it("follows same-collection OData nextLink even on a short page, preserving scope", async () => {
    const { context, urls } = mockContext((url) => {
      if (!url.pathname.endsWith("/Events")) return { items: [item()] };
      return url.searchParams.has("$skiptoken")
        ? { value: [event({ id: 3710, agendaId: 2332 })] }
        : { value: [event()], "@odata.nextLink": "?$skiptoken=second" };
    });
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(2);
    const requests = urls.filter((url) => url.pathname.endsWith("/Events"));
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get("$filter")).toBe(requests[0].searchParams.get("$filter"));
  });

  it.each([
    "https://evil.example/Events?$skip=100",
    "https://county.api.civicclerk.com/v1/Meetings?$skip=100",
    "https://user:password@county.api.civicclerk.com/v1/Events?$skip=100",
  ])("fails closed on unsafe continuation %s", async (nextLink) => {
    const { context, urls } = mockContext((url) => url.pathname.endsWith("/Events")
      ? { value: [event()], "@odata.nextLink": nextLink } : { items: [item()] });
    const result = await civicClerkAdapter.collect(context, config);
    expect(result.status).toBe("partial");
    expect(result.reason).toMatch(/Unsafe OData nextLink/);
    expect(urls.filter((url) => url.pathname.endsWith("/Events"))).toHaveLength(1);
    expect(urls.every((url) => url.hostname === "county.api.civicclerk.com" && !url.username)).toBe(true);
  });

  it("uses top/skip pagination and reports the guard without losing fully sourced motions", async () => {
    const { context, urls } = mockContext(source({ items: [item()] }, [event(), event({ id: 2, agendaId: 2 })]));
    const result = await civicClerkAdapter.collect(context, { ...config, pageSize: 1, maxPages: 1 });
    expect(result.status).toBe("partial");
    expect(result.reason).toMatch(/maxPages=1/);
    expect(result.actions).toHaveLength(1);
    expect(urls[0].searchParams.get("$top")).toBe("1");
    expect(urls[0].searchParams.get("$skip")).toBe("0");
  });

  it.each([
    ["unpublished agenda", [event({ agendaId: 0 })], { items: [] }],
    ["missing minutes", [event()], { items: [item({ minutesItemVotes: [] })] }],
    ["wrong meeting ID", [event()], { id: 999, items: [item()] }],
    ["duplicate events", [event(), event()], { items: [item()] }],
    ["duplicate item IDs", [event()], { items: [item(), item()] }],
    ["mismatched dates", [event({ eventDate: "2026-10-07" })], { items: [item()] }],
  ])("reports %s as partial, not a complete empty record", async (_label, events, meeting) => {
    const { context } = mockContext(source(meeting, events));
    expect(await civicClerkAdapter.collect(context, config)).toMatchObject({ status: "partial", actions: [] });
  });
});
