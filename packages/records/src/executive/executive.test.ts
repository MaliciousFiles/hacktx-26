import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import { agOpinionsAdapter } from "./ag-opinions";
import { governorOrdersAdapter } from "./governor-orders";
import { texasRegisterAdapter } from "./texas-register";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "exec-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const request: CandidateResearchRequest = {
  candidate: { id: "ag-1", name: "Ken Paxton" },
  position: { office: "tx_ag", jurisdiction: "tx" },
  month: 11, year: 2026,
};

describe("executive HTML/PDF adapters", () => {
  it("attributes an AG opinion inside verified tenure", async () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Opinion No. KP-0456</h1>
      <p>January 15, 2025</p>
      <p>Office of the Attorney General</p>
      <p>This opinion addresses open-records procedure.</p>
    </body></html>`;
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
    });
    const result = await agOpinionsAdapter.collect(
      { request, window: dateWindow(request), client },
      {
        urls: ["https://www.texasattorneygeneral.gov/opinions/ken-paxton/kp-0456"],
        tenure: {
          candidateId: "ag-1",
          start: "2015-01-05",
          sourceUrl: "https://www.texasattorneygeneral.gov/",
        },
      },
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "legal_opinion", stance: "n/a", date: "2025-01-15", extraction: "html",
    });
    expect(result.actions[0].attribution?.method).toBe("office_tenure");
  });

  it("rejects governor orders outside tenure", async () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Executive Order GA-99</h1>
      <p>March 1, 2010</p>
      <p>By the Governor of the State of Texas</p>
    </body></html>`;
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
    });
    const result = await governorOrdersAdapter.collect(
      {
        request: { ...request, candidate: { id: "gov-1", name: "Greg Abbott" } },
        window: dateWindow(request),
        client,
      },
      {
        urls: ["https://gov.texas.gov/orders/ga-99"],
        tenure: {
          candidateId: "gov-1",
          start: "2015-01-20",
          sourceUrl: "https://gov.texas.gov/",
        },
      },
    );
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
  });

  it("requires a named actor in a Texas Register section", async () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>The Governor</h2>
      <p>Appointments — January 10, 2025</p>
      <p>Governor Greg Abbott appointed Jane Doe to the commission.</p>
    </body></html>`;
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
    });
    const result = await texasRegisterAdapter.collect(
      {
        request: { ...request, candidate: { id: "gov-1", name: "Greg Abbott" } },
        window: dateWindow(request),
        client,
      },
      {
        urls: ["https://www.sos.state.tx.us/texreg/index.shtml"],
        role: "Governor of Texas",
        section: "The Governor",
        actorLabels: ["Greg Abbott"],
        memberCandidateId: "gov-1",
        actionType: "appointment",
      },
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("appointment");
  });
});
