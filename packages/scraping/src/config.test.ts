import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hostMatches } from "./snapshot.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

// Same shape run-cli.ts / cli.ts require of config/sources.yaml.
const sourcePolicy = z
  .object({
    version: z.string(),
    news: z.array(z.object({ domain: z.string() })),
    questionnaires: z.array(z.object({ url: z.string().url() })),
  })
  .parse(parse(read("config/sources.yaml")));

describe("config/sources.yaml", () => {
  const news = sourcePolicy.news.map((n) => n.domain);
  const questionnaire = sourcePolicy.questionnaires.map((q) => new URL(q.url).hostname);
  it("lists the reputable local and statewide outlets and voter-guide hosts", () => {
    for (const domain of [
      "kxan.com", "kvue.com", "fox7austin.com", "austinchronicle.com", "communityimpact.com",
      "thedailytexan.com", "austincurrent.org", "theaustinbulldog.org", "texastribune.org", "kut.org", "statesman.com",
    ])
      expect(news, domain).toContain(domain);
    expect(questionnaire.some((h) => hostMatches("onyourballot.vote411.org", h))).toBe(true);
    expect(questionnaire.some((h) => hostMatches("www.lwvaustin.org", h))).toBe(true);
  });
  it("has no duplicates and no path-bearing domains", () => {
    expect(new Set(news).size).toBe(news.length);
    expect(news.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))).toBe(true);
  });
});

describe("example run configs pin only well-formed, allowed campaign sites", () => {
  const files = [
    "ballot-pilot-westcampus.json",
    "ballot-pilot-410A.json",
    "ballot-westcampus-78705.corrected.json",
    "ballot-410A.sample.json",
  ];
  for (const file of files)
    it(file, () => {
      const run = JSON.parse(read(`packages/pipeline/examples/${file}`)) as {
        ballot: { contests: { candidates: { id: string }[] }[] };
        web: {
          allowedPageHosts: string[];
          campaignSites: { candidateId: string; url: string; verifiedVia: string }[];
        };
      };
      const ids = new Set(run.ballot.contests.flatMap((c) => c.candidates.map((x) => x.id)));
      const seen = new Set<string>();
      expect(run.web.campaignSites.length).toBeGreaterThan(0);
      for (const site of run.web.campaignSites) {
        expect(ids.has(site.candidateId), site.candidateId).toBe(true);
        expect(seen.has(site.candidateId), `duplicate ${site.candidateId}`).toBe(false);
        seen.add(site.candidateId);
        const url = new URL(site.url);
        expect(url.protocol).toBe("https:");
        expect(new URL(site.verifiedVia).protocol).toBe("https:");
        expect(run.web.allowedPageHosts.some((h) => hostMatches(url.hostname, h)), url.hostname).toBe(true);
      }
    });
});
