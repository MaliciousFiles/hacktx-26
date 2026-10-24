import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Evidence, OfficialAction } from "@ftb/types";
import type { HistoryResearchResult } from "@ftb/records";
import {
  actionToSource,
  classifyActions,
  collectCandidateRecords,
  mirrorDistribution,
  runRecordsStage,
  scoreDecision,
  targetFromContest,
  type ClassifyFn,
  type RecordsTarget,
} from "./records";

const target: RecordsTarget = targetFromContest(
  { id: "contest-1", office: "us_senate", districtId: "" },
  { id: "cand-1", name: "Ken Paxton" },
  "us/tx",
);

function action(over: Partial<OfficialAction> = {}): OfficialAction {
  return {
    id: "act-1",
    actorId: "cand-1",
    issueIds: [],
    role: "TX AG",
    type: "floor_vote",
    stance: "yes",
    date: "2024-05-01",
    title: "HB 1",
    officialText: "Ken Paxton voted on a bill to cut property taxes.",
    sourceUrl: "https://example.test/hb1",
    ...over,
  };
}

function research(actions: OfficialAction[], coverageStatus: "complete" | "partial" = "complete") {
  return async (): Promise<HistoryResearchResult> =>
    ({
      request: {
        candidate: target.candidate,
        position: { office: "us_senate", jurisdiction: "us/tx" },
        month: 11,
        year: 2026,
      },
      actions,
      plan: { sources: [] },
      rationale: [],
      gaps: [],
      coverage: [
        {
          source: "s",
          status: coverageStatus,
          reason: "r",
          actionCount: actions.length,
          since: "2015-01-01",
          before: "2026-11-01",
        },
      ],
      snapshots: [],
      identityNotes: [],
    }) as unknown as HistoryResearchResult;
}

describe("targetFromContest", () => {
  it("omits empty district and keeps the race sought", () => {
    expect(target).toEqual({
      contestId: "contest-1",
      office: "us_senate",
      jurisdiction: "us/tx",
      candidate: { id: "cand-1", name: "Ken Paxton" },
    });
  });
});

describe("scoreDecision", () => {
  it("scores yes/author as +1 and no as -1", () => {
    expect(scoreDecision(action({ stance: "yes" }))).toMatchObject({
      scorable: true,
      direction: 1,
    });
    expect(scoreDecision(action({ stance: "author", type: "authored" }))).toMatchObject({
      direction: 1,
    });
    expect(scoreDecision(action({ stance: "no" }))).toMatchObject({
      scorable: true,
      direction: -1,
    });
  });
  it("never scores advisory/non-personal acts, abstentions, n/a or consent", () => {
    expect(scoreDecision(action({ type: "legal_opinion", stance: "n/a" })).scorable).toBe(false);
    expect(scoreDecision(action({ type: "legal_opinion", stance: "yes" })).scorable).toBe(false);
    expect(scoreDecision(action({ type: "executive_order", stance: "n/a" })).scorable).toBe(false);
    expect(scoreDecision(action({ stance: "abstain" })).scorable).toBe(false);
    expect(scoreDecision(action({ stance: "n/a" })).scorable).toBe(false);
    expect(scoreDecision(action({ consent: true })).scorable).toBe(false);
  });
});

describe("actionToSource", () => {
  it("builds an official_action source attributed to the actor", () => {
    const s = actionToSource(action(), "contest-1");
    expect(s).toMatchObject({
      id: "src-act-1",
      type: "official_action",
      candidateId: "cand-1",
      url: "https://example.test/hb1",
      publishedAt: "2024-05-01",
      eventDate: { date: "2024-05-01", basis: "official_record", precision: "day" },
    });
    expect(s.originalText).toContain("HB 1");
    expect(s.originalText).toContain("cut property taxes");
  });
  it("does not label a document date as verified action timing", () => {
    expect(actionToSource(action({ dateBasis: "document_date" }), "contest-1").eventDate).toEqual({
      date: "2024-05-01",
      basis: "published",
      precision: "day",
    });
  });
});

describe("mirrorDistribution", () => {
  it("swaps poles and keeps neutral", () => {
    const d = mirrorDistribution({
      probs: { strong_negative: 0.7, neutral: 0.2, moderate_positive: 0.1 },
      confidence: 0.9,
    });
    expect(d.probs).toEqual({ strong_positive: 0.7, neutral: 0.2, moderate_negative: 0.1 });
    expect(d.confidence).toBe(0.9);
  });
});

