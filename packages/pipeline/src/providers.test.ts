import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { requestJev, requestOllama, validateClassifierResponse } from "./providers.js";
import { cachedCall, withModelCache } from "./cached_call.js";
import { classifyOne } from "./classify.js";

const input = {
  text: "[REDACTED] supports allowing more housing by right.",
  issueId: "housing.zoning",
  negativePoleLabel: "Restrict housing",
  positivePoleLabel: "Allow housing",
  projectionVersion: "v1",
  mode: "names_and_party",
};
const result = {
  stance: {
    probs: {
      strong_negative: 0,
      moderate_negative: 0,
      neutral: 0,
      moderate_positive: 0,
      strong_positive: 1,
    },
    confidence: 0.9,
  },
  relevance: { probs: { relevant: 1, irrelevant: 0 }, confidence: 0.9 },
  claimType: { probs: { promise: 0, advocacy: 1, value: 0 }, confidence: 0.9 },
  specificity: 2 / 3,
  proposesSpending: 0,
  fundingStated: 0,
  isOwnSpeech: 1,
  withinAuthority: "influence",
};
const choose = (
  value: typeof result.stance | typeof result.relevance | typeof result.claimType,
) => ({
  type: "choice",
  probabilities: value.probs,
  confidence: value.confidence,
  choice: Object.entries(value.probs).find(([, value]) => value === 1)![0],
});
function jevResponse(model = "jev-1.14.0") {
  return {
    model,
    answers: {
      stance: choose(result.stance),
      relevance: choose(result.relevance),
      claimType: choose(result.claimType),
      specificity: {
        type: "score",
        score: 2,
        confidence: 1,
        probabilities: { "0": 0, "1": 0, "2": 1, "3": 0 },
      },
      proposesSpending: { type: "noul", noul: 0 },
      fundingStated: { type: "noul", noul: 0 },
      isOwnSpeech: { type: "noul", noul: 1 },
    },
  };
}
describe("actual model provider protocols", () => {
  it("calls TypeSafe systemone with named decision primitives and preserves distributions", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(Response.json(jevResponse()));
    expect(await requestJev(input, "test-secret", "jev-1.14.0", network)).toEqual(result);
    const [url, init] = network.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    const request = JSON.parse(init!.body as string);
    expect(request.state).toBe(input.text);
    expect(request.questions.stance.type).toBe("choice");
    expect(request.questions.isOwnSpeech.type).toBe("noul");
    expect(JSON.stringify(request)).not.toContain("test-secret");
  });
  it("rejects aliases and unexpected resolved models", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(jevResponse("jev-latest")));
    await expect(requestJev(input, "secret", "jev-latest", network)).rejects.toThrow(
      "explicit version",
    );
    expect(network).not.toHaveBeenCalled();
    await expect(requestJev(input, "secret", "jev-1.14.0", network)).rejects.toThrow(
      "different model",
    );
  });
  it("never leaks provider HTTP bodies or API tokens in errors", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret token echoed here", { status: 401 }));
    await expect(requestJev(input, "secret", "jev-1.14.0", network)).rejects.toThrow(
      "TypeSafe HTTP 401",
    );
  });
  it("checks the Ollama digest, then consumes non-streaming JSON chat", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("/tags")
          ? Response.json({ models: [{ name: "gpt-oss:20b", digest: "frozen-digest" }] })
          : Response.json({
              model: "gpt-oss:20b",
              message: { content: JSON.stringify(result) },
              done: true,
            }),
      );
    expect(
      await requestOllama(input, {
        apiKey: "secret",
        model: "gpt-oss:20b",
        digest: "frozen-digest",
        fetch: network,
      }),
    ).toEqual(result);
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      "https://ollama.com/api/tags",
      "https://ollama.com/api/chat",
    ]);
    const request = JSON.parse(network.mock.calls[1]![1]!.body as string);
    expect(request.stream).toBe(false);
    expect(request.format).toBe("json");
    expect(request.messages[1].content).toContain("[REDACTED]");
    expect(JSON.stringify(request)).not.toContain("secret");
  });
  it("doesn't call a changed Ollama model", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ models: [{ name: "gpt-oss:20b", digest: "changed" }] }));
    await expect(
      requestOllama(input, {
        apiKey: "secret",
        model: "gpt-oss:20b",
        digest: "frozen",
        fetch: network,
      }),
    ).rejects.toThrow("digest changed");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("rejects fabricated, missing or unnormalized probability mass", () => {
    expect(() =>
      validateClassifierResponse({
        ...result,
        stance: { probs: { strong_positive: 1 }, confidence: 1 },
      }),
    ).toThrow();
    expect(() => validateClassifierResponse({ ...result, specificity: 3 })).toThrow();
  });
  it("replays frozen model responses offline, with zero network/cache-miss executions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ftb-models-"));
    try {
      const spec = {
        model: "jev",
        modelVersion: "jev-1.14.0",
        rubricVersion: "test",
        questions: input,
        inputHash: "hash",
      };
      const request = vi.fn().mockResolvedValue(result);
      await withModelCache({ directory, offline: false }, () => cachedCall(spec, request));
      const replay = await withModelCache({ directory, offline: true }, () =>
        cachedCall(spec, request),
      );
      expect(replay).toEqual(result);
      expect(request).toHaveBeenCalledTimes(1);
      await expect(
        withModelCache({ directory, offline: true }, () =>
          cachedCall({ ...spec, inputHash: "different" }, request),
        ),
      ).rejects.toThrow("Offline model cache miss");
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("uses Ollama after Jev failure, but queues its uncalibrated output instead of publishing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ftb-fallback-"));
    const network = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("typesafe.ai")) return new Response(null, { status: 503 });
      if (String(url).endsWith("/tags"))
        return Response.json({ models: [{ name: "gpt-oss:20b", digest: "frozen" }] });
      return Response.json({
        model: "gpt-oss:20b",
        message: { content: JSON.stringify(result) },
        done: true,
      });
    });
    vi.stubGlobal("fetch", network);
    try {
      const output = await withModelCache(
        { directory: join(directory, "cache"), offline: false },
        () =>
          classifyOne(
            { sourceId: "s", text: input.text, mode: "names_and_party", projectionVersion: "test" },
            {
              id: "s",
              contestId: "c",
              candidateId: "p",
              type: "campaign_site",
              url: "https://campaign.example/",
              originalText: input.text,
              text: input.text,
              fetchedAt: "2026-10-24",
              eventDate: { basis: "unknown", precision: "day" },
              contentHash: "test",
            },
            "p",
            "c",
            {
              id: input.issueId,
              negativePole: input.negativePoleLabel,
              positivePole: input.positivePoleLabel,
            },
            undefined,
            {
              jevApiKey: "fake-key",
              jevModelVersion: "jev-1.14.0",
              ollamaApiKey: "fake-key",
              ollamaModelVersion: "gpt-oss:20b",
              ollamaModelDigest: "frozen",
              rubricVersion: "test",
              outDir: directory,
              lowConfidenceThreshold: 0.8,
            },
          ),
      );
      expect(output).toBeNull();
      expect(await readFile(join(directory, "logs/review-queue.jsonl"), "utf8")).toContain(
        "unevaluated_fallback_probability",
      );
      expect(network).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
