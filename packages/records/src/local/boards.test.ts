import { describe, expect, it, vi } from "vitest";
import type { AdapterContext } from "../adapters";
import { sha256, type SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import { ACC_MEMBERS, ACC_MEETINGS, AISD_MEMBERS, AISD_BOARDDOCS, AISD_PORTAL, accBoardAdapter, aisdBoardAdapter, parseAccMinutes } from "./boards";

const roster = '<html><body><h2>Alex Rivera, At-Large Position 9</h2><a href="/profile">Alex Rivera</a><a href="/profile">Read Biography</a></body></html>';
function context(pages: Record<string, string>) {
  const get = vi.fn(async (url: string, options: { format: Snapshot["format"] }): Promise<Snapshot> => {
    if (!(url in pages)) throw new Error("HTTP 403: unavailable");
    return { id: sha256(url), contentHash: sha256(pages[url]), sourceUrl: url, fetchedAt: "2026-10-25T00:00:00Z", format: options.format, text: pages[url] };
  });
  const ctx: AdapterContext = {
    request: { candidate: { id: "alex", name: "Alex Rivera" }, position: { office: "board", jurisdiction: "us/tx" }, month: 11, year: 2026 },
    window: { since: "2026-07-01", before: "2026-11-01" }, client: { get } as unknown as SnapshotClient,
  };
  return { ctx, get };
}
const accTable = `<table><tr><td>Mon Sep 14, 2026</td><td>Regular</td><td><a href="https://drive.google.com/file/d/doc-1/view">Minutes</a></td></tr><tr><td></td><td>Special</td><td><a href="/minutes.pdf">Minutes</a></td></tr><tr><td>Oct 05, 2026</td><td><a href="https://evil.example/m.pdf">Minutes</a><a href="/agenda.pdf">Agenda</a></td></tr></table>`;

describe("official board minutes discovery", () => {
  it("parses dates including continued rows, follows only labeled official minutes, and normalizes Drive downloads", () => {
    const entries = parseAccMinutes(accTable);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.date === "2026-09-14")).toBe(true);
    expect(entries.some((entry) => entry.url === "https://drive.google.com/uc?export=download&id=doc-1")).toBe(true);
    expect(entries.some((entry) => /agenda|evil/.test(entry.url))).toBe(false);
  });

  it("retains unreadable ACC minutes as research documents, never as votes", async () => {
    const { ctx } = context({
      [ACC_MEMBERS]: roster, [ACC_MEETINGS]: accTable, [`${ACC_MEETINGS}meeting-archives/`]: "<html></html>",
      "https://drive.google.com/uc?export=download&id=doc-1": "", "https://offices.austincc.edu/minutes.pdf": "",
    });
    const result = await accBoardAdapter.collect(ctx, { ocr: false });
    expect(result.actions).toEqual([]);
    expect(result.documents).toHaveLength(2);
    expect(result.documents?.every((d) => d.textBasis === "unreadable" && d.reviewRequired)).toBe(true);
    expect(result.status).toBe("partial");
  });

  it("does not fetch minutes without a roster identity match", async () => {
    const { ctx, get } = context({ [ACC_MEMBERS]: '<html><h2>Another Person</h2></html>' });
    const result = await accBoardAdapter.collect(ctx, {});
    expect(result.status).toBe("needs_review");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("collects only public AISD minutes, not agendas, closed minutes, or false public flags", async () => {
    const from = `${AISD_PORTAL}/Services/MeetingsService.svc/meetings?from=2026-07-01&to=2026-11-01`;
    const docUrl = `${AISD_PORTAL}/Services/MeetingsService.svc/meetings/1/meetingDocuments`;
    const { ctx, get } = context({
      [AISD_MEMBERS]: roster,
      [from]: JSON.stringify([{ Id: 1, MeetingDate: "2026-09-24", Name: "Voting meeting", Published: true }]),
      [docUrl]: JSON.stringify({ Documents: [
        { Id: 100, DocumentType: 1, IsPublic: true },
        { Id: 101, DocumentType: 11, IsPublic: true },
        { Id: 102, DocumentType: 9, IsPublic: false },
        { Id: 103, DocumentType: 55, IsPublic: true },
      ] }),
      [`${AISD_PORTAL}/document/103`]: '<html><body><p>Motion to approve the budget</p><p>Alex Rivera - Yes</p></body></html>',
    });
    const result = await aisdBoardAdapter.collect(ctx, {});
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ actorId: "alex", date: "2026-09-24", type: "board_vote", stance: "yes" });
    expect(result.documents).toHaveLength(1);
    expect(result.reason).toMatch(/legacy public archive unavailable/);
    expect(get.mock.calls.some(([url]) => url === AISD_BOARDDOCS)).toBe(true);
    expect(get.mock.calls.filter(([url]) => /\/document\//.test(url)).map(([url]) => url)).toEqual([`${AISD_PORTAL}/document/103`, `${AISD_PORTAL}/document/103`]);
  });

  it("records missing public minutes and caps traversal without interpreting absence as inaction", async () => {
    const url = `${AISD_PORTAL}/Services/MeetingsService.svc/meetings?from=2026-07-01&to=2026-11-01`;
    const { ctx } = context({
      [AISD_MEMBERS]: roster, [url]: JSON.stringify([1, 2].map((Id) => ({ Id, MeetingDate: "2026-09-24", Name: "Voting meeting", Published: true }))),
      [`${AISD_PORTAL}/Services/MeetingsService.svc/meetings/1/meetingDocuments`]: '{"Documents":[]}',
    });
    const result = await aisdBoardAdapter.collect(ctx, { maxDocuments: 1 });
    expect(result.actions).toEqual([]);
    expect(result.reason).toContain("1 inspected meetings without public minutes");
    expect(result.reason).toContain("1 meetings beyond");
    expect(result.status).toBe("partial");
  });
});
