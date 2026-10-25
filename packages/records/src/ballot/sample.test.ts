import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotClient } from "../fetch";
import { fetchTravisSampleBallotDocuments } from "./sample";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ballot-sample-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const path =
  "https://assets01.aws.connect.clarityelections.com/Assets/Connect/RootPublish/travis-tx.connect.clarityelections.com/2026/G26 November 2026/";
const party = (name: string, abbreviation: string) => ({
  name: { englishText: name },
  partyAbbreviation: abbreviation,
});

describe("official precinct-keyed sample ballots", () => {
  it("returns published official PDFs, keys only on precinct, and replays offline", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ballotType: "PDF",
        ballotDocPath: path,
        PDFBallotDocs: [
          {
            party: party("Democratic Party", "DEM"),
            sampleBallotDoc: { fileName: "G26-315-DEM.pdf" },
          },
          {
            party: party("Republican Party", "REP"),
            sampleBallotDoc: { fileName: "G26-315-REP.pdf" },
            alternateBallotType: { nameTxt: { englishText: "Accessible" } },
          },
        ],
      }),
    );
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const result = await fetchTravisSampleBallotDocuments({
      client,
      electionId: 20,
      precinctId: 315,
    });
    expect(result.status).toBe("published");
    expect(result.documents.map((document) => document.partyAbbreviation)).toEqual(["DEM", "REP"]);
    expect(decodeURIComponent(result.documents[0]!.url)).toContain("G26-315-DEM.pdf");
    expect(result.documents[1]!.alternateBallotType).toBe("Accessible");
    const requested = new URL(String(network.mock.calls[0]![0]));
    expect(requested.searchParams.get("electionId")).toBe("20");
    expect(requested.searchParams.get("precinctId")).toBe("315");
    expect(requested.searchParams.get("lang")).toBe("en-US");

    const offline = new SnapshotClient({ directory, mode: "offline", fetch: network });
    await expect(
      fetchTravisSampleBallotDocuments({ client: offline, electionId: 20, precinctId: 315 }),
    ).resolves.toEqual(result);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("reports an empty official list as not published, never as an empty ballot", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ballotType: "PDF", ballotDocPath: path, PDFBallotDocs: [] }),
      );
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const result = await fetchTravisSampleBallotDocuments({
      client,
      electionId: 20,
      precinctId: 315,
    });
    expect(result.status).toBe("not_published");
    expect(result.documents).toEqual([]);
    expect(result.gaps.join(" ")).toMatch(/not published/i);
    expect(result.gaps.join(" ")).toMatch(/consolidated ballot/i);
  });

  it("does not treat an interactive-only ballot as a published document", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ballotType: "Dynamic",
        PDFBallotDocs: [],
        finalPartyList: [{ id: 1 }],
      }),
    );
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const result = await fetchTravisSampleBallotDocuments({
      client,
      electionId: 20,
      precinctId: 315,
    });
    expect(result.status).toBe("interactive_not_supported");
    expect(result.documents).toEqual([]);
  });

  it("rejects untrusted hosts, non-PDF files, and invalid IDs before fetching", async () => {
    const network = vi.fn<typeof fetch>();
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    for (const [index, [ballotDocPath, fileName]] of (
      [
        ["https://evil.example/2026/", "G26-315-DEM.pdf"],
        [path, "G26-315-DEM.exe"],
        [path, "https://evil.example/G26-315-DEM.pdf"],
      ] as const
    ).entries()) {
      network.mockResolvedValueOnce(
        Response.json({
          ballotType: "PDF",
          ballotDocPath,
          PDFBallotDocs: [
            { party: party("Democratic Party", "DEM"), sampleBallotDoc: { fileName } },
          ],
        }),
      );
      await expect(
        fetchTravisSampleBallotDocuments({
          client: new SnapshotClient({
            directory: join(directory, `reject-${index}`),
            intervalMs: 0,
            fetch: network,
          }),
          electionId: 20,
          precinctId: 315,
        }),
      ).rejects.toThrow(/allowlisted official host|not a PDF/);
    }
    expect(network).toHaveBeenCalledTimes(3);
    const offline = new SnapshotClient({ directory: join(directory, "unused"), fetch: network });
    await expect(
      fetchTravisSampleBallotDocuments({ client: offline, electionId: 20, precinctId: 0 }),
    ).rejects.toThrow(/precinct ID/);
    await expect(
      fetchTravisSampleBallotDocuments({ client: offline, electionId: 0, precinctId: 315 }),
    ).rejects.toThrow(/election ID/);
    expect(network).toHaveBeenCalledTimes(3);
  });
});
