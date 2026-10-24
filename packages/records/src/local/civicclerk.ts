import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { candidateNames, inWindow, normalizeName, provenance, voteStance } from "../model";
import {
  actionId, baseUrl, invalidConfig, nonAction, pages, pagingShape, report,
  sourceDateSchema, sourceIdSchema, sourceUrlSchema, uniqueRows,
} from "./common";
import type { Located } from "./common";

export const civicClerkConfigSchema = z.object({
  baseUrl: sourceUrlSchema.transform(baseUrl),
  role: z.string().trim().min(1),
  ...pagingShape,
});
export type CivicClerkConfig = z.input<typeof civicClerkConfigSchema>;

const eventSchema = z.object({
  id: sourceIdSchema,
  startDateTime: sourceDateSchema.optional(),
  eventDate: sourceDateSchema.optional(),
  agendaId: sourceIdSchema.nullish(),
  eventName: z.string().nullish(),
  categoryName: z.string().nullish(),
}).refine((event) => event.startDateTime !== undefined || event.eventDate !== undefined,
  "Event date is required");

// Arrays are optional in the schema so an unpublished/incomplete motion can
// be reported as partial, not mistaken for an empty complete roll call.
export const civicClerkMotionSchema = z.object({
  motionName: z.string().min(1),
  initiatedBy: z.string().nullish(),
  secondedBy: z.string().nullish(),
  passFail: z.union([z.number(), z.string()]).nullish(),
  yesVotes: z.array(z.string().refine((name) => normalizeName(name).length > 0)).nullish(),
  noVotes: z.array(z.string().refine((name) => normalizeName(name).length > 0)).nullish(),
  abstainVotes: z.array(z.string().refine((name) => normalizeName(name).length > 0)).nullish(),
});

interface CivicItem {
  id: string;
  agendaObjectItemName: string;
  agendaObjectItemDescription?: string | null;
  minutesItemVotes?: z.output<typeof civicClerkMotionSchema>[] | null;
  childItems?: CivicItem[] | null;
}
const itemSchema: z.ZodType<CivicItem> = z.lazy(() => z.object({
  id: sourceIdSchema,
  agendaObjectItemName: z.string(),
  agendaObjectItemDescription: z.string().nullish(),
  minutesItemVotes: z.array(civicClerkMotionSchema).nullish(),
  childItems: z.array(itemSchema).nullish(),
}));
const meetingSchema = z.object({ id: sourceIdSchema.optional(), items: z.array(itemSchema) });

function flatten(items: CivicItem[], pointer = "/items", depth = 0): { value: CivicItem; locator: string }[] {
  if (depth > 50) throw new Error("Nested item depth exceeds the traversal guard");
  return items.flatMap((value, index) => {
    const locator = `${pointer}/${index}`;
    return [{ value, locator }, ...flatten(value.childItems ?? [], `${locator}/childItems`, depth + 1)];
  });
}

