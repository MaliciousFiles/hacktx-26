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
        parentId: id.split(".")[0],
        label: id.split(".")[1]!,
        negativePole: `Retain ${id}`,
        positivePole: `Change ${id}`,
        levels: ["state" as const],
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
  it("collects candidates concurrently, keeps roster order, and saves candidate acquisition checkpoints", async () => {
    const spec = input();
    const deps = options();
    let active = 0,
      peak = 0;
    const collect = deps.collectRecords!;
    const messages: string[] = [];
    await runBallotPipeline(spec, {
      ...deps,
      researchOnly: true,
      acquisitionConcurrency: 3,
      onProgress: (message) => messages.push(message),
      collectRecords: async (...args) => {
        active++;
        peak = Math.max(peak, active);
        const result = await collect(...args);
        active--;
        return result;
      },
    });
    expect(peak).toBe(3);
    const research = JSON.parse(
      await readFile(join(directory, spec.releaseId, "research.json"), "utf8"),
    );
    expect(research.research.map((row: { candidateId: string }) => row.candidateId)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
    const checkpoint = JSON.parse(
      await readFile(join(directory, spec.releaseId, "candidate-checkpoints/alpha.json"), "utf8"),
    );
    expect(checkpoint.candidateId).toBe("alpha");
    expect(checkpoint.configHash).toBe(research.configHash);
    expect(messages.some((message) => message.includes("[4/4]") && message.includes("saved"))).toBe(
      true,
    );
  });
  it("writes private research without creating a release and rejects publishing unevaluated demo analysis", async () => {
    const spec = input();
    const deps = options();
    const result = await runBallotPipeline(spec, { ...deps, researchOnly: true });
    expect(result.publication).toBe("");
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(join(directory, spec.releaseId))).not.toContain("releases");
    expect(await readFile(join(directory, spec.releaseId, "research.json"), "utf8")).toContain(
      "classificationAttempts",
    );
    const unreviewed = {
      ...spec,
      releaseId: "unreviewed-demo",
      analysis: {
        mode: "names_and_party" as const,
        projectionVersion: "experimental",
        approvedBy: "experimental-only",
        rubricVersion: "test",
        jevModelVersion: "jev-1.14.0",
        maxCallsPerCandidate: 10,
        lowConfidenceThreshold: 0.8,
        fallbackEvaluated: false,
      },
    };
    await expect(runBallotPipeline(unreviewed, deps)).rejects.toThrow("research-only");
  });
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
  it("core loop: own words + contested votes → cited platform, Says vs. Does, and a usable card deck", async () => {
    const config = input(),
      deps = options();
    config.analysis = {
      mode: "names_and_party",
      projectionVersion: "evaluated-v1",
      approvedBy: "reviewer",
      evaluationHash: "c".repeat(64),
      rubricVersion: "rubric-v1",
      jevModelVersion: "jev-1.14.0",
      maxCallsPerCandidate: 40,
      lowConfidenceThreshold: 0.8,
      fallbackEvaluated: false,
    };
    const issueIds = ["housing.zoning", "economy.taxation", "infrastructure.transit"];
    // Speech: two reviewed, distinct events covering all three issues.
    const speech = (candidateId: string, ordinal: number): Source => {
      const originalText = `Person ${candidateId} said at event ${ordinal}: on ${issueIds.join(", ")} I will change course.`;
      return {
        id: `src-${candidateId}-speech-${ordinal}`,
        contestId: "leg",
        candidateId,
        type: "campaign_site",
        url: `https://${candidateId}.example/${ordinal}`,
        originalText,
        text: originalText,
        contentHash: hash(originalText),
        fetchedAt: config.asOfDate,
        eventDate: { basis: "published", date: "2026-06-0" + ordinal, precision: "day" },
      };
    };
    for (const candidateId of ["alpha", "beta"])
      for (const ordinal of [1, 2]) {
        const item = speech(candidateId, ordinal);
        config.attributions.push({
          sourceId: item.id,
          candidateId,
          contentHash: item.contentHash,
          start: 0,
          end: item.originalText.length,
          approvedBy: "reviewer",
          eventId: `${candidateId}-event-${ordinal}`,
        });
      }
    deps.collectVoice = vi.fn(async (target) => ({
      sources:
        target.contestId === "leg"
          ? [speech(target.request.candidate.id, 1), speech(target.request.candidate.id, 2)]
          : [],
      leads: [],
      quotes: [],
      coverage: [],
      provenance: [],
      duplicateSources: [],
    }));
    // Record: alpha votes YES twice on contested zoning bills, beta votes NO twice.
    // Plus a procedural cloture vote and an omnibus bill — neither may be scored.
    const { actionToSource } = await import("./records.js");
    deps.collectRecords = vi.fn(async (target) => {
      const id = target.candidate.id;
      const stance = id === "alpha" ? ("yes" as const) : ("no" as const);
      const vote = (n: number, text: string, question: string) => ({
        id: `${id}-vote-${n}`,
        actorId: id,
        issueIds: [],
        role: "State House",
        type: "floor_vote" as const,
        stance,
        date: `2025-0${n}-01`,
        title: `H.R. 7${n}`,
        officialText: text,
        sourceUrl: `https://house.example/${id}/${n}`,
        margin: { yes: 80, no: 60 },
        vote: { value: stance, raw: stance, question, method: "roll_call" as const },
      });
      const actions =
        target.contestId === "leg"
          ? [
              vote(1, "A bill on housing.zoning that allows more homes.", "On Passage"),
              vote(2, "A second bill on housing.zoning that allows more homes.", "On Passage"),
              vote(3, "Housing.zoning bill.", "On the Cloture Motion"),
              vote(4, `Omnibus: ${issueIds.join(", ")}.`, "On Passage"),
            ]
          : [];
      return {
        target,
        request: {
          candidate: target.candidate,
          position: { office: target.office, jurisdiction: target.jurisdiction },
          month: 11,
          year: 2026,
        },
        actions,
        sources: actions.map((action) => actionToSource(action, target.contestId)),
        coverage: [],
        gaps: [],
        identityNotes: [],
        incomplete: false,
      };
    });
    const classified: string[] = [];
    deps.classify = vi.fn<NonNullable<BallotRunOptions["classify"]>>(
      async (projection, view, candidateId, contestId, issue, actionId) => {
        if (!view.originalText.toLowerCase().includes(issue.id)) return null; // relevance gate
        classified.push(view.id);
        return {
          sourceId: view.id,
          candidateId,
          contestId,
          issueId: issue.id,
          ...(actionId ? { actionId } : {}),
          kind: actionId ? ("action" as const) : ("voice" as const),
          sourceType: view.type,
          quote: view.originalText,
          position: 0.8,
          distribution: { probs: { strong_positive: 1 }, confidence: 1 },
          relevance: 1,
          isOwnSpeech: 1,
          claimType: "advocacy" as const,
          claimTypeDist: { probs: { advocacy: 1 }, confidence: 1 },
          specificity: 0.5,
          withinAuthority: "influence" as const,
        };
      },
    );

    const result = await runBallotPipeline(config, deps);
    expect(result.full).toBe(2);
    expect(result.cardsAvailable).toBe(true);
    // Procedural vote never classified; omnibus classified but withheld.
    expect(classified.some((id) => id.includes("vote-3"))).toBe(false);
    const research = JSON.parse(
      await readFile(join(directory, config.releaseId, "research.json"), "utf8"),
    );
    expect(research.review.some((row: { reason: string }) => row.reason.includes("omnibus"))).toBe(
      true,
    );
    expect(research.evidence.some((e: Evidence) => e.actionId?.includes("vote-4"))).toBe(false);

    const payload = JSON.parse(await readFile(result.publication, "utf8")) as PublishPayload;
    const [alpha, beta] = payload.candidates.filter((candidate) => candidate.contestId === "leg");
    // Says vs. Does: alpha says change and votes for it; beta says change but votes against.
    const gap = (profile: typeof alpha) =>
      profile!.saysVsDoes.find((item) => item.issueId === "housing.zoning")?.gap;
    expect(gap(alpha)).toBeCloseTo(0);
    expect(gap(beta)).toBeCloseTo(1.6);
    // Platform: one neutral, cited sentence per compared issue, from their OWN words only.
    expect(alpha!.platformHighlights).toHaveLength(3);
    const evidenceIds = new Set(alpha!.evidence.map((item) => item.id));
    for (const sentence of alpha!.platformHighlights) {
      expect(sentence.text).toMatch(/their own statements favor: Change/);
      for (const ref of sentence.citations) {
        expect(evidenceIds.has(ref.id)).toBe(true);
        expect(alpha!.evidence.find((item) => item.id === ref.id)!.kind).toBe("voice");
      }
    }
    // Masking: names and bill numbers are not in the masked payload.
    expect(JSON.stringify(payload)).not.toMatch(/Person alpha|H\.R\. 7/);
    expect(payload.cards.some((card) => card.kind === "pole")).toBe(true);
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
