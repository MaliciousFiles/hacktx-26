import { describe, expect, it, vi } from "vitest";
import type { AdapterContext } from "../adapters";
import { SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import { parseTloBillHistory, tloBillHistoryAdapter, tloBillHistoryUrl } from "./index";
import type { TloBillHistoryConfig } from "./index";

// All fixtures in this file are SYNTHETIC. Their structure/codes are based on
// the verified 89(R) HB 2 XML; invented names/events are not real official acts.
const sourceUrl =
  "ftp://ftp.legis.state.tx.us/bills/89R/billhistory/house_bills/HB00001_HB00099/HB%202.xml";
const crosswalkUrl = "https://house.texas.gov/members/89/session-roster";
const candidateId = "synthetic-candidate";
const tenure = {
  candidateId,
  start: "2015-01-20",
  sourceUrl: "https://gov.texas.gov/governor/biography",
};

function event(code = "H001", date = "2/20/2025", description = "Filed", comment = ""): string {
  return `<action><actionNumber>${code}</actionNumber><date>${date}</date><description>${description}</description><comment>${comment}</comment><actionTimestamp/></action>`;
}

function xml(
  options: {
    bill?: string;
    authors?: string;
    coauthors?: string;
    sponsors?: string;
    cosponsors?: string;
    events?: string;
    committees?: string;
  } = {},
): string {
  return `<billhistory bill="${options.bill ?? "89(R) HB 2"}" lastUpdate="6/23/2025 2:00:05 AM" source="Synthetic test source">
  <caption version="Enrolled">Future enrolled-only caption &amp; context.</caption>
  <authors>${options.authors ?? "John Smith | Jane Doe"}</authors>
  <coauthors>${options.coauthors ?? "Alice Brown"}</coauthors>
  <sponsors>${options.sponsors ?? "Chris Green"}</sponsors>
  <cosponsors>${options.cosponsors ?? "Pat Blue"}</cosponsors>
  <subjects><subject>Education (I0001)</subject></subjects>
  <committees>${options.committees ?? '<house name="Education" status="Out of committee" ayeVotes="13" nayVotes="2" presentNotVotingVotes="0" absentVotes="0"/>'}</committees>
  <actions>${options.events ?? event() + event("H630", "4/17/2025", "Record vote", "RV#303") + event("E020", "6/20/2025", "Signed by the Governor")}</actions>
  <billtext><docTypes><bill><versions><version><WebHTMLURL>https://capitol.texas.gov/example.htm</WebHTMLURL><WebPDFURL>https://capitol.texas.gov/example.pdf</WebPDFURL></version></versions></bill></docTypes></billtext>
  </billhistory>`;
}

function setup(text = xml(), candidate = "John Smith", url = sourceUrl) {
  const snapshot: Snapshot = {
    id: "synthetic-snapshot",
    sourceUrl: url,
    contentHash: "a".repeat(64),
    fetchedAt: "2026-10-24T00:00:00.000Z",
    format: "xml",
    text,
  };
  const client = new SnapshotClient({ directory: "unused-synthetic-cache", mode: "offline" });
  const get = vi.spyOn(client, "get").mockResolvedValue(snapshot);
  const context: AdapterContext = {
    request: {
      candidate: { id: candidateId, name: candidate },
      position: { office: "tx_house", jurisdiction: "texas", district: "1" },
      month: 11,
      year: 2026,
    },
    window: { since: "1789-01-01", before: "2026-11-01" },
    client,
  };
  const config: TloBillHistoryConfig = { urls: [url], role: "TX House D1" };
  return { context, config, get, snapshot };
}

describe("tloBillHistoryUrl", () => {
  it("builds the verified HB 2 URL with an encoded space, not a padded filename", () => {
    expect(tloBillHistoryUrl("89R", "HB", 2)).toBe(sourceUrl);
  });

  it.each([
    [1, "HB00001_HB00099"],
    [99, "HB00001_HB00099"],
    [100, "HB00100_HB00199"],
    [199, "HB00100_HB00199"],
    [200, "HB00200_HB00299"],
    [99999, "HB99900_HB99999"],
  ])("uses the correct 1..99/100..199 range for bill %i", (number, range) => {
    expect(tloBillHistoryUrl("89R", "HB", number)).toContain(`/${range}/HB%20${number}.xml`);
  });

  it.each([
    ["HB", "house_bills"],
    ["SB", "senate_bills"],
    ["HJR", "house_joint_resolutions"],
    ["SJR", "senate_joint_resolutions"],
    ["HCR", "house_concurrent_resolutions"],
    ["SCR", "senate_concurrent_resolutions"],
    ["HR", "house_resolutions"],
    ["SR", "senate_resolutions"],
  ])("supports %s", (prefix, directory) => {
    expect(tloBillHistoryUrl("891", prefix, 12)).toBe(
      `ftp://ftp.legis.state.tx.us/bills/891/billhistory/${directory}/${prefix}00001_${prefix}00099/${prefix}%2012.xml`,
    );
  });

  it.each(["71R", "711", "89R", "891", "896", "100R", "1001"])(
    "accepts archive session %s",
    (session) => {
      expect(tloBillHistoryUrl(session, "SB", 1)).toContain(`/bills/${session}/`);
    },
  );

  it.each(["70R", "1R", "89", "89S1", "89(R)", "890", "89r", "089R", "89R/../891"])(
    "rejects invalid session %s",
    (session) => {
      expect(() => tloBillHistoryUrl(session, "HB", 1)).toThrow();
    },
  );

  it.each(["B", "hb", "HBR", "HB/../SB", ""])("rejects invalid prefix %s", (prefix) => {
    expect(() => tloBillHistoryUrl("89R", prefix, 1)).toThrow();
  });

  it.each([0, -1, 1.5, NaN, Infinity, 100000])("rejects invalid bill number %s", (number) => {
    expect(() => tloBillHistoryUrl("89R", "HB", number)).toThrow();
  });
});

describe("parseTloBillHistory (synthetic structured XML)", () => {
  it("retains affiliations without dates, committee totals, and journal lookup references", () => {
    const bill = parseTloBillHistory(xml());
    expect(bill).toMatchObject({ session: "89R", billType: "HB", billNumber: 2, chamber: "house" });
    expect(bill.affiliations.map((item) => [item.kind, item.name])).toEqual([
      ["primary_author", "John Smith"],
      ["joint_author", "Jane Doe"],
      ["coauthor", "Alice Brown"],
      ["primary_sponsor", "Chris Green"],
      ["cosponsor", "Pat Blue"],
    ]);
    expect(bill.affiliations.every((item) => !("date" in item))).toBe(true);
    expect(bill.committees).toEqual([
      {
        chamber: "house",
        name: "Education",
        status: "Out of committee",
        subcommitteeName: undefined,
        subcommitteeStatus: undefined,
        votes: { yes: 13, no: 2, presentNotVoting: 0, absent: 0 },
        locator: "/billhistory/committees/house[1]",
      },
    ]);
    expect(bill.voteReferences).toMatchObject([
      {
        actionCode: "H630",
        date: "2025-04-17",
        rollCallNumber: "303",
        kind: "record_vote",
        comment: "RV#303",
        locator: "/billhistory/actions/action[2]",
      },
    ]);
    expect(bill.caption).toEqual({
      text: "Future enrolled-only caption & context.",
      version: "Enrolled",
      locator: "/billhistory/caption",
    });
    expect(bill.subjects).toEqual(["Education (I0001)"]);
    expect(bill).not.toHaveProperty("party");
  });

  it("does not collapse distinct same-day roll calls, lose leading zeroes, or infer Senate votes", () => {
    const bill = parseTloBillHistory(
      xml({
        events:
          event("H630", "4/16/2025", "Record vote", "RV#003") +
          event("H630", "4/16/2025", "Record vote", "RV#004") +
          event("S626", "5/22/2025", "Vote recorded in Journal") +
          event("S626", "5/22/2025", "Vote recorded in Journal"),
      }),
    );
    expect(bill.actions).toHaveLength(4);
    expect(bill.voteReferences.map((item) => item.rollCallNumber)).toEqual([
      "003",
      "004",
      undefined,
      undefined,
    ]);
    expect(bill.voteReferences[2].kind).toBe("journal_vote");
    expect(bill.voteReferences[2]).not.toHaveProperty("vote");
  });

  it("handles empty sections, repeated committees, and missing vote counts without inventing zeroes", () => {
    const bill = parseTloBillHistory(
      xml({
        authors: "",
        coauthors: "",
        sponsors: "",
        cosponsors: "",
        events: "",
        committees: '<house/><senate name="One" ayeVotes=""/><senate name="Two" nayVotes="1"/>',
      }),
    );
    expect(bill.affiliations).toEqual([]);
    expect(bill.actions).toEqual([]);
    expect(bill.committees.map((item) => item.votes)).toEqual([{}, { no: 1 }]);
  });

  it("accepts BOM/declaration and valid leap days without changing original text", () => {
    const original = `\uFEFF<?xml version="1.0" encoding="utf-8"?>${xml({ events: event("H001", "2/29/2024") })}`;
    expect(parseTloBillHistory(original).actions[0].date).toBe("2024-02-29");
    expect(original.startsWith("\uFEFF<?xml")).toBe(true);
  });

  it.each([
    "2/29/2025",
    "2/30/2024",
    "13/1/2025",
    "1/32/2025",
    "0/1/2025",
    "1/0/2025",
    "",
    "2025-02-20",
  ])("rejects invalid date %s", (date) => {
    expect(() => parseTloBillHistory(xml({ events: event("H001", date) }))).toThrow();
  });

  it("does not substitute a timestamp when the action date is missing", () => {
    expect(() =>
      parseTloBillHistory(
        xml({
          events:
            "<action><actionNumber>H001</actionNumber><description>Filed</description><actionTimestamp>2/20/2025 1:00 PM</actionTimestamp></action>",
        }),
      ),
    ).toThrow();
  });

  it.each([
    "<html><body>Access denied</body></html>",
    "<billhistory>",
    "<error/>",
    '<!DOCTYPE billhistory [<!ENTITY bad "expansion">]><billhistory bill="89(R) HB 2"/>',
  ])("rejects malformed/non-history/entity-declaring XML", (text) => {
    expect(() => parseTloBillHistory(text)).toThrow();
  });

  it("rejects invalid committee totals and invalid bill IDs", () => {
    expect(() =>
      parseTloBillHistory(xml({ committees: '<house name="One" ayeVotes="-1"/>' })),
    ).toThrow();
    expect(() => parseTloBillHistory(xml({ bill: "89(S1) HB 2" }))).toThrow();
  });
});

describe("tloBillHistoryAdapter attribution (synthetic records)", () => {
  it("attributes only a dated primary-author filing, never committee totals or roll-call references", async () => {
    const { context, config, get, snapshot } = setup();
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(get).toHaveBeenCalledExactlyOnceWith(sourceUrl, { format: "xml", root: "billhistory" });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      actorId: context.request.candidate.id,
      type: "authored",
      stance: "author",
      date: "2025-02-20",
      extraction: "xml",
      role: "TX House D1",
      issueIds: [],
      attribution: { method: "named_record", sourceActorId: "John Smith" },
      provenance: [
        {
          snapshotId: snapshot.id,
          contentHash: snapshot.contentHash,
          sourceUrl,
          adapter: "tlo-billhistory@1",
          locator: "/billhistory/actions/action[1]",
        },
        { locator: "/billhistory/authors" },
      ],
    });
    expect(result.actions[0]).not.toHaveProperty("vote");
    expect(result.actions[0]).not.toHaveProperty("margin");
    expect(result.actions[0].officialText).toBe("Filed\nJohn Smith");
    expect(result.actions[0].officialText).not.toContain("enrolled");
    expect(result.actions[0].title).not.toContain("enrolled");
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("no individual votes");
    expect(result.bills[0].bill.committees[0].votes).toEqual({
      yes: 13,
      no: 2,
      presentNotVoting: 0,
      absent: 0,
    });
    expect(result.bills[0].bill.voteReferences).toHaveLength(1);
    expect(snapshot.text).toBe(xml());
  });

  it("does not match a full candidate name by surname without verified evidence", async () => {
    const { context, config } = setup(xml({ authors: "Smith | Doe" }));
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
    const result = await tloBillHistoryAdapter.collect(context, { ...config, memberName: "Smith" });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(result.reason).toContain("memberIdentitySourceUrl");
    expect(result.bills).toHaveLength(1);
  });

  it("accepts an upstream-verified surname crosswalk and preserves its official URL", async () => {
    const { context, config } = setup(xml({ authors: "Smith | Doe" }));
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      memberName: "Smith",
      memberCandidateId: context.request.candidate.id,
      memberIdentitySourceUrl: crosswalkUrl,
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].attribution).toEqual({
      method: "named_record",
      sourceActorId: "Smith",
    });
    expect(result.memberIdentity).toEqual({
      candidateId: context.request.candidate.id,
      memberName: "Smith",
      sourceUrl: crosswalkUrl,
    });
  });

  it.each([undefined, "another-candidate", "synthetic-candidate-extra", "SYNTHETIC-CANDIDATE"])(
    "rejects an official abbreviated-name assertion without matching candidate binding %s",
    async (memberCandidateId) => {
      const { context, config } = setup(xml({ authors: "Smith | Doe" }));
      const result = await tloBillHistoryAdapter.collect(context, {
        ...config,
        memberName: "Smith",
        memberCandidateId,
        memberIdentitySourceUrl: crosswalkUrl,
      });
      expect(result.actions).toEqual([]);
      expect(result.memberIdentity).toBeUndefined();
      expect(result.status).toBe("needs_review");
      expect(result.reason).toContain("memberCandidateId matching the request candidate ID");
      expect(result.bills).toHaveLength(1);
    },
  );

  it.each(["John Smith", "Jane Smith", "Chris Green"])(
    "never reuses a bound abbreviated-name config for another candidate ID (%s)",
    async (name) => {
      const { context, config } = setup(xml({ authors: "Smith | Doe" }));
      const boundConfig: TloBillHistoryConfig = {
        ...config,
        memberName: "Smith",
        memberCandidateId: context.request.candidate.id,
        memberIdentitySourceUrl: crosswalkUrl,
      };
      expect((await tloBillHistoryAdapter.collect(context, boundConfig)).actions).toHaveLength(1);
      const otherContext: AdapterContext = {
        ...context,
        request: { ...context.request, candidate: { id: "another-candidate", name } },
      };
      const result = await tloBillHistoryAdapter.collect(otherContext, boundConfig);
      expect(result.actions).toEqual([]);
      expect(result.memberIdentity).toBeUndefined();
      expect(result.status).toBe("needs_review");
    },
  );

  it("does not accept candidate binding in place of an official identity evidence URL", async () => {
    const { context, config } = setup(xml({ authors: "Smith" }));
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      memberName: "Smith",
      memberCandidateId: context.request.candidate.id,
    });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(result.memberIdentity).toBeUndefined();
  });

  it.each([undefined, "another-candidate"])(
    "allows natural exact full-name XML attribution despite an unverified mapping bound to %s",
    async (memberCandidateId) => {
      const { context, config } = setup();
      const result = await tloBillHistoryAdapter.collect(context, {
        ...config,
        memberName: "Smith",
        memberCandidateId,
        memberIdentitySourceUrl: crosswalkUrl,
      });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].attribution).toEqual({
        method: "named_record",
        sourceActorId: "John Smith",
      });
      expect(result.memberIdentity).toBeUndefined();
      expect(result.status).toBe("needs_review");
    },
  );

  it.each(["", " "])("rejects a blank memberCandidateId %j", async (memberCandidateId) => {
    const { context, config, get } = setup(xml({ authors: "Smith" }));
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      memberName: "Smith",
      memberCandidateId,
      memberIdentitySourceUrl: crosswalkUrl,
    });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(get).not.toHaveBeenCalled();
  });

  it("allows exact full names without a crosswalk, including verified full-name aliases", async () => {
    const { context, config } = setup();
    expect(
      (await tloBillHistoryAdapter.collect(context, { ...config, memberName: "John Smith" }))
        .actions,
    ).toHaveLength(1);
    context.request.candidate.name = "John A. Smith";
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
    context.request.candidate.aliases = ["John Smith"];
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toHaveLength(1);
  });

  it("does not treat surname aliases or surname-only candidate input as full names", async () => {
    const { context, config } = setup(xml({ authors: "Smith" }), "John Smith");
    context.request.candidate.aliases = ["Smith"];
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
    context.request.candidate.name = "Smith";
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
  });

  it.each([
    "https://example.com/roster",
    "https://house.texas.gov.evil.invalid/roster",
    "https://user:password@house.texas.gov/roster",
    "javascript:alert(1)",
  ])("rejects nonofficial identity evidence %s", async (url) => {
    const { context, config, get } = setup(xml({ authors: "Smith" }));
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      memberName: "Smith",
      memberCandidateId: context.request.candidate.id,
      memberIdentitySourceUrl: url,
    });
    expect(result.status).toBe("needs_review");
    expect(result.actions).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["Jane Doe", "Alice Brown", "Chris Green", "Pat Blue"])(
    "never assigns filing date to joint/coauthor/sponsor/cosponsor %s",
    async (name) => {
      const { context, config } = setup(xml(), name);
      const result = await tloBillHistoryAdapter.collect(context, config);
      expect(result.actions).toEqual([]);
      expect(result.reason).toContain("no join dates are inferred");
      expect(result.bills[0].bill.affiliations.some((item) => item.name === name)).toBe(true);
    },
  );

  it("does not infer dates from a nameless coauthor/co-sponsor authorization event", async () => {
    const { context, config } = setup(
      xml({
        events:
          event() +
          event("S833", "5/22/2025", "Co-sponsor authorized") +
          event("H999", "3/1/2025", "Coauthor added"),
      }),
      "Alice Brown",
    );
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("partial");
  });

  it("retains named affiliation-addition events without claiming an implemented attribution rule", async () => {
    const { context, config } = setup(
      xml({ events: event("S833", "5/22/2025", "Co-sponsor authorized", "Pat Blue") }),
      "Pat Blue",
    );
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(result.actions).toEqual([]);
    expect(result.bills[0].bill.actions[0]).toMatchObject({
      date: "2025-05-22",
      comment: "Pat Blue",
    });
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("retained but not attributed");
  });

  it("does not call the House sponsor of a Senate bill its author", async () => {
    const url = tloBillHistoryUrl("89R", "SB", 2);
    const { context, config } = setup(
      xml({
        bill: "89(R) SB 2",
        authors: "Chris Green",
        sponsors: "John Smith",
        events: event("S001"),
      }),
      "John Smith",
      url,
    );
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
  });

  it("does not invent a filing date if no dated Filed action exists", async () => {
    const { context, config } = setup(
      xml({ events: event("H005", "2/25/2025", "Read first time") }),
    );
    expect((await tloBillHistoryAdapter.collect(context, config)).actions).toEqual([]);
  });

  it("filters by since inclusive / before exclusive and never backdates the latest caption", async () => {
    const { context, config } = setup(
      xml({
        events:
          event("H001", "2/19/2025") +
          event("H001", "2/20/2025") +
          event("H001", "3/1/2025") +
          event("H001", "3/2/2025"),
      }),
    );
    context.window = { since: "2025-02-20", before: "2025-03-01" };
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(result.actions.map((action) => action.date)).toEqual(["2025-02-20"]);
    expect(result.actions[0].officialText).toBe("Filed\nJohn Smith");
    // Parsed context is deliberately not filtered or represented as dated evidence.
    expect(result.bills[0].bill.actions).toHaveLength(4);
    expect(result.bills[0].bill.caption?.version).toBe("Enrolled");
  });

  it("deduplicates identical attributed events and repeated configured URLs while preserving XML locators", async () => {
    const { context, config, get } = setup(xml({ events: event() + event() }));
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      urls: [sourceUrl, sourceUrl],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].provenance?.[0].locator).toBe("/billhistory/actions/action[1]");
    expect(result.reason).toContain("1 duplicate attributed event");
    expect(result.bills[0].bill.actions).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("uses stable IDs across snapshot refreshes, distinct across sessions/bills/dates/codes/actors", async () => {
    const first = setup(xml({ events: event() }));
    const id = (await tloBillHistoryAdapter.collect(first.context, first.config)).actions[0].id;
    first.snapshot.id = "refreshed-snapshot";
    first.snapshot.contentHash = "b".repeat(64);
    expect((await tloBillHistoryAdapter.collect(first.context, first.config)).actions[0].id).toBe(
      id,
    );
    const ids = [id];
    for (const [bill, url, events] of [
      ["89(1) HB 2", tloBillHistoryUrl("891", "HB", 2), event()],
      ["89(R) HB 3", tloBillHistoryUrl("89R", "HB", 3), event()],
      ["89(R) HB 2", sourceUrl, event("H001", "2/21/2025")],
      ["89(R) HB 2", sourceUrl, event("H002")],
    ]) {
      const other = setup(xml({ bill, events }), "John Smith", url);
      ids.push((await tloBillHistoryAdapter.collect(other.context, other.config)).actions[0].id);
    }
    first.context.request.candidate.id = "another-candidate-id";
    ids.push((await tloBillHistoryAdapter.collect(first.context, first.config)).actions[0].id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Governor attribution (synthetic records)", () => {
  it("requires verified tenure instead of assigning all sessions to a current Governor", async () => {
    const { context, config, get } = setup();
    const result = await tloBillHistoryAdapter.collect(context, { ...config, role: "TX Governor" });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(result.reason).toContain("governorTenure");
    expect(get).not.toHaveBeenCalled();
  });

  it("attributes only verified E020 Governor signatures, not chamber signatures, veto guesses, or text alone", async () => {
    const { context, config } = setup(
      xml({
        events:
          event() +
          event("H850", "6/1/2025", "Signed in the House") +
          event("S850", "6/1/2025", "Signed in the Senate") +
          event("E015", "6/2/2025", "Sent to the Governor") +
          event("E020", "6/20/2025", "Signed by the Governor") +
          event("E999", "6/20/2025", "Signed by the Governor") +
          event("E020", "6/21/2025", "Sent to the Governor") +
          event("E999", "6/22/2025", "Vetoed by the Governor"),
      }),
    );
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      role: "TX Governor",
      governorTenure: tenure,
    });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "signed",
      stance: "n/a",
      date: "2025-06-20",
      body: "Texas Governor",
      officialText: "Signed by the Governor",
      attribution: {
        method: "office_tenure",
        tenure: { start: tenure.start, sourceUrl: tenure.sourceUrl },
      },
      provenance: [{ locator: "/billhistory/actions/action[5]" }],
    });
    expect(result.actions[0]).not.toHaveProperty("margin");
    expect(result.actions[0]).not.toHaveProperty("vote");
    expect(result.actions[0].attribution?.tenure).toStrictEqual({
      start: tenure.start,
      end: undefined,
      sourceUrl: tenure.sourceUrl,
    });
    expect(result.actions[0].attribution?.tenure).not.toHaveProperty("candidateId");
    expect(result.reason).toContain("vetoes require a verified source sample");
  });

  it.each([
    ["2025-06-21", undefined, 0],
    ["2015-01-20", "2025-06-19", 0],
    ["2025-06-20", "2025-06-20", 1],
    ["2015-01-20", undefined, 1],
  ])("honors inclusive tenure boundaries %s..%s", async (start, end, count) => {
    const { context, config } = setup();
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      role: "Governor of Texas",
      governorTenure: { ...tenure, start, end },
    });
    expect(result.actions).toHaveLength(count);
    if (count) {
      expect(result.actions[0].attribution?.tenure).toStrictEqual({
        start,
        end,
        sourceUrl: tenure.sourceUrl,
      });
    }
  });

  it.each([undefined, "", " "])("requires a nonempty tenure candidateId %j", async (boundId) => {
    const { context, config, get } = setup();
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      role: "TX Governor",
      governorTenure: { ...tenure, candidateId: boundId },
    });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["John Smith", "Jane Smith"])(
    "never reuses a Governor tenure config for another candidate ID (%s)",
    async (name) => {
      const { context, config, get } = setup();
      const boundConfig: TloBillHistoryConfig = {
        ...config,
        role: "TX Governor",
        governorTenure: tenure,
      };
      expect((await tloBillHistoryAdapter.collect(context, boundConfig)).actions).toHaveLength(1);
      const otherContext: AdapterContext = {
        ...context,
        request: { ...context.request, candidate: { id: "another-candidate", name } },
      };
      const result = await tloBillHistoryAdapter.collect(otherContext, boundConfig);
      expect(result.actions).toEqual([]);
      expect(result.status).toBe("needs_review");
      expect(result.reason).toContain("governorTenure.candidateId must match");
      expect(get).toHaveBeenCalledTimes(1);
    },
  );

  it("applies the request cutoff to Governor signatures too", async () => {
    const { context, config } = setup();
    context.window.before = "2025-06-20";
    expect(
      (
        await tloBillHistoryAdapter.collect(context, {
          ...config,
          role: "TX Governor",
          governorTenure: tenure,
        })
      ).actions,
    ).toEqual([]);
  });

  it("does not attach old sessions' Governor signatures to a later tenure", async () => {
    const { context, config, get, snapshot } = setup();
    const oldUrl = tloBillHistoryUrl("71R", "HB", 2);
    get.mockImplementation(async (url) =>
      url === oldUrl
        ? {
            ...snapshot,
            sourceUrl: oldUrl,
            text: xml({
              bill: "71(R) HB 2",
              events: event("E020", "6/20/1989", "Signed by the Governor"),
            }),
          }
        : snapshot,
    );
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      urls: [oldUrl, sourceUrl],
      role: "TX Governor",
      governorTenure: tenure,
    });
    expect(result.bills).toHaveLength(2);
    expect(result.actions.map((action) => action.date)).toEqual(["2025-06-20"]);
  });

  it("never treats the Lieutenant Governor as Governor", async () => {
    const { context, config } = setup();
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      role: "TX Lt. Governor",
    });
    expect(result.actions.some((action) => action.type === "signed")).toBe(false);
    expect(
      (
        await tloBillHistoryAdapter.collect(context, {
          ...config,
          role: "Texas Lieutenant Governor",
          governorTenure: tenure,
        })
      ).status,
    ).toBe("needs_review");
  });

  it("allows a Governor candidate's prior legislative role without assuming executive attribution", async () => {
    const { context, config } = setup();
    context.request.position.office = "tx_governor";
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(result.actions.map((action) => action.type)).toEqual(["authored"]);
  });

  it.each([
    { ...tenure, start: "2025-02-29" },
    { ...tenure, start: "2025-06-20", end: "2025-06-19" },
    { ...tenure, sourceUrl: "https://example.com/tenure" },
    { candidateId, start: tenure.start },
  ])("rejects invalid or unsourced tenure", async (governorTenure) => {
    const { context, config, get } = setup();
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      role: "TX Governor",
      governorTenure,
    });
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("TLO source failures (synthetic snapshots)", () => {
  it.each([
    "https://example.com/bill.xml",
    sourceUrl.replace(".xml", ".pdf"),
    sourceUrl.replace(".xml", ".html"),
    sourceUrl.replace("HB00001_HB00099", "HB00000_HB00099"),
    `${sourceUrl}?token=secret`,
  ])("does not fetch unsupported/noncanonical sources %s", async (url) => {
    const { context, config, get } = setup();
    const result = await tloBillHistoryAdapter.collect(context, { ...config, urls: [url] });
    expect(result.status).toBe("needs_review");
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects URL/XML identity mismatches rather than attributing a different bill", async () => {
    const { context, config } = setup(xml({ bill: "89(R) HB 3" }));
    const result = await tloBillHistoryAdapter.collect(context, config);
    expect(result.actions).toEqual([]);
    expect(result.bills).toEqual([]);
    expect(result.status).toBe("unavailable");
  });

  it("does not attribute invalid source dates or malformed XML", async () => {
    for (const text of [xml({ events: event("H001", "2/30/2025") }), "<html/>"]) {
      const { context, config } = setup(text);
      const result = await tloBillHistoryAdapter.collect(context, config);
      expect(result.actions).toEqual([]);
      expect(result.status).toBe("unavailable");
    }
  });

  it("keeps successful explicit sources when another source fails", async () => {
    const { context, config, get, snapshot } = setup();
    const missingUrl = tloBillHistoryUrl("89R", "HB", 3);
    get.mockImplementation(async (url) => {
      if (url === missingUrl) throw new Error("Synthetic missing XML");
      return snapshot;
    });
    const result = await tloBillHistoryAdapter.collect(context, {
      ...config,
      urls: [sourceUrl, missingUrl],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("1 configured XML source(s)");
  });
});
