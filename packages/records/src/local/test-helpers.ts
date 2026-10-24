import type { CandidateResearchRequest } from "@ftb/types";
import { vi } from "vitest";
import type { AdapterContext } from "../adapters";
import { publicUrl, sha256 } from "../fetch";
import type { SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";

export function request(overrides: Partial<CandidateResearchRequest["candidate"]> = {}): CandidateResearchRequest {
  return {
    candidate: { id: "candidate-1", name: "Alex Rivera", ...overrides },
    position: { office: "city_council", jurisdiction: "example", district: "99" },
    month: 11, year: 2026,
  };
}

export function mockContext(
  respond: (url: URL) => unknown | Promise<unknown>,
  candidate: Partial<CandidateResearchRequest["candidate"]> = {},
) {
  const urls: URL[] = [];
  const get = vi.fn(async (value: string, options: { format: string }): Promise<Snapshot> => {
    if (options.format !== "json") throw new Error("Only JSON is authorized");
    const url = new URL(value);
    urls.push(url);
    const text = JSON.stringify(await respond(url));
    return {
      id: sha256(`${publicUrl(value)}:${text}`),
      sourceUrl: publicUrl(value), fetchedAt: "2026-10-24T00:00:00Z",
      contentHash: sha256(text), format: "json", text,
    };
  });
  const context: AdapterContext = {
    request: request(candidate), window: { since: "2026-01-01", before: "2026-11-01" },
    client: { get } as unknown as SnapshotClient,
  };
  return { context, get, urls };
}

export function offsetPage<T>(rows: T[], url: URL, style: "odata" | "socrata" = "odata"): T[] {
  const offset = Number(url.searchParams.get(style === "odata" ? "$skip" : "$offset") ?? 0);
  const limit = Number(url.searchParams.get(style === "odata" ? "$top" : "$limit") ?? 100);
  return rows.slice(offset, offset + limit);
}