describe("classifyActions", () => {
  const issue = { id: "economy.taxation", negativePole: "raise", positivePole: "cut" };
  const fake: ClassifyFn = async (input, source, candidateId, contestId, iss, actionId) => ({
    contestId,
    sourceId: source.id,
    actionId,
    candidateId,
    issueId: iss.id,
    kind: "action",
    sourceType: source.type,
    quote: input.text.slice(0, 20),
    position: 0.8,
    distribution: { probs: { strong_positive: 1 }, confidence: 0.9 },
    relevance: 1,
    isOwnSpeech: 0.9,
    claimType: "advocacy",
    claimTypeDist: { probs: {}, confidence: 0.9 },
    specificity: 0.5,
    withinAuthority: "direct",
  });
  const base = {
    contestId: "contest-1",
    candidateId: "cand-1",
    candidateNames: ["Ken Paxton"],
    issues: [issue],
    normalize: { mode: "names_only" as const, projectionVersion: "p1" },
    config: {} as never,
    classify: fake,
  };

  it("masks names, flips 'no' votes, and skips unscorable actions", async () => {
    const seen: string[] = [];
    const spy: ClassifyFn = async (input, ...rest) => {
      seen.push(input.text);
      return fake(input, ...rest);
    };
    const { evidence, notScored } = await classifyActions({
      ...base,
      classify: spy,
      actions: [
        action({ id: "yes", stance: "yes" }),
        action({ id: "no", stance: "no" }),
        action({ id: "opinion", type: "legal_opinion", stance: "n/a" }),
        action({ id: "other", actorId: "cand-2" }),
      ],
    });
    const byId = Object.fromEntries(evidence.map((e: Evidence) => [e.actionId, e]));
    expect(byId.yes?.position).toBe(0.8);
    expect(byId.no?.position).toBe(-0.8);
    expect(byId.no?.distribution.probs).toEqual({ strong_negative: 1 });
    expect(byId.yes).toMatchObject({
      kind: "action",
      eventDate: { date: "2024-05-01", basis: "official_record", precision: "day" },
      isOwnSpeech: 0,
    });
    expect(seen.every((t) => !t.includes("Paxton"))).toBe(true);
    expect(notScored).toEqual([
      { actionId: "opinion", reason: "type:legal_opinion" },
      { actionId: "other", reason: "actor_mismatch" },
    ]);
  });

  it("restricts to issueIds when records provide them", async () => {
    const { evidence } = await classifyActions({
      ...base,
      issues: [issue, { id: "other.issue", negativePole: "a", positivePole: "b" }],
      actions: [action({ issueIds: ["other.issue"] })],
    });
    expect(evidence.map((e) => e.issueId)).toEqual(["other.issue"]);
  });
});

describe("collectCandidateRecords", () => {
  it("returns sources and flags partial coverage as incomplete", async () => {
    const r = await collectCandidateRecords(
      target,
      { month: 11, year: 2026 },
      { research: research([action()], "partial") },
    );
    expect(r.actions).toHaveLength(1);
    expect(r.sources).toHaveLength(1);
    expect(r.incomplete).toBe(true);
  });

  it("drops actions for other actors", async () => {
    const r = await collectCandidateRecords(
      target,
      { month: 11, year: 2026 },
      {
        research: research([action(), action({ id: "x", actorId: "cand-2" })]),
      },
    );
    expect(r.actions.map((a) => a.id)).toEqual(["act-1"]);
    expect(r.incomplete).toBe(false);
  });

  it("records a failed lookup as incomplete instead of throwing", async () => {
    const r = await collectCandidateRecords(
      target,
      { month: 11, year: 2026 },
      {
        research: async () => {
          throw new Error("boom");
        },
      },
    );
    expect(r).toMatchObject({ actions: [], incomplete: true, error: "boom" });
  });

  it("passes the race sought and election date, no defaults invented", async () => {
    let seen: unknown;
    await collectCandidateRecords(
      target,
      { month: 11, year: 2026 },
      {
        research: async (input) => {
          seen = input;
          return research([])();
        },
      },
    );
    expect(seen).toEqual({
      name: "Ken Paxton",
      office: "us_senate",
      jurisdiction: "us/tx",
      month: 11,
      year: 2026,
      candidateId: "cand-1",
    });
  });
});

describe("runRecordsStage", () => {
  it("dedupes actions across sources and writes a records manifest", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "ftb-records-"));
    const dup = action();
    const result = await runRecordsStage(
      [target],
      { month: 11, year: 2026 },
      {
        outDir,
        gitSha: "abc",
        configVersions: {},
        options: {
          research: research([
            dup,
            { ...dup },
            action({ id: "act-2", type: "legal_opinion", stance: "n/a" }),
          ]),
        },
      },
    );
    expect(result.snapshot.manifest).toMatchObject({ actionsIn: 3, actionsOut: 2 });
    expect(result.manifest.candidates[0]).toMatchObject({
      actions: 3,
      scorable: 2,
      incomplete: false,
    });
    expect(readdirSync(join(outDir, "manifests")).some((f) => f.startsWith("records-"))).toBe(true);
  });
});
