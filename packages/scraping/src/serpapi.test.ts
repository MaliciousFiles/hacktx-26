import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FrozenWebClient, SerpApiUnavailableError, serpApiKeysFromEnv } from "./snapshot";
import { collectVoice } from "./voice";

const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const fetchedAt = "2026-10-24";
const base = "https://serpapi.com/search.json?engine=google&q=test";
const withKey = (k: string) => `${base}&api_key=${k}`;
const ok = () => new Response(JSON.stringify({ organic_results: [] }), { status: 200 });
const quota = () =>
  new Response(JSON.stringify({ error: "Your account has run out of searches." }), { status: 429 });

function setup(
  responders: (() => Response)[],
  serpApi?: { keys: string[]; maxRequests?: number },
  dir?: string,
) {
  const calls: string[] = [];
  const fetchFn = (async (u: string) => {
    calls.push(u);
    return responders[Math.min(calls.length - 1, responders.length - 1)]!();
  }) as unknown as typeof fetch;
  return async () => {
    const directory = dir ?? (await mkdtemp(join(tmpdir(), "serp-")));
    const client = new FrozenWebClient({
      directory,
      fetchedAt,
      allowedHosts: ["serpapi.com"],
      intervalMs: 0,
      fetch: fetchFn,
      serpApi,
    });
    return { client, calls, directory };
  };
}

