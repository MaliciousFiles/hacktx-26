/**
 * Local records playground — name + race → full-history OfficialAction[]
 * for @ftb/pipeline. Not for production serving.
 *
 *   pnpm -F @ftb/records playground
 *   open http://127.0.0.1:4310
 */
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { researchCandidateHistory } from "./history";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.RECORDS_PLAYGROUND_PORT ?? 4310);
const host = process.env.RECORDS_PLAYGROUND_HOST ?? "127.0.0.1";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalBioguide = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().regex(/^[A-Z]\d{6}$/).optional(),
);
const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

const optionalCap = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const formSchema = z.object({
  name: z.string().trim().min(1),
  office: z.string().trim().min(1),
  jurisdiction: optionalText,
  district: optionalText,
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1789).max(9999),
  bioguide: optionalBioguide,
  aliases: optionalText,
  since: optionalDate,
  houseRollCap: optionalCap,
  documentCap: optionalCap,
  includeTloFtp: z.boolean().optional().default(false),
  offline: z.boolean().optional().default(false),
});

async function collect(body: unknown, onProgress?: (message: string) => void) {
  const form = formSchema.parse(body);
  const result = await researchCandidateHistory({
    name: form.name,
    office: form.office,
    jurisdiction: form.jurisdiction,
    district: form.district,
    month: form.month,
    year: form.year,
    bioguide: form.bioguide,
    aliases: form.aliases
      ? form.aliases.split(",").map((value) => value.trim()).filter(Boolean)
      : undefined,
    since: form.since,
    houseRollCap: form.houseRollCap,
    documentCap: form.documentCap,
    includeTloFtp: form.includeTloFtp,
    cacheDirectory: join(root, ".cache/playground"),
    cacheMode: form.offline ? "offline" : "reuse",
    congressApiKey: process.env.CONGRESS_GOV_API_KEY,
    onProgress,
  });

  return {
    pipelineFeed: {
      description: "OfficialAction[] handed to @ftb/pipeline (PIPELINE_INTEGRATION.md §2)",
      request: result.request,
      actions: result.actions,
    },
    research: {
      identityNotes: result.identityNotes,
      rationale: result.rationale,
      gaps: result.gaps,
      plan: result.plan,
    },
    diagnostics: {
      coverage: result.coverage,
      snapshots: result.snapshots,
      actionCount: result.actions.length,
    },
  };
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Candidate history → pipeline</title>
<style>
  :root {
    --bg: #0f1419; --panel: #1a222c; --ink: #e7ecf1; --muted: #8b9aab;
    --accent: #3d9a7a; --accent-dim: #2a6b55; --warn: #c4a35a; --border: #2c3845;
    --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
    --sans: "IBM Plex Sans", "Source Sans 3", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; color: var(--ink); font-family: var(--sans);
    background:
      radial-gradient(1200px 600px at 10% -10%, #1c3d34 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #243044 0%, transparent 50%),
      var(--bg);
  }
  main { max-width: 1100px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 650; letter-spacing: -0.02em; margin: 0 0 0.35rem; }
  .lede { color: var(--muted); margin: 0 0 1.75rem; max-width: 44rem; line-height: 1.45; }
  .grid { display: grid; gap: 1.25rem; grid-template-columns: minmax(280px, 360px) 1fr; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  form, .out {
    background: color-mix(in srgb, var(--panel) 92%, black);
    border: 1px solid var(--border); border-radius: 12px; padding: 1.1rem 1.15rem;
  }
  label { display: block; font-size: 0.78rem; color: var(--muted); margin: 0.65rem 0 0.25rem; }
  label:first-child { margin-top: 0; }
  input, select {
    width: 100%; background: #0c1117; color: var(--ink);
    border: 1px solid var(--border); border-radius: 8px;
    padding: 0.55rem 0.65rem; font: inherit;
  }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  button.go {
    margin-top: 1rem; width: 100%; border: 0; border-radius: 8px;
    padding: 0.7rem 1rem; font: inherit; font-weight: 600; cursor: pointer;
    background: linear-gradient(180deg, var(--accent), var(--accent-dim)); color: #f4fffa;
  }
  button.go:disabled { opacity: 0.55; cursor: wait; }
  .tabs { display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .tabs button {
    width: auto; margin: 0; padding: 0.35rem 0.7rem; font-size: 0.8rem; font-weight: 500;
    background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
  }
  .tabs button.active { color: var(--ink); border-color: var(--accent); background: #14352c; }
  pre {
    margin: 0; overflow: auto; max-height: min(70vh, 820px);
    font-family: var(--mono); font-size: 0.75rem; line-height: 1.45;
    white-space: pre-wrap; word-break: break-word;
  }
  .meta { color: var(--muted); font-size: 0.8rem; margin-bottom: 0.75rem; }
  .meta strong { color: var(--warn); font-weight: 600; }
  .err { color: #f0a8a8; white-space: pre-wrap; font-family: var(--mono); font-size: 0.8rem; }
  .check { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.75rem; color: var(--muted); font-size: 0.85rem; }
  .check input { width: auto; }
  details { margin-top: 0.75rem; color: var(--muted); font-size: 0.85rem; }
  hint { display: block; font-size: 0.72rem; color: var(--muted); margin-top: 0.2rem; opacity: 0.9; }
</style>
</head>
<body>
<main>
  <h1>Candidate history → pipeline</h1>
  <p class="lede">
    Enter the person and the <em>race they are running in</em>. Records auto-plans prior-office
    sources (House rolls, Senate CREC, TLO, Austin Socrata, …), resolves identity when possible,
    and returns the <code>OfficialAction[]</code> feed for <code>@ftb/pipeline</code>.
    District is only for districted races — leave blank for Senate / statewide.
  </p>
  <div class="grid">
    <form id="f">
      <label>Candidate name</label>
      <input name="name" required placeholder="e.g. Ken Paxton"/>
      <label>Race they're running in (office sought)</label>
      <input name="office" required list="offices" placeholder="e.g. us_senate"/>
      <datalist id="offices">
        <option value="us_house"/><option value="us_senate"/><option value="tx_house"/>
        <option value="tx_senate"/><option value="tx_ag"/><option value="governor"/>
        <option value="city_council"/><option value="school_board"/>
      </datalist>
      <hint>Race sought sets the election cutoff only. History probes every supported office family (House, Senate, TX legislature, AG, local, …).</hint>
      <div class="row">
        <div>
          <label>Jurisdiction (optional)</label>
          <input name="jurisdiction" placeholder="e.g. us/tx"/>
        </div>
        <div>
          <label>District (optional)</label>
          <input name="district" placeholder="blank if statewide"/>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Election month</label>
          <input name="month" type="number" min="1" max="12" required/>
        </div>
        <div>
          <label>Election year</label>
          <input name="year" type="number" min="1789" required/>
        </div>
      </div>
      <details>
        <summary>Optional overrides</summary>
        <label>Bioguide (if already known)</label>
        <input name="bioguide" placeholder="C001131"/>
        <label>Aliases (comma-separated)</label>
        <input name="aliases"/>
        <label>History since (YYYY-MM-DD)</label>
        <input name="since" placeholder="defaults to plan window"/>
        <label>House roll cap / year</label>
        <input name="houseRollCap" type="number" min="5" max="400"/>
        <label>Document cap (BILLSTATUS / CREC / OAG)</label>
        <input name="documentCap" type="number" min="3" max="80"/>
        <label class="check"><input type="checkbox" name="includeTloFtp"/> Include TLO FTP (slow)</label>
        <label class="check"><input type="checkbox" name="offline"/> Offline cache only</label>
      </details>
      <button class="go" type="submit" id="go">Research official history</button>
    </form>
    <section class="out">
      <div class="tabs">
        <button type="button" class="active" data-tab="feed">Pipeline feed</button>
        <button type="button" data-tab="actions">Actions</button>
        <button type="button" data-tab="plan">Plan / gaps</button>
        <button type="button" data-tab="diag">Coverage</button>
      </div>
      <div class="meta" id="meta">Submit to auto-plan sources and collect.</div>
      <pre id="view"></pre>
      <div class="err" id="err"></div>
    </section>
  </div>
</main>
<script>
  let last = null;
  let tab = "feed";
  const view = document.getElementById("view");
  const meta = document.getElementById("meta");
  const err = document.getElementById("err");
  const go = document.getElementById("go");

  function render() {
    if (!last) return;
    err.textContent = "";
    const { pipelineFeed, research, diagnostics } = last;
    meta.innerHTML = "<strong>" + diagnostics.actionCount + "</strong> OfficialAction(s) · "
      + research.gaps.length + " known gap(s) · identity: " + (research.identityNotes[0] || "");
    if (tab === "feed") view.textContent = JSON.stringify(pipelineFeed, null, 2);
    else if (tab === "actions") view.textContent = JSON.stringify(pipelineFeed.actions, null, 2);
    else if (tab === "plan") view.textContent = JSON.stringify({
      identityNotes: research.identityNotes,
      rationale: research.rationale,
      gaps: research.gaps,
      plan: research.plan,
    }, null, 2);
    else view.textContent = JSON.stringify({ coverage: diagnostics.coverage, snapshots: diagnostics.snapshots }, null, 2);
  }

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    go.disabled = true;
    meta.textContent = "Starting…";
    view.textContent = "";
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.offline = fd.get("offline") === "on";
    body.includeTloFtp = fd.get("includeTloFtp") === "on";
    const started = Date.now();
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "progress") {
            const sec = ((Date.now() - started) / 1000).toFixed(1);
            meta.textContent = sec + "s · " + event.message;
          } else if (event.type === "result") {
            last = event.payload;
            render();
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      if (!last) throw new Error("Stream ended without a result");
    } catch (ex) {
      err.textContent = String(ex.message || ex);
      meta.textContent = "Failed";
    } finally {
      go.disabled = false;
    }
  });
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/?"))) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (req.method === "POST" && (req.url === "/api/history" || req.url === "/api/collect")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const wantStream = (req.headers.accept ?? "").includes("ndjson");
      if (wantStream) {
        res.writeHead(200, {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-cache",
        });
        const write = (event: unknown) => {
          res.write(`${JSON.stringify(event)}\n`);
        };
        try {
          const result = await collect(body, (message) => {
            console.log(`[history] ${message}`);
            write({ type: "progress", message });
          });
          write({ type: "result", payload: result });
        } catch (error) {
          write({ type: "error", error: error instanceof Error ? error.message : "Playground error" });
        }
        res.end();
        return;
      }
      const result = await collect(body, (message) => console.log(`[history] ${message}`));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result, null, 2));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playground error";
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, host, () => {
  console.log(`History playground → http://${host}:${port}`);
  console.log("POST name + race → auto plan → OfficialAction[] for @ftb/pipeline");
});
