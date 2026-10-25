import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sha256, type SnapshotClient } from "./fetch";
import type { Snapshot } from "./model";

const run = promisify(execFile);
let queue: Promise<unknown> = Promise.resolve();
const jobs = new Map<string, Promise<Awaited<ReturnType<typeof runReview>>>>();
const outputSchema = z.object({
  engine: z.literal("apple-vision-v1"), osVersion: z.string(), totalPages: z.number().int().positive(),
  pages: z.array(z.object({ page: z.number().int().positive(), lines: z.array(z.object({ text: z.string(), confidence: z.number().min(0).max(1) })) })),
});

/** Raw PDF stays immutable; OCR is a separately hashed, frozen review artifact.
 * OCR is NEVER returned as snapshot.text or automatically promoted into votes. */
export function reviewScannedPdf(client: SnapshotClient, snapshot: Snapshot, maxPages = 30) {
  const key = `${client.cacheDirectory}:${client.cacheMode}:${snapshot.contentHash}:${maxPages}`;
  const prior = jobs.get(key);
  if (prior) return prior;
  const job = queue.catch(() => undefined).then(() => runReview(client, snapshot, maxPages));
  queue = job;
  jobs.set(key, job);
  void job.finally(() => { jobs.delete(key); }).catch(() => undefined);
  return job;
}

async function runReview(client: SnapshotClient, snapshot: Snapshot, maxPages: number) {
  if (snapshot.format !== "pdf" || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100)
    throw new Error("OCR requires a PDF and a page budget of 1–100");
  const script = fileURLToPath(new URL("./pdf-review.swift", import.meta.url));
  const version = sha256(await readFile(script));
  const key = sha256(`${snapshot.contentHash}:${version}:${maxPages}`);
  const dir = join(client.cacheDirectory, "pdf-review");
  const target = join(dir, `${key}.json`);
  const validate = (raw: string) => {
    const envelope = z.object({ sourceHash: z.string(), scriptHash: z.string(), outputHash: z.string(), output: outputSchema }).parse(JSON.parse(raw));
    if (envelope.sourceHash !== snapshot.contentHash || envelope.scriptHash !== version ||
      sha256(JSON.stringify(envelope.output)) !== envelope.outputHash ||
      envelope.output.pages.some((page, index) => page.page !== index + 1) ||
      envelope.output.pages.length !== Math.min(envelope.output.totalPages, maxPages))
      throw new Error("OCR derivative integrity check failed");
    return { ...envelope, truncated: envelope.output.totalPages > maxPages };
  };
  try { return validate(await readFile(target, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (client.cacheMode === "offline") throw new Error("Offline OCR derivative missing; no OCR performed");
  if (process.platform !== "darwin") throw new Error("Local PDF OCR requires macOS PDFKit/Vision; scanned document retained for review");
  await mkdir(dir, { recursive: true });
  const temp = await mkdtemp(join(dir, "work-"));
  try {
    const input = join(temp, "input.pdf"), output = join(temp, "output.json");
    await writeFile(input, await client.bytes(snapshot));
    await run("swift", [script, input, output, String(maxPages)], { timeout: 180_000, maxBuffer: 2_000_000 });
    const parsed = outputSchema.parse(JSON.parse(await readFile(output, "utf8")));
    const raw = JSON.stringify({ sourceHash: snapshot.contentHash, scriptHash: version, outputHash: sha256(JSON.stringify(parsed)), output: parsed });
    await writeFile(target, raw, { flag: "wx" }).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
    return validate(await readFile(target, "utf8"));
  } finally { await rm(temp, { recursive: true, force: true }); }
}
