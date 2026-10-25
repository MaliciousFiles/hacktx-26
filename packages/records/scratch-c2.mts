import { SnapshotClient } from "./src/fetch";
import { govinfoCrecAdapter } from "./src/federal/govinfo-crec";
const client = new SnapshotClient({ directory: "/tmp/rcache", mode: "reuse", intervalMs: 250 });
const request: any = { candidate: { id: "c1", name: "X", identifiers: { bioguide: "C001098" } }, position: { office: "us_senate", jurisdiction: "us/tx", district: "TX" }, month: 11, year: 2026 };
const days: string[] = [];
for (let m = 1; m <= 12; m++) for (const d of [3, 10, 17, 24]) days.push(`2024-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
let total = 0, fail = 0;
for (const d of days) {
  const url = `https://www.govinfo.gov/metadata/pkg/CREC-${d}/mods.xml`;
  try {
    const r = await govinfoCrecAdapter.collect({ request, window: { since: "2003-01-01", before: "2026-11-01" }, client } as any, { urls: [url], role: "U.S. Senate" });
    total += r.actions.length;
    if (r.status === "needs_review" || r.status === "unavailable") { fail++; console.log(d, r.status, r.reason.slice(0, 300)); }
  } catch (e: any) { fail++; console.log(d, "THROW", String(e.message).slice(0, 300)); }
}
console.log({ days: days.length, total, fail });
