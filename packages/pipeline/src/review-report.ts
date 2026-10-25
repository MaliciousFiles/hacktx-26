// Private, deterministic reviewer report. No new model calls and no publication.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const sourceSchema = z.object({
  id: z.string(),
  contestId: z.string(),
  candidateId: z.string().optional(),
  type: z.string(),
  url: z.string(),
  originalText: z.string(),
  fetchedAt: z.string(),
  publishedAt: z.string().optional(),
  eventDate: z.object({ date: z.string().optional(), basis: z.string(), precision: z.string() }),
});
const artifactSchema = z.object({
  demo: z.boolean(),
  analysisEvaluated: z.boolean(),
  sources: z.array(sourceSchema),
  research: z.array(
    z.object({
      candidateId: z.string(),
      records: z.object({
        request: z.object({
          candidate: z.object({ name: z.string() }),
          position: z.object({ office: z.string() }),
        }),
        coverage: z.array(
          z.object({
            source: z.string(),
            status: z.string(),
            actionCount: z.number(),
            reason: z.string(),
          }),
        ),
      }),
      voice: z.object({
        sources: z.array(z.object({ id: z.string() })),
        leads: z.array(
          z.object({
            priority: z.string(),
            title: z.string(),
            url: z.string(),
            candidateMatch: z.string(),
            eventDate: z.object({ date: z.string().optional(), basis: z.string() }),
          }),
        ),
      }),
    }),
  ),
  coverage: z.array(
    z.object({
      candidateId: z.string(),
      sources: z.number(),
      actions: z.number(),
      acceptedEvidence: z.number(),
      modelCalls: z.number(),
      gaps: z.array(z.string()),
    }),
  ),
  actions: z.array(
    z.object({
      actorId: z.string(),
      date: z.string(),
      title: z.string(),
      type: z.string(),
      stance: z.string(),
      sourceUrl: z.string(),
      officialText: z.string(),
      consent: z.boolean().optional(),
      margin: z.object({ yes: z.number(), no: z.number() }).optional(),
    }),
  ),
  classificationAttempts: z.array(
    z.object({
      candidateId: z.string(),
      sourceId: z.string(),
      issueId: z.string(),
      span: z.object({ start: z.number(), end: z.number() }),
      result: z
        .object({
          quote: z.string(),
          kind: z.string(),
          position: z.number(),
          distribution: z.object({ confidence: z.number() }),
          relevance: z.number(),
          isOwnSpeech: z.number(),
        })
        .nullable(),
    }),
  ),
  candidateAnalysis: z.record(
    z.string(),
    z.object({ saysVsDoes: z.array(z.object({ issueId: z.string(), gap: z.number() })) }),
  ),
});
const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "\\|");
const link = (url: string): string => `[source](${url.replace(/\)/g, "%29")})`;

