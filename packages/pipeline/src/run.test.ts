import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FrozenWebClient, hash } from "@ftb/scraping";
import { ballotRunSchema, runBallotPipeline, type BallotRunOptions } from "./run.js";
import { publishRelease, type PublishPayload } from "./publish.js";
import { aggregateCandidate } from "./aggregate.js";
import type { Evidence, Source } from "@ftb/types";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ftb-batch-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const person = (id: string) => ({
  id,
  name: `Person ${id}`,
  incumbent: false,
  recordInOffice: "none",
});
function input() {
  return ballotRunSchema.parse({
    releaseId: "batch-test-v1",
    asOfDate: "2026-10-24",
    campaignWindow: { since: "2025-11-08", until: "2026-11-03" },
    election: { month: 11, year: 2026 },
    demo: true,
    ballot: {
      id: "ballot-fixture",
      ballotStyleId: "official-style-preserved",
      provenance: {
        url: "https://fixture.example/official-ballot",
        verifiedBy: "fixture-reviewer",
        verifiedAt: "2026-10-24",
      },
      contests: [
        {
          id: "leg",
          title: "State House District 1",
          office: "tx_house",
          officeKind: "legislative",
          level: "state",
          districtType: "tx_house",
          districtId: "1",
          jurisdiction: "us/tx",
          partisan: true,
          seats: 1,
          candidates: [person("alpha"), person("beta")],
        },
        {
          id: "jud",
          title: "District Court",
          office: "district_judge",
          officeKind: "judicial",
          level: "state",
          districtType: "district_court",
          districtId: "1",
          jurisdiction: "us/tx",
          partisan: true,
          seats: 1,
          candidates: [person("gamma"), person("delta")],
        },
        {
          id: "prop",
          title: "Proposition A",
          office: "measure",
          officeKind: "measure",
          level: "local",
          districtType: "city",
          districtId: "1",
          jurisdiction: "us/tx/city",
          partisan: false,
          seats: 1,
          candidates: [],
        },
      ],
    },
    web: { allowedPageHosts: [], speechDomains: [], campaignSites: [] },
  });
}
function options(): BallotRunOptions {
  const network = vi.fn<typeof fetch>();
  return {
    directory,
    gitSha: "test-sha",
    offline: true,
    policy: {
      version: "policy-v1",
      newsDomains: [],
      questionnaireDomains: [],
      versions: { sources: "test-v1" },
      issues: ["housing.zoning", "economy.taxation", "infrastructure.transit"].map((id) => ({
        id,
        negativePole: "Retain",
        positivePole: "Change",
        levels: ["state"],
      })),
    },
    client: new FrozenWebClient({
      directory: join(directory, "cache"),
      fetchedAt: "2026-10-24",
      allowedHosts: [],
      offline: true,
      fetch: network,
    }),
    collectRecords: vi.fn(async (target) => ({
      target,
      request: {
        candidate: target.candidate,
        position: { office: target.office, jurisdiction: target.jurisdiction },
        month: 11,
        year: 2026,
      },
      actions: [],
      sources: [],
      coverage: [],
      gaps: ["No records fixture"],
      identityNotes: [],
      incomplete: true,
    })),
    collectVoice: vi.fn(async () => ({
      sources: [],
      leads: [],
      quotes: [],
      coverage: [],
      provenance: [],
      duplicateSources: [],
    })),
  };
}
describe("one ballot-wide research/classification/publication job", () => {
  it("keeps model confidence separate from strength and counts reviewed events rather than duplicate mentions", () => {
    const evidence: Evidence = {
      id: "e1",
      sourceId: "s1",
      contestId: "c",
      candidateId: "p",
      issueId: "housing.zoning",
      kind: "voice",
      sourceType: "campaign_site",
      eventDate: { basis: "published", date: "2026-10-20", precision: "day" },
      quote: "An exact source quote",
      quoteSpan: { start: 0, end: 21 },
      position: 0.8,
      distribution: { probs: { strong_positive: 1 }, confidence: 0.8 },
      relevance: 1,
      isOwnSpeech: 1,
      claimType: "advocacy",
      claimTypeDist: { probs: { advocacy: 1 }, confidence: 1 },
      specificity: 0,
      withinAuthority: "influence",
    };
    const base = {
      candidateId: "p",
      contestId: "c",
      incumbent: false,
      recordInOffice: "none" as const,
      evidence: [evidence],
      actions: [],
      moneyFlows: [],
      entities: new Map(),
      asOfDate: "2026-10-24",
    };
    const original = aggregateCandidate(base);
    const confident = aggregateCandidate({
      ...base,
      evidence: [{ ...evidence, distribution: { ...evidence.distribution, confidence: 1 } }],
    });
    expect(original.stances["housing.zoning"]!.evidenceStrength).toBe(
      confident.stances["housing.zoning"]!.evidenceStrength,
    );
    const duplicate = aggregateCandidate({
      ...base,
      evidence: [evidence, { ...evidence, id: "e2", sourceId: "s2" }],
      eventIds: { e1: "one-event", e2: "one-event" },
    });
    expect(duplicate.issueEvidenceState["housing.zoning"]).toBe("thin");
  });
  it("attempts every candidate, retains judges/measures, and preserves the official style with honest abstention", async () => {
    const config = input(),
      deps = options();
    const result = await runBallotPipeline(config, deps);
    expect(deps.collectRecords).toHaveBeenCalledTimes(4);
    expect(deps.collectVoice).toHaveBeenCalledTimes(4);
    expect(result.contests).toBe(3);
    expect(result.candidates).toBe(4);
    expect(result.objectiveOnly).toBe(4);
    expect(result.full).toBe(0);
    const payload = JSON.parse(await readFile(result.publication, "utf8"));
    expect(payload.ballot.ballotStyleId).toBe("official-style-preserved");
    expect(payload.ballot.contestIds).toEqual(["leg", "jud", "prop"]);
    expect(
      payload.candidates.every(
        (candidate: { stances: object }) => Object.keys(candidate.stances).length === 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("Person alpha");
    const reveal = JSON.parse(
      await readFile(join(directory, config.releaseId, "reveal.json"), "utf8"),
    );
    expect(reveal.identities).toHaveLength(4);
    expect(reveal.manifestHash).toBe(result.manifestHash);
    expect(
      result.contestCoverage.find((row) => row.contestId === "prop")!.gaps.length,
    ).toBeGreaterThan(0);
    const bytes = await readFile(result.publication, "utf8");
    expect(await runBallotPipeline(config, deps)).toEqual(result);
    expect(await readFile(result.publication, "utf8")).toBe(bytes);
  });
  it("refuses duplicate roster IDs, unverified production provenance and changed release inputs", async () => {
    const config = input(),
      deps = options();
    await expect(runBallotPipeline({ ...config, demo: false }, deps)).rejects.toThrow(
      "official government",
    );
    const duplicate = structuredClone(config);
    duplicate.ballot.contests[1]!.id = "leg";
    await expect(runBallotPipeline(duplicate, deps)).rejects.toThrow("Duplicate contest");
    await runBallotPipeline(config, deps);
    await expect(runBallotPipeline({ ...config, asOfDate: "2026-10-25" }, deps)).rejects.toThrow(
      "different inputs",
    );
  });
  it("connects approved exact spans through masked classification, aggregation, validation and publication", async () => {
    const config = input(),
      deps = options();
    config.analysis = {
      mode: "names_and_party",
      projectionVersion: "evaluated-v1",
      approvedBy: "reviewer",
      evaluationHash: "a".repeat(64),
      rubricVersion: "rubric-v1",
      jevModelVersion: "jev-1.14.0",
      maxCallsPerCandidate: 6,
      lowConfidenceThreshold: 0.8,
      fallbackEvaluated: false,
    };
    const source = (candidateId: string, ordinal: number): Source => {
      const originalText = `Person ${candidateId} states a distinct policy proposal number ${ordinal}: allow more homes and change taxes and transit policy.`;
      return {
        id: `src-${candidateId}-${ordinal}`,
        contestId: "leg",
        candidateId,
        type: "campaign_site",
        url: `https://${candidateId}.example/policy-${ordinal}`,
        originalText,
        text: originalText,
        contentHash: hash(originalText),
        fetchedAt: config.asOfDate,
        eventDate: { basis: "page_observed", date: config.asOfDate, precision: "day" },
      };
    };
    for (const candidateId of ["alpha", "beta"])
      for (const ordinal of [1, 2]) {
        const item = source(candidateId, ordinal);
        config.attributions.push({
          sourceId: item.id,
          candidateId,
          contentHash: item.contentHash,
          start: 0,
          end: item.originalText.length,
          approvedBy: "reviewer",
          eventId: `reviewed-distinct-event-${ordinal}`,
        });
      }
    deps.collectVoice = vi.fn(async (target) => ({
      sources:
        target.contestId === "leg"
          ? [source(target.request.candidate.id, 1), source(target.request.candidate.id, 2)]
          : [],
      leads: [],
      quotes: [],
      coverage: [],
      provenance: [],
      duplicateSources: [],
    }));
    const seen: string[] = [];
    deps.classify = vi.fn<NonNullable<BallotRunOptions["classify"]>>(
      async (projection, view, candidateId, contestId, issue, actionId) => {
        seen.push(projection.text);
        return {
          sourceId: view.id,
          candidateId,
          contestId,
          issueId: issue.id,
          actionId,
          kind: "voice",
          sourceType: view.type,
          quote: view.originalText,
          position: 0.8,
          distribution: { probs: { strong_positive: 1 }, confidence: 1 },
          relevance: 1,
          isOwnSpeech: 1,
          claimType: "advocacy",
          claimTypeDist: { probs: { advocacy: 1 }, confidence: 1 },
          specificity: 1,
          withinAuthority: "influence",
        };
      },
    );
    const result = await runBallotPipeline(config, deps);
    expect(deps.classify).toHaveBeenCalledTimes(12);
    expect(
      seen.every((text) => !text.includes("Person alpha") && !text.includes("Person beta")),
    ).toBe(true);
    expect(result.full).toBe(2);
    expect(result.objectiveOnly).toBe(2); // judicial candidates never enter policy classification
    expect(
      result.coverage.filter((row) => row.contestId === "leg").map((row) => row.modelCalls),
    ).toEqual([6, 6]);
    const payload = JSON.parse(await readFile(result.publication, "utf8"));
    expect(JSON.stringify(payload)).not.toContain("Person alpha");
    expect(
      payload.candidates.filter((candidate: { coverage: string }) => candidate.coverage === "full"),
    ).toHaveLength(2);
  });
  it("holds third-party news and debate passages without approved speaker attribution", async () => {
    const config = input(),
      deps = options();
    config.analysis = {
      mode: "names_only",
      projectionVersion: "test",
      approvedBy: "reviewer",
      evaluationHash: "b".repeat(64),
      rubricVersion: "test",
      jevModelVersion: "jev-1.14.0",
      maxCallsPerCandidate: 3,
      lowConfidenceThreshold: 0.8,
      fallbackEvaluated: false,
    };
    deps.classify = vi.fn();
    deps.collectVoice = vi.fn<NonNullable<BallotRunOptions["collectVoice"]>>(async (target) => {
      const originalText =
        "Moderator asks one candidate a question. The other candidate answers with a different position.";
      return {
        sources: [
          {
            id: `debate-${target.request.candidate.id}`,
            contestId: target.contestId,
            type: "debate_speech",
            url: "https://forum.example/debate",
            originalText,
            text: originalText,
            contentHash: hash(originalText),
            fetchedAt: config.asOfDate,
            eventDate: { basis: "unknown", precision: "day" },
          },
        ],
        leads: [],
        quotes: [],
        coverage: [],
        provenance: [],
        duplicateSources: [],
      };
    });
    const result = await runBallotPipeline(config, deps);
    expect(deps.classify).not.toHaveBeenCalled();
    expect(result.full).toBe(0);
    const research = JSON.parse(
      await readFile(join(directory, config.releaseId, "research.json"), "utf8"),
    );
    expect(
      research.review.some((row: { reason: string }) => row.reason.includes("speaker/actor span")),
    ).toBe(true);
  });
  it("does not overwrite an existing release with changed data or mutate its input hash", async () => {
    const result = await runBallotPipeline(input(), options());
    const payload = JSON.parse(await readFile(result.publication, "utf8")) as PublishPayload;
    const initialHash = payload.release.manifestHash;
    payload.candidates[0]!.bipartisanship = undefined;
    const same = publishRelease(payload, {
      outDir: join(directory, "batch-test-v1"),
      blocklist: { candidateNames: [], partyLabels: [] },
    });
    expect(same.manifestHash).toBe(initialHash);
    payload.release.asOfDate = "2026-10-25";
    expect(() =>
      publishRelease(payload, {
        outDir: join(directory, "batch-test-v1"),
        blocklist: { candidateNames: [], partyLabels: [] },
      }),
    ).toThrow("immutable");
  });
});
