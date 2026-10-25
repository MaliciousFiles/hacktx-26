import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Evidence, Source } from "@ftb/types";
import { ollamaJson, type OllamaConfig } from "./ollama.js";
import { generateHighlights, generatePlans } from "./generate.js";
import { classifyOne, type ClassifyConfig } from "./classify.js";
import { runBatch, type BatchInput } from "./batch.js";
import { publishRelease } from "./publish.js";
import { snapshotSources } from "./snapshot.js";

function config(): ClassifyConfig & OllamaConfig {
  return {
    ollamaApiKey: "test-secret",
    ollamaModel: "test:1b",
    ollamaModelVersion: `test-${randomUUID()}`,
    jevApiKey: "test-jev-secret",
    jevModelVersion: "jev-1.13.0",
    rubricVersion: randomUUID(),
    outDir: mkdtempSync(join(tmpdir(), "ftb-models-")),
    lowConfidenceThreshold: 0.6,
  };
}
const source: Source = {
  id: "src-test",
  candidateId: "cand-test",
  contestId: "contest-test",
  type: "questionnaire",
  url: "https://example.invalid/questionnaire",
  fetchedAt: "2026-10-24",
  eventDate: { date: "2026-10-24", basis: "published", precision: "day" },
  contentHash: "test",
  text: "Allow housing near transit.",
  originalText: "Allow housing near transit.",
};
const evidence: Evidence = {
  id: "ev-test",
  candidateId: "cand-test",
  contestId: "contest-test",
  sourceId: source.id,
  issueId: "housing.zoning",
  kind: "voice",
  sourceType: "questionnaire",
  eventDate: source.eventDate,
  quote: source.originalText,
  quoteSpan: { start: 0, end: source.originalText.length },
  position: 1,
  distribution: { probs: { strong_positive: 1 }, confidence: 1 },
  relevance: 1,
  isOwnSpeech: 1,
  claimType: "promise",
  claimTypeDist: { probs: { promise: 1 }, confidence: 1 },
  specificity: 0.5,
  withinAuthority: "none",
};

/** TypeSafe systemone reply in the shape providers.ts requests (all questions answered). */
function jevReply(confidence = 1) {
  const dist = (probabilities: Record<string, number>, choice: string) => ({
    type: "choice",
    choice,
    confidence,
    probabilities,
  });
  return new Response(
    JSON.stringify({
      model: "jev-1.13.0",
      answers: {
        stance: dist(
          {
            strong_negative: 0,
            moderate_negative: 0,
            neutral: 0,
            moderate_positive: 0,
            strong_positive: 1,
          },
          "strong_positive",
        ),
        relevance: dist({ relevant: 1, irrelevant: 0 }, "relevant"),
        claimType: dist({ promise: 1, advocacy: 0, value: 0 }, "promise"),
        specificity: {
          type: "score",
          score: 1.5,
          confidence,
          probabilities: { "0": 0, "1": 0.5, "2": 0.5, "3": 0 },
        },
        proposesSpending: { type: "noul", noul: 0 },
        fundingStated: { type: "noul", noul: 0 },
        isOwnSpeech: { type: "noul", noul: 1 },
      },
    }),
  );
}
const modelReply = (data: unknown) =>
  new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(data) } }));
afterEach(() => vi.unstubAllGlobals());

