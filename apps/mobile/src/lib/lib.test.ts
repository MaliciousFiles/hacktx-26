import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CandidateIdentity, CandidateProfile, Plan, Slot } from "@ftb/types";
import { describe, expect, it } from "vitest";
import { buildUrl, createApiClient } from "./apiClient";
import { CAST, dealMasks } from "./masks";
import type { ContestPick } from "./picks";
import { surpriseStats } from "./surprise";
import { unansweredQuestions } from "./unanswered";

describe("buildUrl", () => {
  it("builds allowlisted requests", () => {
    expect(buildUrl("https://api.test/", "/ballot", { ballotStyleId: "s1", releaseId: "r1" })).toBe(
      "https://api.test/ballot?ballotStyleId=s1&releaseId=r1",
    );
    expect(buildUrl("https://api.test", "/reveal/contest-a", { releaseId: "r1" })).toBe(
      "https://api.test/reveal/contest-a?releaseId=r1",
    );
  });

  it("rejects extra query keys, so choices cannot ride along", () => {
    expect(() =>
      buildUrl("https://api.test", "/ballot", {
        ballotStyleId: "s1",
        releaseId: "r1",
        swipes: "a,b",
      }),
    ).toThrow(/not allowed/);
    expect(() =>
      buildUrl("https://api.test", "/daily", { date: "2026-10-24", lat: "30.2" }),
    ).toThrow(/not allowed/);
  });

  it("rejects unknown paths, missing keys and unsafe segments", () => {
    expect(() => buildUrl("https://api.test", "/picks", {})).toThrow(/not allowed/);
    expect(() => buildUrl("https://api.test", "/ballot", { releaseId: "r1" })).toThrow(/Missing/);
    expect(() => buildUrl("https://api.test", "/reveal", { releaseId: "r1" })).toThrow(
      /not allowed/,
    );
    expect(() => buildUrl("https://api.test", "/reveal/a/b", { releaseId: "r1" })).toThrow();
    expect(() => buildUrl("https://api.test", "/reveal/a?x=1", { releaseId: "r1" })).toThrow();
  });

  it("client only calls allowlisted URLs", async () => {
    const urls: string[] = [];
    const api = createApiClient("https://api.test", async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await api.reveal("contest-a", "r1");
    await api.daily("2026-10-24");
    expect(urls).toEqual([
      "https://api.test/reveal/contest-a?releaseId=r1",
      "https://api.test/daily?date=2026-10-24",
    ]);
  });
});

describe("dealMasks", () => {
  const identity = <T>(items: readonly T[]) => [...items];
  const reverse = <T>(items: readonly T[]) => [...items].reverse();

  it("never repeats a mask within a contest", () => {
    const map = dealMasks([{ id: "c1", candidateIds: ["a", "b", "c"] }], identity);
    const characters = ["a", "b", "c"].map((id) => map[id]?.character);
    expect(new Set(characters).size).toBe(3);
  });

  it("depends only on the shuffle, not on candidate IDs", () => {
    const one = dealMasks([{ id: "c1", candidateIds: ["x", "y"] }], reverse);
    const two = dealMasks([{ id: "c1", candidateIds: ["zzz", "000"] }], reverse);
    expect(one.x).toEqual(two.zzz);
    expect(one.y).toEqual(two["000"]);
  });

  it("refuses a contest larger than the cast", () => {
    const ids = Array.from({ length: CAST.length + 1 }, (_, i) => `c${i}`);
    expect(() => dealMasks([{ id: "big", candidateIds: ids }], identity)).toThrow();
  });
});

describe("surpriseStats", () => {
  const contests = [
    { id: "c1", partisan: true },
    { id: "c2", partisan: true },
    { id: "c3", partisan: true },
    { id: "c4", partisan: false },
  ];
  const identities: Record<string, CandidateIdentity[]> = {
    c1: [{ id: "a", name: "A", party: "Gold" }],
    c2: [{ id: "b", name: "B", party: "Gold" }],
    c3: [{ id: "c", name: "C", party: "Green" }],
    c4: [{ id: "d", name: "D" }],
  };

  it("counts parties and the share outside the most-picked party", () => {
    const picks: Record<string, ContestPick> = {
      c1: { kind: "candidate", candidateId: "a" },
      c2: { kind: "candidate", candidateId: "b" },
      c3: { kind: "candidate", candidateId: "c" },
      c4: { kind: "candidate", candidateId: "d" },
    };
    expect(surpriseStats(contests, picks, identities)).toEqual({
      partisanPicks: 3,
      partyCount: 2,
      acrossAislePct: 33,
    });
  });

  it("returns nothing with fewer than two partisan picks", () => {
    const picks: Record<string, ContestPick> = {
      c1: { kind: "candidate", candidateId: "a" },
      c2: { kind: "undecided" },
      c4: { kind: "candidate", candidateId: "d" },
    };
    expect(surpriseStats(contests, picks, identities)).toBeNull();
  });
});

describe("unansweredQuestions", () => {
  const notStated: Slot = { state: "not_stated" };
  const stated: Slot = { state: "documented", sentences: [] };
  const plan = (cost: Slot): Plan => ({
    id: "p",
    issueId: "housing",
    goal: stated,
    mechanism: stated,
    cost,
    funding: notStated,
    timeline: stated,
    whoActs: stated,
    specificity: 0.5,
  });
  const profile = (id: string, plans: Plan[], evidence: Record<string, "sufficient" | "none">) =>
    ({ id, plans, issueEvidenceState: evidence }) as unknown as CandidateProfile;

  it("lists issues with no evidence from anyone and slots nobody filled", () => {
    const result = unansweredQuestions(
      [
        profile("a", [plan(stated)], { housing: "sufficient", transit: "none" }),
        profile("b", [plan(notStated)], { housing: "none" }),
      ],
      ["housing", "transit"],
    );
    expect(result.issues).toEqual(["transit"]);
    expect(result.slots).toEqual([{ issueId: "housing", slot: "funding" }]);
  });
});

describe("UI copy", () => {
  // UX.md §5: the app never tells anyone how to vote.
  const BANNED = [
    /\byou should vote\b/i,
    /\bbest match\b/i,
    /\bwinner\b/i,
    /\btop pick\b/i,
    /\bright answer\b/i,
    /\bcorrect choice\b/i,
    /\bwe recommend\b/i,
  ];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
    });
  }

  it("contains no banned phrases", () => {
    const root = join(__dirname, "..");
    const hits = sourceFiles(root).flatMap((file) => {
      const text = readFileSync(file, "utf-8");
      return BANNED.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(hits).toEqual([]);
  });
});
