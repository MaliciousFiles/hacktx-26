import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import {
  parseHouseJournalVotes,
  parseSenateJournalVotes,
  txHouseJournalAdapter,
  txSenateJournalAdapter,
} from "./journals";

const housePlain = `
FORTY-THIRD DAY --- MONDAY, APRIL 14, 2025
SCR 47 was adopted by (Record 158): 3 Yeas, 2 Nays, 1 Present, not voting.
Yeas — Alders; Bell, C.; Buckley.
Nays — Cain; Harrison.
Present, not voting — Mr. Speaker(C).
HB 126 was passed to engrossment by (Record 162): 2 Yeas, 1 Nays, 0 Present, not voting.
Yeas — Buckley; Wilson.
Nays — Alders.
`;

const senatePlain = `
WEDNESDAY, APRIL 16, 2025
The motion prevailed by the following vote: Yeas 3, Nays 2.
Yeas: Bettencourt, Flores, Huffman.
Nays: Cook, Eckhardt.
The bill was passed by the following vote: Yeas 3, Nays 2. (Same as previous roll call)
All Members are deemed to have voted "Yea" on the passage to engrossment except as follows:
Nays: Eckhardt.
Senator Cook asked to be recorded as voting "Nay" on suspension of the regular order of business.
`;

describe("deterministic journal parsers", () => {
  it("parses House record votes and reconciles declared totals", () => {
    const votes = parseHouseJournalVotes(housePlain, "2025-04-14");
    expect(votes).toHaveLength(2);
    expect(votes[0]).toMatchObject({
      record: 158, margin: { yes: 3, no: 2, present: 1 },
      yes: ["Alders", "Bell, C.", "Buckley"], no: ["Cain", "Harrison"],
    });
    expect(votes[1].yes).toEqual(["Buckley", "Wilson"]);
  });

  it("rejects House totals that do not match named lists", () => {
    const bad = housePlain.replace("3 Yeas, 2 Nays", "9 Yeas, 2 Nays");
    expect(() => parseHouseJournalVotes(bad, "2025-04-14")).toThrow(/Yeas list has/);
  });

  it("parses Senate full rolls, same-as-previous, and exception-only deemed votes", () => {
    const votes = parseSenateJournalVotes(senatePlain, "2025-04-16");
    expect(votes[0].yes).toEqual(["Bettencourt", "Flores", "Huffman"]);
    expect(votes[1].sameAsPrevious).toBe(true);
    expect(votes[1].no).toEqual(["Cook", "Eckhardt"]);
    expect(votes[2]).toMatchObject({ deemedYeaExcept: true, no: ["Eckhardt"], yes: [] });
    expect(votes[3].no).toEqual(["Cook"]);
  });
});

describe("journal adapters", () => {
  let directory: string;
  beforeEach(async () => {
    const root = join(tmpdir(), "opencode");
    await mkdir(root, { recursive: true });
    directory = await mkdtemp(join(root, "tx-journal-"));
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  const request: CandidateResearchRequest = {
    candidate: { id: "buckley", name: "Brad Buckley" },
    position: { office: "tx_house", jurisdiction: "tx/house" },
    month: 11, year: 2026,
  };

  function htmlDoc(body: string): string {
    return `<!DOCTYPE html><html><head><title>Journal</title></head><body><div>${body.replace(/\n/g, "<br/>")}</div></body></html>`;
  }

  it("attributes only the bound candidate's exact journal label", async () => {
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(htmlDoc(housePlain))),
    });
    const result = await txHouseJournalAdapter.collect(
      { request, window: dateWindow(request), client },
      {
        urls: ["https://journals.house.texas.gov/hjrnl/89r/html/fixture.HTM"],
        role: "TX House D20",
        journalLabels: ["Buckley"],
        memberCandidateId: "buckley",
        memberIdentitySourceUrl: "https://capitol.texas.gov/Authors/fixture",
      },
    );
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(2);
    expect(result.actions.every((action) => action.actorId === "buckley")).toBe(true);
    expect(result.actions.every((action) => action.extraction === "html")).toBe(true);
    expect(result.actions[0].vote?.value).toBe("yes");
  });

  it("does not invent Senate Yeas from a deemed-unanimous exception list", async () => {
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(htmlDoc(senatePlain))),
    });
    const floored = await txSenateJournalAdapter.collect(
      {
        request: { ...request, candidate: { id: "huffman", name: "Joan Huffman" } },
        window: dateWindow(request),
        client,
      },
      {
        urls: ["https://journals.senate.texas.gov/sjrnl/89r/html/fixture.HTM"],
        role: "TX Senate",
        journalLabels: ["Huffman"],
        memberCandidateId: "huffman",
        memberIdentitySourceUrl: "https://capitol.texas.gov/Authors/fixture",
      },
    );
    // Huffman is on full rolls (including same-as-previous) but NOT on the deemed-exception-only vote.
    expect(floored.actions.some((action) => action.vote?.question.includes("deemed"))).toBe(false);
    expect(floored.actions.length).toBeGreaterThanOrEqual(2);

    const eckhardt = await txSenateJournalAdapter.collect(
      {
        request: { ...request, candidate: { id: "eckhardt", name: "Sarah Eckhardt" } },
        window: dateWindow(request),
        client: client.fork(),
      },
      {
        urls: ["https://journals.senate.texas.gov/sjrnl/89r/html/fixture.HTM"],
        role: "TX Senate",
        journalLabels: ["Eckhardt"],
        memberCandidateId: "eckhardt",
        memberIdentitySourceUrl: "https://capitol.texas.gov/Authors/fixture",
      },
    );
    expect(eckhardt.actions.some((action) => action.vote?.value === "no" && action.vote.question.includes("deemed"))).toBe(true);
  });

  it("rejects reused journal labels for a different candidate id", async () => {
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(htmlDoc(housePlain))),
    });
    const result = await txHouseJournalAdapter.collect(
      { request, window: dateWindow(request), client },
      {
        urls: ["https://journals.house.texas.gov/hjrnl/89r/html/fixture.HTM"],
        role: "TX House",
        journalLabels: ["Buckley"],
        memberCandidateId: "someone-else",
        memberIdentitySourceUrl: "https://capitol.texas.gov/Authors/fixture",
      },
    );
    expect(result.status).toBe("needs_review");
    expect(result.actions).toEqual([]);
  });
});
