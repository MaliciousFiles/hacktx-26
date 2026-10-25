import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotClient, sha256 } from "./fetch";
import { reviewScannedPdf } from "./pdf-review";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "records-pdf-review-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

/** A valid one-page PDF without a text layer, not HTML pretending to be PDF. */
function blankPdf() {
  let body = "%PDF-1.4\n";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Count 1 /Kids [3 0 R] >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>"];
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = body.length;
  body += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe("unreviewed scanned PDF archive", () => {
  it("archives original bytes only when explicitly opted in and rejects empty native evidence", async () => {
    const bytes = blankPdf();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(bytes));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch });
    const snapshot = await client.get("https://example.gov/scanned.pdf", { format: "pdf", allowEmptyPdf: true });
    expect(snapshot.text).toBe("");
    expect(snapshot.contentHash).toBe(sha256(bytes));
    expect(await client.bytes(snapshot)).toEqual(bytes);
    const offline = new SnapshotClient({ directory, mode: "offline", fetch });
    expect(await offline.get("https://example.gov/scanned.pdf", { format: "pdf", allowEmptyPdf: true })).toEqual(snapshot);
    await expect(offline.get("https://example.gov/scanned.pdf", { format: "pdf" })).rejects.toThrow("no extractable text");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("replays separately hashed OCR without changing the raw snapshot or doing work offline", async () => {
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: async () => new Response(blankPdf()) });
    const snapshot = await client.get("https://example.gov/scanned.pdf", { format: "pdf", allowEmptyPdf: true });
    const scriptHash = sha256(await readFile(fileURLToPath(new URL("./pdf-review.swift", import.meta.url))));
    const output = { engine: "apple-vision-v1", osVersion: "fixture", totalPages: 2, pages: [{ page: 1, lines: [{ text: "Possible text", confidence: 0.8 }] }] };
    const key = sha256(`${snapshot.contentHash}:${scriptHash}:1`);
    const dir = join(directory, "pdf-review");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${key}.json`), JSON.stringify({ sourceHash: snapshot.contentHash, scriptHash, outputHash: sha256(JSON.stringify(output)), output }));
    const offline = new SnapshotClient({ directory, mode: "offline" });
    const result = await reviewScannedPdf(offline, snapshot, 1);
    expect(result.truncated).toBe(true);
    expect(result.output.pages[0].lines[0].text).toBe("Possible text");
    expect((await offline.read(snapshot.id)).text).toBe("");
    await expect(reviewScannedPdf(offline, snapshot, 2)).rejects.toThrow("Offline OCR derivative missing");
    await writeFile(join(dir, `${key}.json`), JSON.stringify({ sourceHash: snapshot.contentHash, scriptHash, outputHash: "bad", output }));
    await expect(reviewScannedPdf(offline, snapshot, 1)).rejects.toThrow("integrity");
  });
});
