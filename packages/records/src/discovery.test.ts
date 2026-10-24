import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverRecordUrls, discoverySchema, type DiscoveryFtpClient, type DiscoverySpec } from "./discovery";
import { SnapshotClient } from "./fetch";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "records-discovery-test-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const window = { since: "2025-01-07", before: "2025-02-01" };
const origin = "https://www.govinfo.gov";
const recordSpec: DiscoverySpec = { kind: "govinfo-record", years: [2025] };
const packageUrl = (date: string) => `${origin}/metadata/pkg/CREC-${date}/mods.xml`;
const sitemap = (entries: { date: string; lastmod?: string }[]) =>
  `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(({ date, lastmod }) =>
    `<sm:url><sm:loc>${origin}/app/details/CREC-${date}</sm:loc><sm:lastmod>${lastmod ?? "2026-10-01"}</sm:lastmod></sm:url>`,
  ).join("")}</sm:urlset>`;
function clientFor(body: string | ((url: string) => string)) {
  const network = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(
    typeof body === "string" ? body : body(String(url)),
  ));
  return { network, client: new SnapshotClient({ directory, fetch: network, intervalMs: 0, retries: 0 }) };
}

describe("GovInfo Congressional Record discovery", () => {
  it("uses publication dates, not lastmod, sorts/deduplicates whole-day metadata and excludes cutoff", async () => {
    const { client, network } = clientFor(sitemap([
      { date: "2025-01-31" }, { date: "2025-01-07", lastmod: "2026-01-01" },
      { date: "2025-01-06", lastmod: "2025-01-10" }, { date: "2025-02-01" }, { date: "2025-01-07" },
    ]));
    const result = await discoverRecordUrls(client, { kind: "govinfo-record", years: [2024, 2025, 2025, 2026] }, window);
    expect(result.urls).toEqual([packageUrl("2025-01-07"), packageUrl("2025-01-31")]);
    expect(result.status).toBe("complete");
    expect(result.reason).toContain("not a claim of lifetime coverage");
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(`${origin}/sitemap/CREC_2025_sitemap.xml`);
    // A second candidate uses the identical cached index, including offline.
    expect((await discoverRecordUrls(new SnapshotClient({ directory, mode: "offline", fetch: network }), recordSpec, window)).urls).toEqual(result.urls);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("returns explicit partial coverage only when the configured cap omits a document", async () => {
    const { client } = clientFor(sitemap([{ date: "2025-01-08" }, { date: "2025-01-07" }, { date: "2025-01-07" }]));
    const capped = await discoverRecordUrls(client, { ...recordSpec, maxDocuments: 1 }, window);
    expect(capped).toMatchObject({ urls: [packageUrl("2025-01-07")], status: "partial" });
    expect(capped.reason).toContain("1 of 2");
    expect((await discoverRecordUrls(client, { ...recordSpec, maxDocuments: 2 }, window)).status).toBe("complete");
  });

  it.each([
    "https://evil.example/app/details/CREC-2025-01-07",
    "https://www.govinfo.gov.evil.example/app/details/CREC-2025-01-07",
    "https://www.govinfo.gov/app/details/CREC-2025-01-07?redirect=evil",
    "https://user@www.govinfo.gov/app/details/CREC-2025-01-07",
    "https://www.govinfo.gov/other/CREC-2025-01-07",
    "https://www.govinfo.gov/app/details/CREC-2024-01-07",
    "https://www.govinfo.gov/app/details/CREC-2025-02-30",
  ])("rejects untrusted or malformed inventory URL %s", async (loc) => {
    const { client } = clientFor(`<urlset><url><loc>${loc}</loc></url></urlset>`);
    await expect(discoverRecordUrls(client, recordSpec, window)).rejects.toThrow();
  });

  it.each(["<html>denied</html>", "<sitemapindex/>", "<urlset><url/></urlset>", "<urlset><url><lastmod>2025-01-07</lastmod></url></urlset>", "<urlset><error>denied</error></urlset>"])("rejects bad source shapes: %s", async (body) => {
    await expect(discoverRecordUrls(clientFor(body).client, recordSpec, window)).rejects.toThrow();
  });

  it("accepts an empty published inventory and never requests non-overlapping years", async () => {
    const { client, network } = clientFor(sitemap([]));
    expect((await discoverRecordUrls(client, recordSpec, window)).urls).toEqual([]);
    expect((await discoverRecordUrls(client, { kind: "govinfo-record", years: [2023, 2026] }, window)).status).toBe("complete");
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe("GovInfo BILLSTATUS discovery", () => {
  const types = ["hr", "s", "hres", "sres", "hjres", "sjres", "hconres", "sconres"] as const;
  const billUrl = (type: string, number = 152, congress = 119) => `${origin}/bulkdata/BILLSTATUS/${congress}/${type}/BILLSTATUS-${congress}${type}${number}.xml`;
  const bill = (type = "hr", number = 152) => ({ name: `BILLSTATUS-119${type}${number}.xml`, folder: false, link: billUrl(type, number), lastModified: "2026-10-01" });
  const spec: DiscoverySpec = { kind: "govinfo-billstatus", congresses: [119], billTypes: ["hr"] };

  it("enumerates all eight default types through the JSON API, not HTML, ignoring folders and ZIPs", async () => {
    const { client, network } = clientFor((url) => {
      const type = url.split("/").at(-1)!;
      return JSON.stringify({ files: [bill(type), bill(type), { name: "folder", folder: true }, { name: "archive.zip", folder: false }, { name: "readme.txt", folder: false }] });
    });
    const result = await discoverRecordUrls(client, { kind: "govinfo-billstatus", congresses: [119, 119] }, window);
    expect(result.urls).toEqual(types.map((type) => billUrl(type)).sort());
    expect(result.status).toBe("complete");
    expect(network).toHaveBeenCalledTimes(8);
    expect(network.mock.calls.map(([url]) => String(url)).sort()).toEqual(types.map((type) => `${origin}/bulkdata/json/BILLSTATUS/119/${type}`).sort());
  });

  it("does not filter bills by index timestamps and reports a document cap", async () => {
    const { client } = clientFor(JSON.stringify({ files: [bill("hr", 2), bill("hr", 1)] }));
    expect(await discoverRecordUrls(client, { ...spec, maxDocuments: 1 }, window)).toMatchObject({ urls: [billUrl("hr", 1)], status: "partial" });
  });

  it.each([
    { error: "unavailable" }, { files: {} }, { files: [{ name: "file.xml" }] },
    { files: [{ ...bill(), link: "https://evil.example/bill.xml" }] },
    { files: [{ ...bill(), link: billUrl("s") }] },
    { files: [{ ...bill(), link: billUrl("hr", 152, 118) }] },
    { files: [{ ...bill(), link: `${billUrl("hr")}?key=secret` }] },
    { files: [{ ...bill(), name: "BILLSTATUS-118hr152.xml" }] },
    { files: [{ name: "BILLSTATUS-119hr152.xml", folder: false }] },
  ])("rejects malformed API envelopes or invalid document paths: %j", async (body) => {
    await expect(discoverRecordUrls(clientFor(JSON.stringify(body)).client, spec, window)).rejects.toThrow();
  });
});

type Entry = Awaited<ReturnType<DiscoveryFtpClient["list"]>>[number];
function entry(name: string, kind: "file" | "dir" | "link" = "file"): Entry {
  return { name, isFile: kind === "file", isDirectory: kind === "dir", isSymbolicLink: kind === "link" };
}
function fakeFtp(listings: Record<string, Entry[]> = {}) {
  const ftp = {
    access: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(async (path: string) => {
      if (!(path in listings)) throw new Error(`Unexpected LIST: ${path}`);
      return listings[path];
    }),
    close: vi.fn(),
  };
  const sleep = vi.fn().mockResolvedValue(undefined);
  const ftpFactory = vi.fn(() => ftp);
  return { ftp, options: { ftpFactory, sleep } };
}
describe("Texas anonymous FTP discovery", () => {
  const root = "/bills/89R/billhistory/house_bills";
  const spec: DiscoverySpec = { kind: "tlo-billhistory", sessions: ["89R"], billTypes: ["HB"] };
  it("walks every valid grouping once, preserves/encodes spaces, ignores links and never recursively walks", async () => {
    const { ftp, options } = fakeFtp({
      [root]: [entry("HB00100_HB00199", "dir"), entry("HB00001_HB00099", "dir"), entry(".", "dir"), entry("..", "dir"), entry("HB00200_HB00299", "link"), entry("SB00001_SB00099", "dir"), entry("HB 1.xml"), entry("unexpected", "dir")],
      [`${root}/HB00001_HB00099`]: [entry("HB 2.xml"), entry("HB00001.xml"), entry("HB  3.xml"), entry("HB 2.xml"), entry("SB 2.xml"), entry("HB 4.pdf"), entry("HB 5.xml", "link"), entry("HB 6.xml", "dir"), entry("../HB7.xml"), entry("HB8.xml/else")],
      [`${root}/HB00100_HB00199`]: [entry("HB 100.xml")],
    });
    const { client, network } = clientFor("unexpected");
    const result = await discoverRecordUrls(client, spec, window, options);
    expect(result.urls).toEqual([
      `ftp://ftp.legis.state.tx.us${root}/HB00001_HB00099/HB%20%203.xml`,
      `ftp://ftp.legis.state.tx.us${root}/HB00001_HB00099/HB%202.xml`,
      `ftp://ftp.legis.state.tx.us${root}/HB00001_HB00099/HB00001.xml`,
      `ftp://ftp.legis.state.tx.us${root}/HB00100_HB00199/HB%20100.xml`,
    ]);
    expect(result.status).toBe("complete");
    expect(result.reason).toContain("enumerated again in reuse mode");
    expect(ftp.access).toHaveBeenCalledWith({ host: "ftp.legis.state.tx.us", secure: false });
    expect(ftp.list.mock.calls).toEqual([[root], [`${root}/HB00001_HB00099`], [`${root}/HB00100_HB00199`]]);
    expect(options.sleep.mock.calls).toEqual([[500], [500], [500]]);
    expect(ftp.close).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
  });

  it("uses all eight exact directory names and configured regular/special sessions", async () => {
    const dirs = ["house_bills", "senate_bills", "house_joint_resolutions", "senate_joint_resolutions", "house_concurrent_resolutions", "senate_concurrent_resolutions", "house_resolutions", "senate_resolutions"];
    const paths = ["89R", "891", "892"].flatMap((session) => dirs.map((dir) => `/bills/${session}/billhistory/${dir}`));
    const { ftp, options } = fakeFtp(Object.fromEntries(paths.map((path) => [path, []])));
    const result = await discoverRecordUrls(clientFor("").client, { kind: "tlo-billhistory", sessions: ["89R", "891", "892", "89R"], billTypes: ["HB", "SB", "HJR", "SJR", "HCR", "SCR", "HR", "SR"] }, window, options);
    expect(result.urls).toEqual([]);
    expect(ftp.list.mock.calls.map(([path]) => path).sort()).toEqual(paths.sort());
    expect(ftp.close).toHaveBeenCalledOnce();
  });

  it("marks capped FTP results partial after enumerating the configured inventory", async () => {
    const { ftp, options } = fakeFtp({ [root]: [entry("HB00001_HB00099", "dir")], [`${root}/HB00001_HB00099`]: [entry("HB 1.xml"), entry("HB 2.xml")] });
    expect((await discoverRecordUrls(clientFor("").client, { ...spec, maxDocuments: 1 }, window, options)).status).toBe("partial");
    expect(ftp.close).toHaveBeenCalledOnce();
  });

  it.each(["access", "list"] as const)("closes resources on %s failures", async (operation) => {
    const { ftp, options } = fakeFtp();
    ftp[operation].mockRejectedValueOnce(new Error("FTP failed"));
    await expect(discoverRecordUrls(clientFor("").client, spec, window, options)).rejects.toThrow("FTP failed");
    expect(ftp.close).toHaveBeenCalledOnce();
  });

  it("never creates an FTP client or contacts the network in offline mode", async () => {
    const { options } = fakeFtp();
    const network = vi.fn<typeof fetch>();
    const client = new SnapshotClient({ directory, mode: "offline", fetch: network });
    await expect(discoverRecordUrls(client, spec, window, options)).rejects.toThrow("TLO FTP discovery requires an explicit saved URLs plan in offline mode");
    expect(options.ftpFactory).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});

describe("oag-opinion-index discovery", () => {
  it("prefers newest Ken Paxton opinion PDFs from the official index HTML", async () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="/opinions/ken-paxton/kp-0001">old</a>
      <a href="/sites/default/files/opinion-files/opinion/2015/kp-0001.pdf">old pdf</a>
      <a href="/opinions/ken-paxton/kp-0537">new</a>
      <a href="/sites/default/files/opinion-files/opinion/2026/kp-0537.pdf">new pdf</a>
      <a href="/opinions/ken-paxton/kp-0536">mid</a>
      <a href="/sites/default/files/opinion-files/opinion/2026/kp-0536.pdf">mid pdf</a>
      <a href="/opinions/greg-abbott/ga-0001">other</a>
      <a href="/opinions/ken-paxton/kp-0537">dup</a>
    </body></html>`;
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html, { headers: { "content-type": "text/html" } })),
    });
    const result = await discoverRecordUrls(
      client,
      { kind: "oag-opinion-index", agPath: "ken-paxton", maxDocuments: 2 },
      window,
    );
    expect(result.status).toBe("partial");
    expect(result.urls).toEqual([
      "https://www.texasattorneygeneral.gov/sites/default/files/opinion-files/opinion/2026/kp-0537.pdf",
      "https://www.texasattorneygeneral.gov/sites/default/files/opinion-files/opinion/2026/kp-0536.pdf",
    ]);
  });

  it("counts down past the few opinions linked on the index, resolving each page's PDF", async () => {
    const index = `<!DOCTYPE html><html><body>
      <a href="/opinions/ken-paxton/kp-0003">3</a>
      <a href="/sites/default/files/opinion-files/opinion/2015/kp-0003.pdf">p3</a>
    </body></html>`;
    const page = (n: string, file: string) =>
      `<!DOCTYPE html><html><body><a href="/sites/default/files/opinion-files/opinion/2015/${file}.pdf">pdf</a>${n}</body></html>`;
    const network = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith("/opinions")) return new Response(index);
      if (u.endsWith("kp-0002")) return new Response(page("2", "kp0002"));
      if (u.endsWith("kp-0001")) return new Response(page("1", "kp0001"));
      return new Response("nope", { status: 404 });
    });
    const client = new SnapshotClient({ directory, intervalMs: 0, retries: 0, fetch: network });
    const result = await discoverRecordUrls(client, { kind: "oag-opinion-index", agPath: "ken-paxton" }, window);
    expect(result.urls).toEqual([
      "https://www.texasattorneygeneral.gov/sites/default/files/opinion-files/opinion/2015/kp-0003.pdf",
      "https://www.texasattorneygeneral.gov/sites/default/files/opinion-files/opinion/2015/kp0002.pdf",
      "https://www.texasattorneygeneral.gov/sites/default/files/opinion-files/opinion/2015/kp0001.pdf",
    ]);
  });
});

describe("discovery configuration validation", () => {
  it.each([
    { kind: "govinfo-record", years: [] }, { kind: "govinfo-record", years: [2025], maxDocuments: 0 },
    { kind: "house-clerk-rolls", year: 2025, fromRoll: 10, toRoll: 5 },
    { kind: "govinfo-billstatus", congresses: [119], billTypes: ["HB"] },
    { kind: "govinfo-billstatus", congresses: [119], billTypes: [] },
    { kind: "tlo-billhistory", sessions: ["70R"], billTypes: ["HB"] },
    { kind: "tlo-billhistory", sessions: ["89R/../../"], billTypes: ["HB"] },
    { kind: "tlo-billhistory", sessions: ["89R"], billTypes: ["hr"] },
    { kind: "govinfo-record", years: [2025], host: "evil.example" },
    { kind: "oag-opinion-index", agPath: "../ken-paxton" },
    { kind: "oag-opinion-index", agPath: "Ken-Paxton" },
    { kind: "oag-opinion-index", agPath: "ken-paxton", maxDocuments: 0 },
  ])("rejects unsafe or invalid config %j", (spec) => {
    expect(discoverySchema.safeParse(spec).success).toBe(false);
  });

  it("accepts oag-opinion-index paths", () => {
    expect(discoverySchema.safeParse({ kind: "oag-opinion-index", agPath: "ken-paxton", maxDocuments: 8 }).success).toBe(true);
  });
});
