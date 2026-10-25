import { SnapshotClient } from "./src/fetch";
import { govinfoCrecAdapter } from "./src/federal/govinfo-crec";
const client = new SnapshotClient({ directory: "/tmp/rcache", mode: "reuse", intervalMs: 400 });
const bio = process.argv[2];
const dates = process.argv.slice(3);
const request: any = { candidate: { id: "c1", name: "X", identifiers: { bioguide: bio } }, position: { office: "us_house", jurisdiction: "us/tx", district: "37" }, month: 11, year: 2026 };
for (const d of dates) {
  const url = `https://www.govinfo.gov/metadata/pkg/CREC-${d}/mods.xml`;
  try {
    const r = await govinfoCrecAdapter.collect({ request, window: { since: "2003-01-01", before: "2026-11-01" }, client } as any, { urls: [url], role: "U.S. House" });
    console.log(d, r.status, r.actions.length, r.reason.slice(0, 400));
  } catch (e: any) { console.log(d, "THROW", String(e.message).slice(0, 300)); }
}
