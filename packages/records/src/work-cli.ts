import { parseArgs } from "node:util";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WorkJournal, type WorkState } from "./work";
import { CONNECTOR_CAPABILITIES, ROLE_FAMILIES } from "./capabilities";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  directory: { type: "string" }, scope: { type: "string" }, states: { type: "string", default: "retry_wait,failed" },
  details: { type: "boolean", default: false },
} });
const command = positionals[0] ?? "status";
if (command === "capabilities") console.log(JSON.stringify({ connectors: CONNECTOR_CAPABILITIES, roles: ROLE_FAMILIES, note: "Declared coverage limitations are not a completeness certificate" }, null, 2));
else {
  if (!values.directory) throw new Error("Use --directory <records-cache/work or web-cache/work>");
  const directory = resolve(values.directory);
  await access(join(directory, "work.sqlite")); // A typo must not create a misleading empty queue.
  const journal = new WorkJournal(directory);
  try {
    if (command === "retry") {
      const states = values.states.split(",") as WorkState[];
      if (states.some((s) => !["retry_wait", "failed", "blocked", "missing"].includes(s))) throw new Error("Retry states: retry_wait,failed,blocked,missing only; running leases cannot be reset");
      console.log(JSON.stringify({ reset: journal.retry(states, values.scope), note: "Rerun the same connector/history job to reconstruct credentials and postbacks. Frozen pipeline releases need a new release ID; never overwrite frozen error snapshots." }, null, 2));
    } else if (command === "status") {
      const rows = journal.rows(values.scope);
      console.log(JSON.stringify({ directory, counts: journal.counts(values.scope),
        ...(values.details ? { tasks: rows.map(({ key, kind, scope, state, attempts, nextAt, leaseUntil, reason, payload }) => ({ key, kind, scope, state, attempts, nextAt, leaseUntil, reason, payload })) } : {}),
        note: "Remaining includes blocked/failed/missing work; zero pending alone is not completion. Inventory unknown counts whole-history/role gaps. Request success only means fetched." }, null, 2));
    } else throw new Error("Commands: status, retry, capabilities");
  } finally { journal.close(); }
}