describe("Ollama transport and generation", () => {
  it("uses cloud bearer auth and non-streaming chat, then reuses the frozen cache", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        modelReply({ highlights: [{ text: "Supports housing.", evidenceIds: [evidence.id] }] }),
      );
    vi.stubGlobal("fetch", fetch);
    const c = config();
    const first = await generateHighlights("candidate", [evidence], c);
    expect(await generateHighlights("candidate", [evidence], c)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0]!;
    expect(url).toBe("https://ollama.com/api/chat");
    expect(request.headers.Authorization).toBe("Bearer test-secret");
    expect(JSON.parse(request.body)).toMatchObject({
      model: "test:1b",
      stream: false,
      options: { temperature: 0 },
    });
    expect(JSON.parse(request.body)).not.toHaveProperty("format");
  });
  it("supports local Ollama without a key and requests JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(modelReply({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const c: OllamaConfig = {
      ...config(),
      ollamaApiKey: undefined,
      ollamaBaseUrl: "http://localhost:11434",
    };
    expect(await ollamaJson("Return JSON", c, (v) => v)).toEqual({ ok: true });
    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(fetch.mock.calls[0]![1].body).format).toBe("json");
  });
  it("rejects unknown citations before caching; a corrected retry makes another call", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        modelReply({ highlights: [{ text: "Claim", evidenceIds: ["invented"] }] }),
      )
      .mockResolvedValueOnce(
        modelReply({ highlights: [{ text: "Claim", evidenceIds: [evidence.id] }] }),
      );
    vi.stubGlobal("fetch", fetch);
    const c = config();
    await expect(generateHighlights("candidate", [evidence], c)).rejects.toThrow("citations");
    expect(await generateHighlights("candidate", [evidence], c)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not accept unsupported not-applicable slots as cited explanations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(modelReply({ goal: "not_applicable", mechanism: "not_stated" })),
    );
    const [plan] = await generatePlans("candidate", [evidence], config());
    expect(plan!.goal).toEqual({ state: "not_stated" });
    expect(plan!.specificity).toBe(0);
  });
  it("redacts provider error bodies and rejects malformed output", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("test-secret", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ done: true, message: { content: "invalid" } })),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(ollamaJson("test", config(), (v) => v)).rejects.toThrow(
      "Ollama request failed (HTTP 401)",
    );
    await expect(ollamaJson("test", config(), (v) => v)).rejects.toThrow("invalid JSON");
  });
  it("rejects floating versions and remote plaintext endpoints before sending keys", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      ollamaJson("test", { ...config(), ollamaModelVersion: "latest" }, (v) => v),
    ).rejects.toThrow("explicit model version");
    await expect(
      ollamaJson("test", { ...config(), ollamaBaseUrl: "http://example.com" }, (v) => v),
    ).rejects.toThrow("HTTPS");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("classification publication gates", () => {
  const input = {
    sourceId: source.id,
    text: source.text,
    mode: "names_only" as const,
    projectionVersion: "proj-v1",
  };
  const issue = { id: "housing.zoning", negativePole: "Restrict", positivePole: "Allow" };
  it("rejects evaluation-only projections before calling any model", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      classifyOne(
        { ...input, mode: "unmasked_eval_only" },
        source,
        "cand-test",
        "contest-test",
        issue,
        undefined,
        config(),
      ),
    ).rejects.toThrow("publishable projection");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("batch orchestration", () => {
  it("classifies prepared sources, generates cited text, and publishes a complete comparison", async () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../../fixtures/release-fixture.json", import.meta.url), "utf8"),
    );
    fixture.contests = [fixture.contests[0]];
    fixture.candidates = fixture.candidates.filter(
      (c: { contestId: string }) => c.contestId === fixture.contests[0].id,
    );
    fixture.ballot.contestIds = [fixture.contests[0].id];
    const issues = ["housing.zoning", "economy.taxation", "safety.policing"].map((id) => ({
      id,
      label: id,
      levels: ["state" as const],
      negativePole: "Restrict",
      positivePole: "Allow",
    }));
    const sources = fixture.candidates.flatMap((candidate: { id: string; contestId: string }) =>
      [0, 1].map((event) => ({
        ...source,
        id: `${candidate.id}-${event}`,
        candidateId: candidate.id,
        contestId: candidate.contestId,
        originalText: `Supports housing, taxation and safety reforms in event ${event} for ${candidate.id}.`,
        text: `Supports housing, taxation and safety reforms in event ${event} for ${candidate.id}.`,
      })),
    );
    const fetch = vi.fn(async (url: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      if (url.includes("typesafe")) return jevReply();
      const prompt: string = body.messages[0].content;
      const evs = JSON.parse(prompt.split("Evidence:\n")[1]!.split("\n\nRespond")[0]!);
      const sentence = { text: "Supports reforms.", evidenceIds: [evs[0].id] };
      return modelReply(
        prompt.includes('"highlights"') ? { highlights: [sentence] } : { goal: sentence },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const c = config();
    const result = await runBatch(
      {
        payload: fixture,
        sources,
        actions: [],
        issues,
        gitSha: "test",
        normalize: { mode: "names_only", projectionVersion: "proj-test", candidateNames: [] },
        blocklist: { candidateNames: [], partyLabels: [] },
      },
      c,
    );
    expect(result.success).toBe(true);
    const release = JSON.parse(readFileSync(result.releaseFilePath, "utf8"));
    for (const candidate of release.candidates) {
      expect(candidate.coverage).toBe("full");
      expect(candidate.evidence).toHaveLength(6);
      expect(candidate.platformHighlights).toHaveLength(1);
      expect(candidate.plans).toHaveLength(3);
    }
    expect(fetch.mock.calls.filter(([url]) => url.includes("typesafe"))).toHaveLength(12);
  });
  it("publishes objective-only candidates for missing evidence and never scores judges", async () => {
    const fixture = JSON.parse(
      readFileSync(new URL("../../../fixtures/release-fixture.json", import.meta.url), "utf8"),
    );
    const c = config();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const input: BatchInput = {
      payload: fixture,
      sources: [],
      actions: [],
      issues: [],
      gitSha: "test",
      normalize: { mode: "names_only", projectionVersion: "proj-test", candidateNames: [] },
      blocklist: { candidateNames: [], partyLabels: [] },
    };
    const result = await runBatch(input, c);
    expect(result.success).toBe(true);
    const release = JSON.parse(readFileSync(result.releaseFilePath, "utf8"));
    expect(release.candidates.length).toBe(fixture.candidates.length);
    for (const candidate of release.candidates) {
      expect(candidate.coverage).toBe("objective_only");
      expect(candidate.stances).toEqual({});
    }
    expect(existsSync(join(c.outDir, "snapshots", `${fixture.release.id}.json`))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.release.modelVersions.llm).toContain("gemini"); // input was not mutated
  });
  it("counts identical syndicated text only once for the same candidate", () => {
    const c = config();
    const result = snapshotSources(
      [source, { ...source, id: "syndicated", url: "https://another.invalid/story" }],
      [],
      {},
      "test",
      c.outDir,
    );
    expect(result.sources).toHaveLength(1);
  });
  it("keeps frozen release contents immutable and hashes stable across reruns", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../../../fixtures/release-fixture.json", import.meta.url), "utf8"),
    );
    const options = { outDir: config().outDir, blocklist: { candidateNames: [], partyLabels: [] } };
    const first = publishRelease(payload, options);
    expect(first.success).toBe(true);
    payload.release.manifestHash = first.manifestHash;
    expect(publishRelease(payload, options).manifestHash).toBe(first.manifestHash);
    payload.release.asOfDate = "2026-10-25";
    expect(() => publishRelease(payload, options)).toThrow("immutable");
    expect(JSON.parse(readFileSync(first.releaseFilePath, "utf8")).release.asOfDate).toBe(
      "2026-10-24",
    );
  });
});