export function renderReviewReport(value: unknown): string {
  const artifact = artifactSchema.parse(value);
  const lines = [
    "# Individual-politician source review",
    "",
    "**Experimental, unreviewed research. Not a certified ballot, voter recommendation, fact-check, or ideological comparison.**",
    `Classification evaluated: **${artifact.analysisEvaluated ? "yes (see run's evaluation reference)" : "NO — confidence is a model signal, not proof"}**.`,
    "Campaign claims below are what the campaign says, not independently established facts. Narrow source inventories and fixed budgets are test samples, not complete careers.",
    "",
    "Raw sources, exact spans, model attempts and acquisition failures are in the accompanying research.json. No serving release is created in research-only mode.",
    "",
    "| Person | Voice pages | Official actions | Accepted evidence | Model operations |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const person of artifact.research) {
    const row = artifact.coverage.find((item) => item.candidateId === person.candidateId)!;
    lines.push(
      `| ${esc(person.records.request.candidate.name)} | ${person.voice.sources.length} | ${row.actions} | ${row.acceptedEvidence} | ${row.modelCalls} |`,
    );
  }
  for (const person of artifact.research) {
    const id = person.candidateId;
    const name = person.records.request.candidate.name;
    const row = artifact.coverage.find((item) => item.candidateId === id)!;
    const voiceIds = new Set(person.voice.sources.map((source) => source.id));
    const voiceSources = artifact.sources.filter((source) => voiceIds.has(source.id));
    lines.push(
      "",
      `## ${esc(name)}`,
      "",
      `Research context: ${esc(person.records.request.position.office)}. This entry does not certify candidacy, opponents or ballot membership.`,
      "",
      "### What they say — inspect the original pages",
      "",
    );
    for (const source of voiceSources)
      lines.push(
        `- ${esc(source.type)}: ${link(source.url)} — ${esc(source.eventDate.basis)} ${source.eventDate.date ?? "date unknown"}${source.publishedAt ? `; page publication metadata ${source.publishedAt}` : ""}.`,
      );
    if (!voiceSources.length)
      lines.push(
        "No voice pages collected. This is a coverage failure, not evidence of no platform.",
      );
    lines.push(
      "",
      "### Experimental statement classifications",
      "",
      "The excerpts are exact source spans. Direction is a model output on a specific issue axis, not a judgment that the quote is true or the policy good.",
      "",
    );
    const seen = new Set<string>();
    let printed = 0;
    for (const attempt of artifact.classificationAttempts
      .filter((item) => item.candidateId === id && item.result?.kind === "voice")
      .sort(
        (a, b) =>
          b.result!.distribution.confidence - a.result!.distribution.confidence ||
          (a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : a.span.start - b.span.start),
      )) {
      const result = attempt.result!;
      const source = artifact.sources.find((item) => item.id === attempt.sourceId);
      if (!source || source.candidateId !== id) continue;
      const passage = source.originalText.slice(attempt.span.start, attempt.span.end);
      const offset = passage.indexOf(result.quote);
      if (!result.quote || offset < 0) continue;
      const key = `${attempt.issueId}:${result.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = attempt.span.start + offset;
      if (source.originalText.slice(start, start + result.quote.length) !== result.quote)
        throw new Error("Non-exact report quote");
      lines.push(
        `**${esc(attempt.issueId)}** — direction ${result.position.toFixed(2)}, model confidence ${result.distribution.confidence.toFixed(2)}, relevance ${result.relevance.toFixed(2)}, own-speech signal ${result.isOwnSpeech.toFixed(2)}. ${link(source.url)} · UTF-16 [${start}, ${start + result.quote.length}).`,
        "",
        `> ${esc(result.quote).replace(/\n/g, "\n> ")}`,
        "",
      );
      if (++printed >= 8) break;
    }
    if (!printed)
      lines.push(
        "No attributable statement classifications to show. Check acquisition, the topic screen and the review queue.",
      );
    lines.push(
      "",
      "### What they did — official records",
      "",
      "These acts are documented participation/authorship, not proof of intent or a completed policy outcome. Consent/unanimous votes are weak stance signals.",
      "",
      "| Date | Act | Recorded participation | Tally | Link |",
      "|---|---|---|---|---|",
    );
    const actions = artifact.actions
      .filter((action) => action.actorId === id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1));
    for (const action of actions.slice(0, 12))
      lines.push(
        `| ${action.date} | ${esc(action.title).replace(/\n/g, " ")} | ${esc(action.type)} / ${esc(action.stance)}${action.consent ? " (consent)" : ""} | ${action.margin ? `${action.margin.yes} yes / ${action.margin.no} no` : "not supplied"} | ${link(action.sourceUrl)} |`,
      );
    if (!actions.length)
      lines.push("No actions collected; not proof of no action or no prior service.");
    if (actions.length > 12)
      lines.push(
        "",
        `Showing the first 12 of ${actions.length} acts by date/title; all acts are retained in research.json.`,
      );
    lines.push("", "### Says vs. does", "");
    const gaps = artifact.candidateAnalysis[id]?.saysVsDoes ?? [];
    if (!gaps.length)
      lines.push(
        "**No quantitative gap established.** The test lacks adequate independent, attributable, issue-interpreted events on both sides. Do not interpret this as consistency, hypocrisy, or a broken promise. Compare the underlying quotes and actions manually.",
      );
    else
      for (const gap of gaps)
        lines.push(
          `- ${esc(gap.issueId)}: provisional directional distance ${gap.gap.toFixed(2)}. Not a promise-kept/broken verdict; check dates and measure scope.`,
        );
    lines.push("", "### Debate/forum discovery — unverified leads", "");
    const debates = person.voice.leads
      .filter((lead) => lead.priority === "debate_review")
      .slice(0, 6);
    for (const lead of debates)
      lines.push(
        `- [${esc(lead.title)}](${lead.url.replace(/\)/g, "%29")}) — ${lead.eventDate.date ?? "date unknown"}; identity hint: ${lead.candidateMatch}. **Participation and transcript not verified.**`,
      );
    if (!debates.length)
      lines.push(
        "No debate leads surfaced in this bounded search. Not proof that no debate occurred.",
      );
    lines.push("", "### Coverage and review warnings", "");
    for (const coverage of person.records.coverage)
      lines.push(
        `- Records/${esc(coverage.source)}: **${esc(coverage.status)}**, ${coverage.actionCount} actions — ${esc(coverage.reason)}.`,
      );
    for (const gap of [...new Set(row.gaps)]) lines.push(`- ${esc(gap)}`);
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { input: { type: "string" }, output: { type: "string" } },
  });
  if (!values.input || !values.output)
    throw new Error("Usage: review-report --input research.json --output review.md");
  await writeFile(
    resolve(values.output),
    renderReviewReport(JSON.parse(await readFile(resolve(values.input), "utf8"))),
  );
  console.log(`Wrote private reviewer report to ${resolve(values.output)}`);
}
