import { describe, expect, it, vi } from "vitest";
import type { AdapterContext } from "../adapters";
import { sha256, type SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import { docketDateUrl, parseCourtRoster, parseDocketDay, txCourtOpinionsAdapter } from "./txcourts";

const roster = "<h2>Judge Kevin Yeary</h2><h2>Presiding Judge David Schenck</h2>";
const row = (label: string, id = "PD-0001-26") => `<tr class="rgRow"><td><a id="x_lnkCase" href="#">${id}</a></td><td><table class="docGrid"><tr><td>${label}</td></tr></table></td><td class="caseStyle">State v. Example<br>Trial court</td><td class="caseDisp">Affirmed</td><td>Yeary<br>Schenck</td></tr>`;
const day = (...labels: string[]) => `<h2>Released Orders &amp; Opinions for 10/07/2026</h2><table>${labels.map((label, i) => row(label, `PD-000${i}-26`)).join("")}</table>`;

function context(options: { roster?: string; day?: string; failQuarter?: boolean; failDay?: boolean } = {}) {
  const get = vi.fn(async (url: string, config: { format: string; form?: Record<string, string> }): Promise<Snapshot> => {
    let text: string;
    if (url.includes("/judges/")) text = options.roster ?? roster;
    else if (url.includes("DocketSrch")) {
      if (config.form && options.failQuarter) throw new Error("offline");
      text = config.form ? '<a href="Docket.aspx?FullDate=10/07/2026">October 7</a>' : '<input name="__VIEWSTATE" value="fixture" />';
    } else {
      if (options.failDay) throw new Error("offline");
      text = options.day ?? day("Original by JUDGE YEARY", "Dissenting Opinion by Judge Yeary", "Concurring Opinion by Judge Schenck");
    }
    return { id: sha256(url + text), sourceUrl: url, fetchedAt: "2026-10-25T00:00:00Z", contentHash: sha256(text), format: "html", text };
  });
  const ctx: AdapterContext = {
    request: { candidate: { id: "yeary", name: "Kevin Yeary" }, position: { office: "judge", jurisdiction: "us/tx" }, month: 11, year: 2026 },
    window: { since: "2026-10-01", before: "2026-11-01" },
    client: { get } as unknown as SnapshotClient,
  };
  return { ctx, get };
}

describe("Texas appellate court discovery", () => {
  it("parses roster names and CCA original/dissent/concurrence labels", () => {
    expect(parseCourtRoster(roster).map((m) => m.name)).toEqual(["Kevin Yeary", "David Schenck"]);
    const rows = parseDocketDay(day("Original by JUDGE YEARY", "Concurring and Dissenting Opinion by Judge Yeary"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ caseNumber: "PD-0000-26", style: "State v. Example", documents: [{ kind: "majority", authorLabel: "YEARY" }] });
    expect(rows[1]!.documents[0]!.kind).toBe("concur_dissent");
  });

  it("emits only attributed written opinions with roster and docket provenance", async () => {
    const { ctx, get } = context();
    const result = await txCourtOpinionsAdapter.collect(ctx, { courts: ["coscca"] });
    expect(result.status).toBe("partial");
    expect(result.actions).toHaveLength(2);
    expect(result.actions.every((a) => a.type === "judicial_opinion" && a.date === "2026-10-07" && a.provenance?.length === 2)).toBe(true);
    expect(new Set(result.actions.map((a) => a.stance))).toEqual(new Set(["author", "no"]));
    expect(get.mock.calls.filter(([url]) => url === docketDateUrl("coscca", "10/07/2026"))).toHaveLength(1);
  });

  it("abstains when surname identity is ambiguous, or only panel membership exists", async () => {
    const ambiguous = context({ roster: `${roster}<h2>Judge Another Yeary</h2>` });
    expect((await txCourtOpinionsAdapter.collect(ambiguous.ctx, { courts: ["coscca"] })).actions).toEqual([]);
    const panel = context({ day: day("Per Curiam Opinion") });
    expect((await txCourtOpinionsAdapter.collect(panel.ctx, { courts: ["coscca"] })).actions).toEqual([]);
  });

  it("reports failed inventories and day fetches instead of silently dropping them", async () => {
    const inventory = context({ failQuarter: true });
    const result = await txCourtOpinionsAdapter.collect(inventory.ctx, { courts: ["coscca"] });
    expect(result.reason).toContain("4 failed quarter inventory");
    const unavailable = context({ failDay: true });
    expect((await txCourtOpinionsAdapter.collect(unavailable.ctx, { courts: ["coscca"] })).reason).toContain("1 failed day request");
  });

  it("rejects wrong or absent day headings and discloses action budgets", async () => {
    const wrong = context({ day: day("Original by Judge Yeary").replace("10/07/2026", "10/08/2026") });
    const result = await txCourtOpinionsAdapter.collect(wrong.ctx, { courts: ["coscca"] });
    expect(result.actions).toEqual([]);
    expect(result.reason).toContain("1 missing/mismatched");
    const limited = await txCourtOpinionsAdapter.collect(context().ctx, { courts: ["coscca"], maxActions: 1 });
    expect(limited.actions).toHaveLength(1);
    expect(limited.reason).toContain("budget 1 reached");
  });
});
