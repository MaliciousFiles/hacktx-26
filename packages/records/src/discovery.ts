import { setTimeout as delay } from "node:timers/promises";
import { Client } from "basic-ftp";
import { z } from "zod";
import type { SnapshotClient } from "./fetch";
import { inWindow, isISODate, type DateWindow } from "./model";
import { parseXml } from "./xml";

const federalBillTypes = ["hr", "s", "hres", "sres", "hjres", "sjres", "hconres", "sconres"] as const;
const texasBillTypes = ["HB", "SB", "HJR", "SJR", "HCR", "SCR", "HR", "SR"] as const;
const maxDocuments = z.number().int().positive().optional();
export const discoverySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("govinfo-record"),
    years: z.array(z.number().int().min(1789).max(9999)).min(1), maxDocuments,
  }).strict(),
  z.object({
    kind: z.literal("govinfo-billstatus"),
    congresses: z.array(z.number().int().min(1).max(999)).min(1),
    billTypes: z.array(z.enum(federalBillTypes)).min(1).optional(), maxDocuments,
  }).strict(),
  z.object({
    kind: z.literal("tlo-billhistory"),
    sessions: z.array(z.string().regex(/^(\d{2,3})(R|[1-9])$/).refine(
      (value) => Number(/^(\d{2,3})(R|[1-9])$/.exec(value)?.[1]) >= 71,
      "TLO bill history discovery supports sessions 71 and later",
    )).min(1),
    billTypes: z.array(z.enum(texasBillTypes)).min(1), maxDocuments,
  }).strict(),
  /** Clerk EVS roll XML uses zero-padded 3-digit names: roll001.xml … roll362.xml. */
  z.object({
    kind: z.literal("house-clerk-rolls"),
    year: z.number().int().min(1990).max(9999),
    fromRoll: z.number().int().min(1).max(2000).default(1),
    toRoll: z.number().int().min(1).max(2000),
    maxDocuments,
  }).strict().superRefine((value, ctx) => {
    if (value.toRoll < value.fromRoll) {
      ctx.addIssue({ code: "custom", message: "toRoll must be >= fromRoll" });
    }
  }),
  /** Official OAG opinions index links for one AG path (e.g. ken-paxton). */
  z.object({
    kind: z.literal("oag-opinion-index"),
    agPath: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    maxDocuments,
  }).strict(),
]);
export type DiscoverySpec = z.infer<typeof discoverySchema>;

export interface DiscoveryFtpClient {
  access(options: { host: string; secure: false }): Promise<unknown>;
  list(path: string): Promise<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }[]>;
  close(): void;
}
export interface DiscoveryOptions {
  ftpFactory?: () => DiscoveryFtpClient;
  sleep?: (ms: number) => Promise<unknown>;
}

const govinfo = "https://www.govinfo.gov";
const oagOpinions = "https://www.texasattorneygeneral.gov/opinions";
function officialUrl(value: string): URL {
  const url = new URL(value);
  if (url.origin !== govinfo || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid GovInfo inventory URL: ${value}`);
  }
  return url;
}

/**
 * Newest-first opinion documents from the official OAG opinions index.
 * Prefer the linked PDFs (printed date + full text); fall back to HTML pages.
 */
async function oagOpinionUrls(
  client: SnapshotClient,
  spec: Extract<DiscoverySpec, { kind: "oag-opinion-index" }>,
): Promise<string[]> {
  const snapshot = await client.get(oagOpinions, { format: "html" });
  const escaped = spec.agPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const htmlPattern = new RegExp(`href="(/opinions/${escaped}/([a-z0-9-]+))"`, "gi");
  const pdfById = new Map<string, string>();
  for (const match of snapshot.text.matchAll(
    /href="(\/sites\/default\/files\/opinion-files\/opinion\/\d{4}\/([a-z]+-\d+)\.pdf)"/gi,
  )) {
    pdfById.set(match[2].toLowerCase(), `https://www.texasattorneygeneral.gov${match[1]}`);
  }
  const scored: { url: string; n: number }[] = [];
  const seen = new Set<string>();
  let prefix = "";
  let width = 4;
  for (const match of snapshot.text.matchAll(htmlPattern)) {
    const id = match[2].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const parts = /^([a-z]+)-?(\d+)$/.exec(id);
    if (parts) { prefix = parts[1]; width = parts[2].length; }
    const num = Number(parts?.[2] ?? NaN);
    scored.push({
      url: pdfById.get(id) ?? `https://www.texasattorneygeneral.gov${match[1]}`,
      n: Number.isFinite(num) ? num : -1,
    });
  }
  const linked = scored.sort((a, b) => b.n - a.n || a.url.localeCompare(b.url));
  // The index only links the newest few opinions. Count down through the published
  // numeric series; each opinion page links its own official PDF.
  const newest = linked[0]?.n ?? 0;
  if (!prefix || newest < 1) return linked.map((row) => row.url);
  const limit = spec.maxDocuments ?? newest;
  const urls = linked.map((row) => row.url);
  const have = new Set(linked.map((row) => row.n));
  for (let n = newest; n >= 1 && urls.length < limit; n--) {
    if (have.has(n)) continue;
    const id = `${prefix}-${String(n).padStart(width, "0")}`;
    const page = `https://www.texasattorneygeneral.gov/opinions/${spec.agPath}/${id}`;
    try {
      const doc = await client.get(page, { format: "html" });
      // Take the page's own opinion PDF (request-files PDFs live elsewhere). The OAG site
      // has occasional filename typos (e.g. kp-05340.pdf), so match the directory, not the name.
      const pdf = /href="(\/sites\/default\/files\/opinion-files\/opinion\/\d{4}\/[^"/]+\.pdf)"/i.exec(doc.text);
      urls.push(pdf ? `https://www.texasattorneygeneral.gov${pdf[1]}` : page);
    } catch {
      // A missing/blocked page is skipped; coverage is reported as partial via maxDocuments/inventory size.
    }
  }
  return urls;
}

