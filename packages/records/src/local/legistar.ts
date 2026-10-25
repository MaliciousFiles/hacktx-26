import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { candidateNames, inWindow, normalizeName, provenance, voteStance } from "../model";
import {
  actionId, baseUrl, invalidConfig, localVote, nonAction, pages, pagingShape, report,
  sourceDateSchema, sourceIdSchema, sourceUrlSchema, tally, uniqueRows,
} from "./common";

const actorIdSchema = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).transform(String);
export const legistarConfigSchema = z.object({
  baseUrl: sourceUrlSchema.transform(baseUrl),
  role: z.string().trim().min(1),
  bodyId: z.number().int().positive().optional(),
  // Verified VotePersonId, not a pipeline candidate ID. The equivalent request
  // identifier is `legistar:{tenant}`, where tenant is the final base URL path.
  actorId: actorIdSchema.optional(),
  ...pagingShape,
});
export type LegistarConfig = z.input<typeof legistarConfigSchema>;

const eventSchema = z.object({
  EventId: sourceIdSchema,
  EventDate: sourceDateSchema,
  EventBodyId: sourceIdSchema.nullish(),
  EventBodyName: z.string().nullish(),
});
const flag = z.union([z.literal(0), z.literal(1)]).nullish();
const itemSchema = z.object({
  EventItemId: sourceIdSchema,
  EventItemEventId: sourceIdSchema.optional(),
  EventItemTitle: z.string().min(1),
  EventItemActionName: z.string().nullish(),
  EventItemActionText: z.string().nullish(),
  EventItemRollCallFlag: flag,
  EventItemConsent: flag,
  EventItemPassedFlag: flag,
});
export const legistarVoteSchema = z.object({
  VoteId: sourceIdSchema,
  VotePersonId: actorIdSchema,
  VotePersonName: z.string().min(1),
  // VoteResult/ValueId alone cannot distinguish abstention, absence or recusal.
  VoteValueName: z.string().min(1),
  VoteEventItemId: sourceIdSchema.optional(),
});

function explicitConsent(item: z.output<typeof itemSchema>): boolean {
  return item.EventItemConsent === 1 ||
    /\b(?:adopt(?:ed|ing)?|approv(?:e|ed|al|ing)|action on)\s+(?:the\s+)?consent agenda\b/i.test(item.EventItemActionName ?? "") ||
    /^(?:action on (?:the )?consent agenda|consent motion)$/i.test(item.EventItemTitle.trim());
}

