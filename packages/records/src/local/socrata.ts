import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { candidateNames, inWindow, normalizeName, provenance, voteStance } from "../model";
import {
  actionId, invalidConfig, localVote, nonAction, pages, report, sourceDateSchema,
  sourceUrlSchema, tally,
} from "./common";
import type { Located } from "./common";

const column = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
export const socrataColumnsSchema = z.object({
  meetingDate: column.default("meeting_date"),
  itemId: column.default("item_id"),
  voteId: column.default("vote_id"),
  itemNumber: column.default("meeting_item_number"),
  description: column.default("item_description"),
  voterName: column.default("voter_name"),
  voterDistrict: column.default("voter_district"),
  voteCast: column.default("vote_cast"),
  actionTaken: column.default("action_taken"),
  body: column.default("meeting_type"),
});

export const socrataVotesConfigSchema = z.object({
  endpoint: sourceUrlSchema,
  role: z.string().trim().min(1),
  columns: socrataColumnsSchema.default(() => socrataColumnsSchema.parse({})),
  // This is the candidate's verified historical source district. Never use
  // request.position.district, which may describe a different election/office.
  candidateDistrict: z.string().trim().min(1).optional(),
  pageSize: z.number().int().min(1).max(50000).default(1000),
  maxPages: z.number().int().min(1).max(1000).default(100),
}).refine((config) => new Set(Object.values(config.columns)).size === Object.keys(config.columns).length,
  "Each configured column must be distinct");
export type SocrataVotesConfig = z.input<typeof socrataVotesConfigSchema>;

interface VoteRow {
  date: string;
  itemId: string;
  voteId: string;
  itemNumber?: string;
  description: string;
  voterName: string;
  voterDistrict?: string;
  voteRaw: string;
  action: string;
  body?: string;
}

function rowParser(columns: z.output<typeof socrataColumnsSchema>): (input: unknown) => VoteRow {
  const required = z.string().min(1);
  const optional = z.string().nullish();
  const schema = z.object({
    [columns.meetingDate]: sourceDateSchema,
    [columns.itemId]: required,
    [columns.voteId]: required,
    [columns.itemNumber]: optional,
    [columns.description]: required,
    [columns.voterName]: required,
    [columns.voterDistrict]: optional,
    [columns.voteCast]: required,
    [columns.actionTaken]: required,
    [columns.body]: optional,
  });
  return (input) => {
    const row = schema.parse(input);
    return {
      date: row[columns.meetingDate]!, itemId: row[columns.itemId]!, voteId: row[columns.voteId]!,
      itemNumber: row[columns.itemNumber] ?? undefined, description: row[columns.description]!,
      voterName: row[columns.voterName]!, voterDistrict: row[columns.voterDistrict] ?? undefined,
      voteRaw: row[columns.voteCast]!, action: row[columns.actionTaken]!, body: row[columns.body] ?? undefined,
    };
  };
}

export const socrataVotesAdapter: RecordsAdapter = {
  kind: "socrata-votes",
  async collect(context, input) {
    const parsed = socrataVotesConfigSchema.safeParse(input);
    if (!parsed.success) return invalidConfig(this.kind);
    const config = collectionConfig(parsed.data, context);
    const c = config.columns;
    const url = new URL(config.endpoint);
    // Fetch EVERY member in the interval. Filtering by candidate/district here
    // would make a plausible but false margin, especially across page splits.
    url.searchParams.set("$where", `${c.meetingDate} >= '${context.window.since}T00:00:00' AND ${c.meetingDate} < '${context.window.before}T00:00:00'`);
    url.searchParams.set("$order", `${c.meetingDate} ASC,${c.itemId} ASC,${c.voteId} ASC`);
    const collected = await pages({
      context, url, pageSize: config.pageSize, maxPages: config.maxPages,
      parse: rowParser(c), style: "socrata",
    });
    const problems = [...collected.problems];
    // Nothing from a truncated/invalid vote list can certify a full margin.
    if (!collected.complete) {
      return report([], problems, context.window, `${collected.rows.length} valid rows fetched; all tallies withheld because the vote list is incomplete.`);
    }
    const groups = new Map<string, Located<VoteRow>[]>();
    const voteIds = new Map<string, string[]>();
    for (const row of collected.rows) {
      if (!inWindow(row.value.date, context.window)) continue;
      const group = groups.get(row.value.itemId) ?? [];
      group.push(row);
      groups.set(row.value.itemId, group);
      voteIds.set(row.value.voteId, [...(voteIds.get(row.value.voteId) ?? []), row.value.itemId]);
    }
    const duplicateItems = new Set([...voteIds.values()].filter((ids) => ids.length > 1).flat());
    const names = candidateNames(context.request);
    const actions: OfficialAction[] = [];
    for (const [itemId, rows] of groups) {
      const first = rows[0].value;
      if (duplicateItems.has(itemId)) {
        problems.push(`Item ${itemId}: duplicate vote IDs; tally rejected.`);
        continue;
      }
      const seenNames = new Set<string>();
      let invalid = false;
      for (const { value: row } of rows) {
        const name = normalizeName(row.voterName);
        if (seenNames.has(name) || row.date !== first.date || row.description !== first.description ||
            row.action !== first.action || row.itemNumber !== first.itemNumber || row.body !== first.body) invalid = true;
        seenNames.add(name);
      }
      if (invalid) {
        problems.push(`Item ${itemId}: duplicate voter names or conflicting item metadata; tally rejected.`);
        continue;
      }
      if (nonAction(first.action) || rows.every((row) => nonAction(row.value.voteRaw))) continue;
      const targets = rows.filter((row) => names.has(normalizeName(row.value.voterName)));
      if (targets.length > 1) {
        problems.push(`Item ${itemId}: multiple verified names matched different voter rows; identity requires review.`);
        continue;
      }
      if (!targets.length) continue; // Not a record of participation or absence.
      const target = targets[0].value;
      if (config.candidateDistrict !== undefined && target.voterDistrict?.trim() !== config.candidateDistrict) {
        problems.push(`Item ${itemId}: target historical district mismatch; identity requires review.`);
        continue;
      }
      const margin = tally(rows.map((row) => row.value.voteRaw));
      if (!margin) {
        problems.push(`Item ${itemId}: unsupported vote value; tally rejected.`);
        continue;
      }
      const value = localVote(target.voteRaw);
      actions.push({
        id: actionId(this.kind, config.endpoint, itemId, context.request.candidate.id),
        actorId: context.request.candidate.id, issueIds: [], role: config.role,
        body: first.body, type: "floor_vote", stance: voteStance(value), margin,
        date: first.date, title: first.description, officialText: `${first.description}\n${first.action}`,
        sourceUrl: targets[0].snapshot.sourceUrl, extraction: "json",
        provenance: rows.map((row) => provenance(row.snapshot, `${this.kind}@1`, row.locator)),
        // The live structured source explicitly distinguishes this action
        // label from ordinary approval. Never infer consent from the tally.
        ...(/^(?:approved|adopted) on consent(?: agenda)?[.]?$/i.test(first.action.trim()) ? { consent: true } : {}),
        attribution: { method: "named_record" },
        vote: { value, raw: target.voteRaw, question: first.action, method: "unknown" },
        // Unanimity alone is not evidence that an item was on consent.
      });
    }
    return report(actions, problems, context.window,
      `${collected.rows.length} rows and ${groups.size} items inspected; ${actions.length} target votes collected.`);
  },
};