describe("SerpAPI cache identity", () => {
  it("does not depend on api_key and replays across a key switch", async () => {
    const { client, calls, directory } = await setup([ok])();
    await client.fetch(withKey("KEY_A"));
    const again = new FrozenWebClient({
      directory,
      fetchedAt,
      allowedHosts: ["serpapi.com"],
      intervalMs: 0,
      fetch: (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch,
    });
    const res = await again.fetch(withKey("KEY_B"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(again.serpApiStats()).toMatchObject({ live: 0, cached: 1 });
    expect(JSON.stringify(await readdir(directory))).not.toContain("KEY_");
  });

  it("reads legacy key-hashed snapshots, still rejecting corrupt ones", async () => {
    const directory = await mkdtemp(join(tmpdir(), "serp-"));
    const value = withKey("KEY_A");
    const headers = { "User-Agent": "FairyTaleBallot/1.0" };
    const legacyId = sha(JSON.stringify([value, Object.entries(headers).sort(), fetchedAt]));
    const bytes = Buffer.from(JSON.stringify({ organic_results: [] }));
    const stored = {
      id: legacyId,
      url: `${base}`,
      fetchedAt,
      contentHash: sha(bytes),
      status: 200,
      contentType: "",
      body: bytes.toString("base64"),
    };
    const publicUrl = new URL(base);
    stored.url = publicUrl.href;
    await writeFile(join(directory, `${legacyId}.json`), JSON.stringify(stored));
    const mk = (keys: string[]) =>
      new FrozenWebClient({
        directory,
        fetchedAt,
        offline: true,
        allowedHosts: ["serpapi.com"],
        serpApi: { keys },
      });
    // legacy id under the key the caller supplied, or under a pool key
    expect((await mk([]).fetch(value)).status).toBe(200);
    expect((await mk(["KEY_A", "KEY_B"]).fetch(withKey("KEY_B"))).status).toBe(200);
    await writeFile(
      join(directory, `${legacyId}.json`),
      JSON.stringify({ ...stored, body: Buffer.from("tampered").toString("base64") }),
    );
    await expect(mk([]).fetch(value)).rejects.toThrow("Corrupt web snapshot");
  });
});

describe("SerpAPI failover", () => {
  it("switches to the fallback on quota, retries once, and never freezes the quota body", async () => {
    const { client, calls, directory } = await setup([quota, ok], { keys: ["KEY_A", "KEY_B"] })();
    const res = await client.fetch(withKey("KEY_A"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("api_key=KEY_A");
    expect(calls[1]).toContain("api_key=KEY_B");
    expect(client.serpApiStats()).toMatchObject({ live: 2, keyNumber: 2 });
    const files = (await readdir(directory)).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1); // only the success is frozen
    await client.fetch(`${base}&q2=x&api_key=KEY_A`); // later requests use the new key directly
    expect(calls[2]).toContain("api_key=KEY_B");
  });

  it("recognises 401/403 quota wording", async () => {
    const forbidden = () =>
      new Response(JSON.stringify({ error: "Your plan limit was reached." }), { status: 403 });
    const { client, calls } = await setup([forbidden, ok], { keys: ["KEY_A", "KEY_B"] })();
    expect((await client.fetch(withKey("KEY_A"))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("does not fail over on a 500", async () => {
    const boom = () => new Response("oops", { status: 500 });
    const { client, calls } = await setup([boom, ok], { keys: ["KEY_A", "KEY_B"] })();
    expect((await client.fetch(withKey("KEY_A"))).status).toBe(500);
    expect(calls).toHaveLength(1);
    expect(client.serpApiStats().keyNumber).toBe(1);
  });

  it("fails loudly (no retry of the same key) when every key is exhausted, and leaves nothing frozen", async () => {
    const { client, calls, directory } = await setup([quota], { keys: ["KEY_A", "KEY_B"] })();
    await expect(client.fetch(withKey("KEY_A"))).rejects.toBeInstanceOf(SerpApiUnavailableError);
    expect(calls).toHaveLength(2);
    await expect(client.fetch(`${base}2&api_key=KEY_A`)).rejects.toBeInstanceOf(
      SerpApiUnavailableError,
    );
    expect(calls).toHaveLength(2); // no further spend
    expect((await readdir(directory)).filter((f) => f.endsWith(".json"))).toHaveLength(0);
  });

  it("ignores a previously frozen quota response and refetches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "serp-"));
    const first = await setup([ok], undefined, dir)();
    const probe = first.client;
    await probe.fetch(withKey("KEY_A"));
    const [file] = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    const bytes = Buffer.from(JSON.stringify({ error: "run out of searches" }));
    const id = file!.replace(".json", "");
    const url = new URL(base).href;
    await writeFile(
      join(dir, file!),
      JSON.stringify({ id, url, fetchedAt, contentHash: sha(bytes), status: 429, contentType: "", body: bytes.toString("base64") }),
    );
    const second = await setup([ok], undefined, dir)();
    expect((await second.client.fetch(withKey("KEY_A"))).status).toBe(200);
    expect(second.calls).toHaveLength(1);
  });
});

describe("SerpAPI budget and counters", () => {
  it("stops live calls at the budget while cache hits still work", async () => {
    const { client, calls } = await setup([ok], { keys: ["KEY_A"], maxRequests: 1 })();
    await client.fetch(withKey("KEY_A"));
    await client.fetch(withKey("KEY_A")); // cached
    await expect(client.fetch(`${base}2&api_key=KEY_A`)).rejects.toMatchObject({ reason: "budget" });
    expect(calls).toHaveLength(1);
    expect(client.serpApiStats()).toMatchObject({ live: 1, cached: 1, keyNumber: 1 });
    expect(client.serpApiSummary()).toContain("serpapi requests: 1 live, 1 cached, key #1");
    expect(client.serpApiStats().gap).toContain("SERPAPI_MAX_REQUESTS=1");
  });

  it("records an explicit coverage gap in voice collection instead of empty results", async () => {
    const { client } = await setup([ok], { keys: ["KEY_A"], maxRequests: 0 })();
    const out = await collectVoice(
      {
        contestId: "c1",
        request: {
          candidate: { id: "cand", name: "Ada Lovelace" },
          position: { office: "state_house", jurisdiction: "us/tx", district: "1" },
          year: 2026,
        },
      } as never,
      {
        client,
        fetchedAt,
        window: { since: "2025-11-08", until: fetchedAt },
        serpApiKey: "KEY_A",
        campaignSites: [],
        newsDomains: [],
        questionnaireDomains: [],
        speechDomains: [],
        resultsPerQuery: 5,
        maxPagesPerChannel: 1,
        maxQuotesPerSource: 1,
      },
    );
    const gaps = out.coverage.filter((row) => row.reason.startsWith("SerpAPI unavailable (budget)"));
    expect(gaps.length).toBe(8);
    expect(out.coverage.some((row) => row.channel === "news" && row.status === "searched" && /Fixed query/.test(row.reason))).toBe(false);
  });

  it("builds the key pool from env in order", () => {
    expect(serpApiKeysFromEnv({ SERPAPI_API_KEY: "a", SERPAPI_API_KEY_FALLBACK: "b" })).toEqual(["a", "b"]);
    expect(serpApiKeysFromEnv({ SERPAPI_API_KEY: " ", SERPAPI_API_KEY_FALLBACK: "b" })).toEqual(["b"]);
  });
});
