import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";

let version: Promise<string> | undefined;
/** A checkpoint from another parser implementation is never silently reused. */
export function recordsImplementationHash(): Promise<string> {
  return version ??= (async () => {
    const root = fileURLToPath(new URL("./", import.meta.url));
    const hash = createHash("sha256");
    for (const file of (await readdir(root, { recursive: true })).filter((f) => /\.(ts|swift)$/.test(f)).sort()) {
      hash.update(file); hash.update(await readFile(join(root, file)));
    }
    return hash.digest("hex");
  })();
}