async function recordUrls(client: SnapshotClient, spec: Extract<DiscoverySpec, { kind: "govinfo-record" }>, window: DateWindow): Promise<string[]> {
  const urls: string[] = [];
  for (const year of [...new Set(spec.years)].sort((a, b) => a - b)) {
    if (`${year}-01-01` >= window.before || `${year}-12-31` < window.since) continue;
    const snapshot = await client.get(`${govinfo}/sitemap/CREC_${year}_sitemap.xml`, { format: "xml", root: "urlset" });
    const root = parseXml(snapshot.text, "urlset").urlset;
    const parsed = root === "" ? {} : z.record(z.string(), z.unknown()).parse(root);
    if (!("url" in parsed) && Object.keys(parsed).some((key) => !key.startsWith("@"))) {
      throw new Error("Invalid CREC sitemap inventory");
    }
    const entries = !("url" in parsed) ? [] : Array.isArray(parsed.url) ? parsed.url : [parsed.url];
    for (const entry of entries) {
      const { loc } = z.object({ loc: z.string().min(1) }).parse(entry);
      const match = /^\/app\/details\/CREC-(\d{4}-\d{2}-\d{2})$/.exec(officialUrl(loc).pathname);
      if (!match || !isISODate(match[1]) || Number(match[1].slice(0, 4)) !== year) {
        throw new Error(`Invalid CREC package URL for ${year}: ${loc}`);
      }
      // lastmod is an index update, NOT the day on which Congress acted.
      if (inWindow(match[1], window)) urls.push(`${govinfo}/metadata/pkg/CREC-${match[1]}/mods.xml`);
    }
  }
  return urls;
}

const billInventory = z.object({ files: z.array(z.object({
  name: z.string(), folder: z.boolean(), link: z.string().optional(),
})) });
async function billUrls(client: SnapshotClient, spec: Extract<DiscoverySpec, { kind: "govinfo-billstatus" }>): Promise<string[]> {
  const urls: string[] = [];
  for (const congress of [...new Set(spec.congresses)].sort((a, b) => a - b)) {
    for (const type of [...new Set(spec.billTypes ?? federalBillTypes)].sort()) {
      const snapshot = await client.get(`${govinfo}/bulkdata/json/BILLSTATUS/${congress}/${type}`, { format: "json" });
      const inventory = billInventory.parse(JSON.parse(snapshot.text));
      for (const file of inventory.files) {
        if (file.folder || /\.zip$/i.test(file.name)) continue;
        if (!new RegExp(`^BILLSTATUS-${congress}${type}[1-9]\\d*\\.xml$`).test(file.name)) {
          if (/\.xml$/i.test(file.name)) throw new Error(`Invalid BILLSTATUS filename: ${file.name}`);
          continue;
        }
        const url = officialUrl(z.string().parse(file.link));
        if (url.pathname !== `/bulkdata/BILLSTATUS/${congress}/${type}/${file.name}`) {
          throw new Error(`Invalid BILLSTATUS inventory path: ${file.link}`);
        }
        urls.push(url.href);
      }
    }
  }
  return urls;
}

