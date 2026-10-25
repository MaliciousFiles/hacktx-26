import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { collectVoice, VOICE_VERSION } from "./voice.js";
import { FrozenWebClient, hash } from "./snapshot.js";
import { scrapeSocial, socialFinders, SOCIAL_PLATFORMS } from "./social.js";

const configSchema = z
  .object({
    fetchedAt: z.string().date(),
    window: z.object({ since: z.string().date(), until: z.string().date() }).strict(),
    targets: z
      .array(
        z
          .object({
            contestId: z.string().min(1),
            searchContext: z.string().min(1).optional(),
            request: z
              .object({
                candidate: z
                  .object({
                    id: z.string().min(1),
                    name: z.string().min(1),
                    aliases: z.array(z.string()).optional(),
                    identifiers: z.record(z.string(), z.string()).optional(),
                  })
                  .strict(),
                position: z
                  .object({
                    office: z.string().min(1),
                    jurisdiction: z.string().min(1),
                    district: z.string().optional(),
                  })
                  .strict(),
                month: z.number().int().min(1).max(12),
                year: z.number().int().min(1789).max(9999),
              })
              .strict(),
            accounts: z
              .array(
                z
                  .object({
                    platform: z.enum(SOCIAL_PLATFORMS),
                    handle: z.string().min(1),
                    verifiedVia: z.string().url(),
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1),
    campaignSites: z
      .array(
        z
          .object({ candidateId: z.string(), url: z.string().url(), verifiedVia: z.string().url() })
          .strict(),
      )
      .default([]),
    verifiedDocuments: z
      .array(
        z
          .object({
            url: z.string().url(),
            type: z.enum(["questionnaire", "debate_speech"]),
            verifiedVia: z.string().url(),
            candidateId: z.string().min(1).optional(),
            contestId: z.string().min(1).optional(),
          })
          .strict()
          .refine(
            (doc) => !!doc.candidateId !== !!doc.contestId,
            "Bind a document to exactly one candidate or contest",
          )
          .refine(
            (doc) => doc.type === "questionnaire" || !doc.candidateId,
            "Debates have several speakers; bind them to a contest",
          ),
      )
      .default([]),
    // Exact network hosts, in addition to static provider hosts. Do not auto-add hosts from search results.
    allowedPageHosts: z.array(z.string().min(1)),
    speechDomains: z.array(z.string().min(1)),
    resultsPerQuery: z.number().int().min(1).max(100).default(10),
    maxPagesPerChannel: z.number().int().min(1).max(100).default(3),
    maxQuotesPerSource: z.number().int().min(1).max(100).default(10),
    maxSocialItems: z.number().int().min(1).max(100).default(20),
  })
  .strict();

const { values } = parseArgs({
  options: {
    config: { type: "string" },
    output: { type: "string" },
    cache: { type: "string" },
    sources: { type: "string", default: "../../config/sources.yaml" },
    offline: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || !values.config || !values.output || !values.cache) {
  console.log(
    "Usage: pnpm -F @ftb/scraping collect --config run.json --output output/run.json --cache .cache/run-id [--offline] [--sources ../../config/sources.yaml]",
  );
  process.exitCode = values.help ? 0 : 1;
} else {
  try {
    const config = configSchema.parse(JSON.parse(await readFile(resolve(values.config), "utf8")));
    if (config.window.until > config.fetchedAt || config.window.since > config.window.until)
      throw new Error("Invalid frozen window");
    const ids = config.targets.map(
      (target) => `${target.contestId}:${target.request.candidate.id}`,
    );
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate research targets");
    const rawPolicy = await readFile(resolve(values.sources), "utf8");
    const sourcePolicy = z
      .object({
        version: z.string(),
        news: z.array(z.object({ domain: z.string() })),
        questionnaires: z.array(z.object({ url: z.string().url() })),
      })
      .parse(parseYaml(rawPolicy));
    const client = new FrozenWebClient({
      directory: resolve(values.cache),
      fetchedAt: config.fetchedAt,
      offline: values.offline,
      allowedHosts: [
        ...new Set(["serpapi.com", "public.api.bsky.app", "api.x.com", ...config.allowedPageHosts]),
      ],
    });
    const voice = [];
    for (const target of config.targets) {
      voice.push({
        contestId: target.contestId,
        candidateId: target.request.candidate.id,
        ...(await collectVoice(target, {
          ...config,
          client,
          serpApiKey: process.env.SERPAPI_API_KEY,
          newsDomains: sourcePolicy.news.map((entry) => entry.domain),
          questionnaireDomains: sourcePolicy.questionnaires.map(
            (entry) => new URL(entry.url).hostname,
          ),
        })),
      });
    }
    const social = await scrapeSocial(
      config.targets.map((target) => ({
        contestId: target.contestId,
        candidateId: target.request.candidate.id,
        accounts: target.accounts,
      })),
      config.window,
      socialFinders(process.env, {
        fetchedAt: config.fetchedAt,
        maxItems: config.maxSocialItems,
        fetch: client.fetch,
      }),
      config.maxSocialItems,
    );
    const artifact = {
      version: VOICE_VERSION,
      configHash: hash(JSON.stringify(config)),
      sourcesVersion: sourcePolicy.version,
      sourcesPolicyHash: hash(rawPolicy),
      fetchedAt: config.fetchedAt,
      window: config.window,
      voice,
      social,
      snapshots: client.snapshots(),
    };
    const output = resolve(values.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(artifact, null, 2) + "\n");
    console.log(
      `Wrote ${voice.reduce((sum, item) => sum + item.sources.length, 0)} voice pages, ${social.sources.length} social items to ${output}`,
    );
    if (
      voice.some((item) =>
        item.coverage.some((row) =>
          ["error", "blocked", "not_configured", "needs_review"].includes(row.status),
        ),
      ) ||
      social.report.some((row) => ["error", "not_configured"].includes(row.status))
    )
      process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Research failed");
    process.exitCode = 1;
  }
}
