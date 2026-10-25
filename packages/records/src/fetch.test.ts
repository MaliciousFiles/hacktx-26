import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicUrl, SnapshotClient } from "./fetch";

let directory: string;
beforeEach(async () => {
  const base = join(tmpdir(), "opencode");
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, "records-cache-test-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const xml = "<?xml version=\"1.0\"?><record><text>José 😀\r\n exact</text></record>";
const options = { format: "xml", root: "record" } as const;

describe("snapshot transport", () => {
  it("persists exact bytes, reuses them offline, and removes URL secrets", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml, { headers: { etag: "v1" } }));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const result = await client.get("https://example.gov/data?api_key=secret&b=2&a=1", options);
    expect(result.text).toBe(xml);
    expect(result.sourceUrl).toBe("https://example.gov/data?a=1&b=2");
    const offline = new SnapshotClient({ directory, mode: "offline", fetch: network });
    expect(await offline.get("https://example.gov/data?b=2&a=1&api_key=other", options)).toEqual(result);
    expect((await offline.read(result.id)).text).toBe(xml);
    expect(network).toHaveBeenCalledTimes(1);
    const files = await readdir(join(directory, "requests"));
    expect(await readFile(join(directory, "requests", files[0]), "utf8")).not.toContain("secret");
  });

  it("rejects HTML and unexpected XML roots, even on HTTP 200", async () => {
    for (const body of ["<html><title>Access denied</title></html>", "<error>Not found</error>", "<record>"]) {
      const client = new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)) });
      await expect(client.get("https://example.gov/data", options)).rejects.toThrow();
    }
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects XML entity declarations", async () => {
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(
      '<!DOCTYPE record [<!ENTITY foo "expanded">]><record>&foo;</record>',
    )) });
    await expect(client.get("https://example.gov/data", options)).rejects.toThrow("entity");
  });

  it("rejects undecodable bytes instead of silently changing original text", async () => {
    const bytes = Buffer.concat([Buffer.from("<record>"), Buffer.from([0xff]), Buffer.from("</record>")]);
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)) });
    await expect(client.get("https://example.gov/data", options)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });

  it("refreshes conditionally without changing the frozen snapshot on 304", async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(xml, { headers: { etag: "v1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const first = await new SnapshotClient({ directory, intervalMs: 0, fetch: network }).get("https://example.gov/data", options);
    const next = await new SnapshotClient({ directory, mode: "refresh", intervalMs: 0, fetch: network }).get("https://example.gov/data", options);
    expect(next).toEqual(first);
    expect(network.mock.calls[1][1]?.headers).toMatchObject({ "If-None-Match": "v1" });
  });

  it("keeps an older immutable snapshot after the URL changes", async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(xml))
      .mockResolvedValueOnce(new Response("<record>v2</record>"));
    const first = await new SnapshotClient({ directory, intervalMs: 0, fetch: network }).get("https://example.gov/data", options);
    const client = new SnapshotClient({ directory, mode: "refresh", intervalMs: 0, fetch: network });
    const second = await client.get("https://example.gov/data", options);
    expect(second.id).not.toBe(first.id);
    expect((await client.read(first.id)).text).toBe(xml);
  });

  it("detects corrupted bytes before they can enter the pipeline", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const snapshot = await client.get("https://example.gov/data", options);
    await writeFile(join(directory, "objects", snapshot.contentHash), "not the original bytes");
    await expect(client.get("https://example.gov/data", options)).rejects.toThrow("SHA-256");
  });

  it("retries rate limits with a bounded delay, not 403 denials", async () => {
    const network = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response(xml));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network, sleep });
    await client.get("https://example.gov/data", options);
    expect(sleep).toHaveBeenCalledWith(2000);
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 403 }));
    await expect(new SnapshotClient({ directory, fetch: denied, sleep }).get("https://example.gov/denied", options)).rejects.toThrow("403");
    expect(denied).toHaveBeenCalledTimes(1);
  });

  it("fails closed for offline misses and oversized responses", async () => {
    await expect(new SnapshotClient({ directory, mode: "offline" }).get("https://example.gov/missing", options)).rejects.toThrow("Offline cache miss");
    await expect(new SnapshotClient({ directory, intervalMs: 0, maxBytes: 1, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(xml)) }).get("https://example.gov/data", options)).rejects.toThrow("size limit");
  });

  it("doesn't allow unsupported protocols or credentials embedded in URLs", async () => {
    const client = new SnapshotClient({ directory });
    await expect(client.get("file:///etc/passwd", options)).rejects.toThrow("Only public");
    await expect(client.get("https://user:password@example.gov/data", options)).rejects.toThrow("Only public");
    expect(publicUrl("https://example.gov/a?api_key=secret&token=hidden&year=2026")).toBe("https://example.gov/a?year=2026");
  });

  it("does not retry before a publisher's long Retry-After delay", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response("rate limit", { status: 429, headers: { "Retry-After": "3600" } }));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    await expect(client.get("https://example.gov/data", options)).rejects.toThrow("retry later");
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent cache misses for the same official URL", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async () => new Response(xml));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const [first, second] = await Promise.all([
      client.get("https://example.gov/data", options),
      client.fork().get("https://example.gov/data", options),
    ]);
    expect(first.id).toBe(second.id);
    expect(network).toHaveBeenCalledTimes(1);
  });
});