const texasDirectories: Record<typeof texasBillTypes[number], string> = {
  HB: "house_bills", SB: "senate_bills", HJR: "house_joint_resolutions", SJR: "senate_joint_resolutions",
  HCR: "house_concurrent_resolutions", SCR: "senate_concurrent_resolutions", HR: "house_resolutions", SR: "senate_resolutions",
};
async function texasUrls(spec: Extract<DiscoverySpec, { kind: "tlo-billhistory" }>, options: DiscoveryOptions): Promise<string[]> {
  const ftp = options.ftpFactory?.() ?? new Client(30_000);
  const sleep = options.sleep ?? delay;
  const urls: string[] = [];
  // LIST inventories are not source evidence and are not persisted by SnapshotClient.
  // Reuse mode therefore enumerates FTP again; offline requires a saved URL plan.
  const list = async (path: string) => {
    try { return await ftp.list(path); }
    finally { await sleep(500); }
  };
  try {
    await ftp.access({ host: "ftp.legis.state.tx.us", secure: false });
    for (const session of [...new Set(spec.sessions)].sort()) {
      for (const type of [...new Set(spec.billTypes)].sort()) {
        const root = `/bills/${session}/billhistory/${texasDirectories[type]}`;
        const groups = await list(root);
        for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
          if (!group.isDirectory || group.isSymbolicLink || !new RegExp(`^${type}\\d+_${type}\\d+$`).test(group.name)) continue;
          const path = `${root}/${group.name}`;
          for (const file of await list(path)) {
            if (!file.isFile || file.isSymbolicLink || !new RegExp(`^${type} *[0-9]+\\.xml$`, "i").test(file.name)) continue;
            urls.push(`ftp://ftp.legis.state.tx.us${path}/${encodeURIComponent(file.name)}`);
          }
        }
      }
    }
    return urls;
  } finally { ftp.close(); }
}

/** Generate Clerk EVS roll XML URLs for a closed roll range (no network). */
function houseClerkRollUrls(
  spec: Extract<DiscoverySpec, { kind: "house-clerk-rolls" }>,
  window: DateWindow,
): string[] {
  // Year filter only — individual roll dates are applied by the adapter.
  if (`${spec.year}-12-31` < window.since || `${spec.year}-01-01` >= window.before) return [];
  const urls: string[] = [];
  for (let roll = spec.fromRoll; roll <= spec.toRoll; roll++) {
    urls.push(`https://clerk.house.gov/evs/${spec.year}/roll${String(roll).padStart(3, "0")}.xml`);
  }
  return urls;
}

/** Enumerates only explicitly configured published inventories, not a lifetime record.
 * Bill index dates are not action dates: the document parsers apply the date window. */
export async function discoverRecordUrls(
  client: SnapshotClient, spec: DiscoverySpec, window: DateWindow, options: DiscoveryOptions = {},
): Promise<{ urls: string[]; status: "complete" | "partial"; reason: string }> {
  spec = discoverySchema.parse(spec);
  if (!isISODate(window.since) || !isISODate(window.before) || window.since >= window.before) throw new Error("Invalid discovery date window");
  if (spec.kind === "tlo-billhistory" && client.cacheMode === "offline") {
    throw new Error("TLO FTP discovery requires an explicit saved URLs plan in offline mode");
  }
  const found = spec.kind === "govinfo-record" ? await recordUrls(client, spec, window)
    : spec.kind === "govinfo-billstatus" ? await billUrls(client, spec)
    : spec.kind === "house-clerk-rolls" ? houseClerkRollUrls(spec, window)
    : spec.kind === "oag-opinion-index" ? await oagOpinionUrls(client, spec)
    : await texasUrls(spec, options);
  // OAG opinions stay newest-first; other inventories stay lexicographically sorted.
  const urls = spec.kind === "oag-opinion-index" ? [...new Set(found)] : [...new Set(found)].sort();
  if (spec.kind === "oag-opinion-index" && spec.maxDocuments !== undefined && urls.length >= spec.maxDocuments) {
    return { urls: urls.slice(0, spec.maxDocuments), status: "partial",
      reason: `Configured maxDocuments=${spec.maxDocuments} cap: collected the ${spec.maxDocuments} newest AG opinions; older opinions in the series were not collected.` };
  }
  if (spec.maxDocuments !== undefined && urls.length > spec.maxDocuments) {
    return { urls: urls.slice(0, spec.maxDocuments), status: "partial",
      reason: `Configured maxDocuments=${spec.maxDocuments} cap: returning ${spec.maxDocuments} of ${urls.length} discovered documents; remaining documents were not collected.` };
  }
  return { urls, status: "complete",
    reason: `Enumerated configured published ${spec.kind} inventories only (${urls.length} documents); not a claim of lifetime coverage.${spec.kind === "tlo-billhistory" ? " FTP inventories are enumerated again in reuse mode; offline requires an explicit saved URLs plan." : ""}` };
}