export const legistarAdapter: RecordsAdapter = {
  kind: "legistar",
  async collect(context, input) {
    const parsed = legistarConfigSchema.safeParse(input);
    if (!parsed.success) return invalidConfig(this.kind);
    const config = collectionConfig(parsed.data, context);
    const tenant = new URL(config.baseUrl).pathname.split("/").filter(Boolean).at(-1)!;
    const identifier = context.request.candidate.identifiers?.[`legistar:${tenant}`];
    if (identifier !== undefined && !actorIdSchema.safeParse(identifier).success) {
      return { actions: [], status: "needs_review", reason: `Invalid legistar:${tenant} candidate identifier; no source requested.` };
    }
    if (identifier !== undefined && config.actorId !== undefined && identifier !== config.actorId) {
      return { actions: [], status: "needs_review", reason: "Configured Legistar actorId conflicts with the verified candidate identifier; no source requested." };
    }
    const actorId = config.actorId ?? identifier;
    const names = candidateNames(context.request);
    const url = new URL(`${config.baseUrl}/events`);
    url.searchParams.set("$filter", `EventDate ge datetime'${context.window.since}T00:00:00' and EventDate lt datetime'${context.window.before}T00:00:00'${config.bodyId === undefined ? "" : ` and EventBodyId eq ${config.bodyId}`}`);
    url.searchParams.set("$orderby", "EventDate,EventId");
    const options = { context, pageSize: config.pageSize, maxPages: config.maxPages };
    const collected = await pages({ ...options, url, parse: eventSchema.parse });
    const problems = [...collected.problems];
    const events = uniqueRows(collected.rows, (event) => event.EventId, problems, "event");
    const actions: OfficialAction[] = [];
    const matchedMemberIds = new Set<string>();
    let voteCount = 0;
    for (const eventRow of events) {
      const event = eventRow.value;
      if (!inWindow(event.EventDate, context.window)) continue;
      if (config.bodyId !== undefined && event.EventBodyId !== String(config.bodyId)) {
        problems.push(`Event ${event.EventId}: body ID mismatch; event skipped.`);
        continue;
      }
      const itemsResult = await pages({
        ...options, url: new URL(`${config.baseUrl}/events/${encodeURIComponent(event.EventId)}/eventitems`), parse: itemSchema.parse,
      });
      problems.push(...itemsResult.problems.map((problem) => `Event ${event.EventId}: ${problem}`));
      const items = uniqueRows(itemsResult.rows, (item) => item.EventItemId, problems, "event item");
      let eventVotes = 0;
      for (const itemRow of items) {
        const item = itemRow.value;
        if (item.EventItemEventId !== undefined && item.EventItemEventId !== event.EventId) {
          problems.push(`Item ${item.EventItemId}: event ID mismatch; item rejected.`);
          continue;
        }
        if (nonAction(item.EventItemActionName ?? "")) continue;
        // Do not filter by RollCallFlag: tenants can have actual member votes
        // on items whose flag is 0. Agendas alone do not prove no record.
        const votesResult = await pages({
          ...options, url: new URL(`${config.baseUrl}/eventitems/${encodeURIComponent(item.EventItemId)}/votes`), parse: legistarVoteSchema.parse,
        });
        problems.push(...votesResult.problems.map((problem) => `Item ${item.EventItemId}: ${problem}`));
        if (!votesResult.complete) continue; // No incomplete vote totals.
        const votes = votesResult.rows;
        if (!votes.length) {
          if (item.EventItemActionName || item.EventItemPassedFlag != null) {
            problems.push(`Item ${item.EventItemId}: action has no structured member votes; votes are unsupported or unpublished.`);
          }
          continue;
        }
        eventVotes += votes.length;
        voteCount += votes.length;
        const ids = votes.map((row) => row.value.VoteId);
        const memberIds = votes.map((row) => row.value.VotePersonId);
        const memberNames = votes.map((row) => normalizeName(row.value.VotePersonName));
        if (new Set(ids).size !== ids.length || new Set(memberIds).size !== memberIds.length ||
            new Set(memberNames).size !== memberNames.length ||
            votes.some((row) => row.value.VoteEventItemId !== undefined && row.value.VoteEventItemId !== item.EventItemId)) {
          problems.push(`Item ${item.EventItemId}: duplicate/conflicting votes or parent ID mismatch; tally rejected.`);
          continue;
        }
        const targets = votes.filter((row) => actorId !== undefined
          ? row.value.VotePersonId === actorId
          : names.has(normalizeName(row.value.VotePersonName)));
        if (targets.length !== 1) {
          problems.push(`Item ${item.EventItemId}: ${targets.length ? "multiple target aliases matched; identity requires review" : "target not recorded; participation is unknown, not absent"}.`);
          continue;
        }
        const target = targets[0].value;
        if (!names.has(normalizeName(target.VotePersonName))) {
          problems.push(`Item ${item.EventItemId}: member ID/name mismatch; add a verified full-name alias before attribution.`);
          continue;
        }
        const margin = tally(votes.map((row) => row.value.VoteValueName));
        if (!margin) {
          problems.push(`Item ${item.EventItemId}: unsupported vote value; tally rejected.`);
          continue;
        }
        const value = localVote(target.VoteValueName);
        matchedMemberIds.add(target.VotePersonId);
        actions.push({
          id: actionId(this.kind, config.baseUrl, event.EventId, item.EventItemId, target.VotePersonId),
          actorId: context.request.candidate.id, issueIds: [], role: config.role,
          body: event.EventBodyName ?? undefined, type: "floor_vote", stance: voteStance(value), margin,
          date: event.EventDate, title: item.EventItemTitle,
          officialText: [item.EventItemTitle, item.EventItemActionName, item.EventItemActionText].filter((value) => value != null && value !== "").join("\n"),
          sourceUrl: targets[0].snapshot.sourceUrl, extraction: "json",
          provenance: [
            provenance(eventRow.snapshot, `${this.kind}@1`, eventRow.locator),
            provenance(itemRow.snapshot, `${this.kind}@1`, itemRow.locator),
            ...votes.map((row) => provenance(row.snapshot, `${this.kind}@1`, row.locator)),
          ],
          ...(explicitConsent(item) ? { consent: true } : {}),
          attribution: { method: actorId === undefined ? "named_record" : "member_id", sourceActorId: target.VotePersonId },
          vote: {
            value, raw: target.VoteValueName, question: item.EventItemActionName || item.EventItemTitle,
            method: item.EventItemRollCallFlag === 1 ? "roll_call" : "unknown",
          },
        });
      }
      if (!eventVotes) problems.push(`Event ${event.EventId}: no structured member votes; agenda-only coverage cannot establish no record.`);
    }
    if (actorId === undefined && matchedMemberIds.size > 1) {
      problems.push("Full-name fallback matched different member IDs across items; target identity requires review and all target actions were withheld.");
      actions.length = 0;
    }
    return report(actions, problems, context.window,
      `${events.length} events and ${voteCount} member vote rows inspected; ${actions.length} target votes collected.`);
  },
};