export const civicClerkAdapter: RecordsAdapter = {
  kind: "civicclerk",
  async collect(context, input) {
    const parsed = civicClerkConfigSchema.safeParse(input);
    if (!parsed.success) return invalidConfig(this.kind);
    const config = parsed.data;
    const url = new URL(`${config.baseUrl}/Events`);
    url.searchParams.set("$filter", `startDateTime ge ${context.window.since}T00:00:00Z and startDateTime lt ${context.window.before}T00:00:00Z`);
    url.searchParams.set("$orderby", "startDateTime,id");
    const collected = await pages({ context, url, pageSize: config.pageSize, maxPages: config.maxPages, parse: eventSchema.parse });
    const problems = [...collected.problems];
    const events = uniqueRows(collected.rows, (event) => event.id, problems, "event");
    const names = candidateNames(context.request);
    const actions: OfficialAction[] = [];
    let motionCount = 0;
    for (const eventRow of events) {
      const event = eventRow.value;
      const date = event.startDateTime ?? event.eventDate!;
      if (!inWindow(date, context.window)) continue;
      if (event.eventDate !== undefined && event.startDateTime !== undefined && event.eventDate !== event.startDateTime) {
        problems.push(`Event ${event.id}: conflicting event dates; meeting skipped.`);
        continue;
      }
      if (!event.agendaId || event.agendaId === "0") {
        problems.push(`Event ${event.id}: no published agenda/meeting ID; structured minutes unavailable.`);
        continue;
      }
      try {
        const snapshot = await context.client.get(`${config.baseUrl}/Meetings/${encodeURIComponent(event.agendaId)}`, { format: "json" });
        const meeting = meetingSchema.parse(JSON.parse(snapshot.text));
        if (meeting.id !== undefined && meeting.id !== event.agendaId) {
          problems.push(`Event ${event.id}: meeting ID does not match agendaId; meeting rejected.`);
          continue;
        }
        const items: Located<CivicItem>[] = flatten(meeting.items).map((item) => ({ ...item, snapshot }));
        const uniqueItems = uniqueRows(items, (item) => item.id, problems, "agenda item");
        let eventMotions = 0;
        for (const itemRow of uniqueItems) {
          const item = itemRow.value;
          // A consent motion stays one motion. Its vote is never inherited by
          // child items, which must have their own explicit minutesItemVotes.
          for (const [index, motion] of (item.minutesItemVotes ?? []).entries()) {
            motionCount++;
            eventMotions++;
            if (nonAction(motion.motionName)) continue;
            const locator = `${itemRow.locator}/minutesItemVotes/${index}`;
            if (!motion.yesVotes || !motion.noVotes || !motion.abstainVotes) {
              problems.push(`Event ${event.id}, item ${item.id}, motion ${index}: vote arrays missing; participation unknown.`);
              continue;
            }
            const ballots = [
              ...motion.yesVotes.map((name) => ({ name, value: "yes" as const, raw: "yesVotes" })),
              ...motion.noVotes.map((name) => ({ name, value: "no" as const, raw: "noVotes" })),
              ...motion.abstainVotes.map((name) => ({ name, value: "abstain" as const, raw: "abstainVotes" })),
            ];
            const normalized = ballots.map((ballot) => normalizeName(ballot.name));
            if (new Set(normalized).size !== ballots.length) {
              problems.push(`Event ${event.id}, item ${item.id}, motion ${index}: duplicate/conflicting voter names; tally rejected.`);
              continue;
            }
            const targets = ballots.filter((ballot) => names.has(normalizeName(ballot.name)));
            if (targets.length !== 1) {
              problems.push(`Event ${event.id}, item ${item.id}, motion ${index}: ${targets.length ? "multiple target aliases matched; identity requires review" : "target not named; participation is unknown, not absent"}.`);
              continue;
            }
            const target = targets[0];
            actions.push({
              id: actionId(this.kind, config.baseUrl, event.id, item.id, index, context.request.candidate.id),
              actorId: context.request.candidate.id, issueIds: [], role: config.role,
              body: event.categoryName ?? event.eventName ?? undefined,
              type: "floor_vote", stance: voteStance(target.value),
              margin: { yes: motion.yesVotes.length, no: motion.noVotes.length, abstain: motion.abstainVotes.length },
              date, title: item.agendaObjectItemName || motion.motionName,
              // Preserve JSON strings verbatim, including any embedded markup.
              officialText: [item.agendaObjectItemName, item.agendaObjectItemDescription, motion.motionName].filter((value) => value != null && value !== "").join("\n"),
              sourceUrl: snapshot.sourceUrl, extraction: "json",
              provenance: [
                provenance(eventRow.snapshot, `${this.kind}@1`, eventRow.locator),
                provenance(snapshot, `${this.kind}@1`, itemRow.locator),
                provenance(snapshot, `${this.kind}@1`, locator),
              ],
              ...(normalizeName(item.agendaObjectItemName) === "consent motion" ? { consent: true } : {}),
              attribution: { method: "named_record" },
              // There is no literal vote-value string in this format: retain
              // the raw JSON field and exact source name rather than invent it.
              vote: { value: target.value, raw: `${target.raw}: ${target.name}`, question: motion.motionName, method: "unknown" },
            });
          }
        }
        if (!eventMotions) problems.push(`Event ${event.id}: no structured minutes motions; votes may be unpublished or unsupported.`);
      } catch {
        problems.push(`Event ${event.id}: meeting request or JSON schema validation failed.`);
      }
    }
    return report(actions, problems, context.window,
      `${events.length} events inspected; ${motionCount} motions and ${actions.length} target votes found in the government-designated CivicClerk JSON source.`);
  },
};
