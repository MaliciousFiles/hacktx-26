import { createHash } from "node:crypto";
import type { OfficialAction, RecordProvenance } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { inWindow, isISODate, normalizeName, provenance } from "../model";
import type { Snapshot } from "../model";
import { parseTloBillHistory } from "./parser";
import type { TloBill, TloHistoryAction } from "./parser";
import { parseTloBillHistoryUrl, tloBillHistoryUrl } from "./urls";

export interface TloBillHistoryConfig {
  urls: string[];
  role: string;
  memberName?: string;
  /** Candidate bound to the upstream member-name assertion. Must match the
   * request candidate ID to use an abbreviated name; never reused batch-wide. */
  memberCandidateId?: string;
  /** Upstream-verified, session-specific crosswalk; this adapter does not parse it. */
  memberIdentitySourceUrl?: string;
  /** Sessions (e.g. "89R") the memberName crosswalk was verified for. */
  memberSessions?: string[];
  /** Verified Governor tenure, explicitly bound to this request's candidate ID.
   * End date is inclusive. candidateId is local metadata, not shared tenure data. */
  governorTenure?: { candidateId: string; start: string; end?: string; sourceUrl: string };
}

export interface TloParsedBill {
  bill: TloBill;
  provenance: RecordProvenance;
}

export interface TloBillHistoryResult extends AdapterResult {
  /** Unattributed, potentially undated/latest-state context, NOT OfficialAction[]. */
  bills: TloParsedBill[];
  /** Preserve the upstream identity evidence rather than inventing a snapshot for it. */
  memberIdentity?: { candidateId: string; memberName: string; sourceUrl: string };
}

const adapterVersion = "tlo-billhistory@1";

function officialTexasUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:", "ftp:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "texas.gov" ||
        url.hostname.endsWith(".texas.gov") ||
        url.hostname === "state.tx.us" ||
        url.hostname.endsWith(".state.tx.us"))
    );
  } catch {
    return false;
  }
}

const officialUrl = z
  .string()
  .refine(officialTexasUrl, "Expected an official Texas government evidence URL");
const date = z.string().refine(isISODate, "Expected a real YYYY-MM-DD date");
const configSchema = z
  .object({
    urls: z
      .array(
        z.string().transform((url, context) => {
          try {
            const id = parseTloBillHistoryUrl(url);
            return tloBillHistoryUrl(id.session, id.billType, id.billNumber);
          } catch {
            context.addIssue({
              code: "custom",
              message: "Expected a canonical TLO FTP bill-history XML URL",
            });
            return z.NEVER;
          }
        }),
      )
      .min(1),
    role: z.string().trim().min(1),
    memberName: z.string().trim().min(1).optional(),
    memberCandidateId: z.string().trim().min(1).optional(),
    memberIdentitySourceUrl: officialUrl.optional(),
    /** Sessions (e.g. "89R") the name crosswalk was verified for. A short name
     * like "Lopez" can identify a different member in another session. */
    memberSessions: z.array(z.string().regex(/^\d{2,3}(?:R|\d)$/)).min(1).optional(),
    governorTenure: z
      .object({
        candidateId: z.string().trim().min(1),
        start: date,
        end: date.optional(),
        sourceUrl: officialUrl,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.memberIdentitySourceUrl || value.memberCandidateId) && !value.memberName) {
      context.addIssue({ code: "custom", message: "Identity evidence requires memberName" });
    }
    if (value.governorTenure?.end && value.governorTenure.end < value.governorTenure.start) {
      context.addIssue({ code: "custom", message: "Governor tenure end precedes its start" });
    }
  });

function governorRole(role: string): boolean {
  const name = normalizeName(role).replace(/_/g, " ");
  return /\bgovernor\b/.test(name) && !/\b(?:lieutenant|lt)\b/.test(name);
}

function fullNames(context: AdapterContext): Set<string> {
  // Never turn a full candidate name into a surname/initials match. Aliases in
  // the shared contract are verified full-name aliases, not abbreviated rosters.
  return new Set(
    [context.request.candidate.name, ...(context.request.candidate.aliases ?? [])]
      .map(normalizeName)
      .filter((name) => name.split(/\s+/).length >= 2),
  );
}

function eventId(
  bill: TloBill,
  event: TloHistoryAction,
  actorId: string,
  member: string,
  type: OfficialAction["type"],
): string {
  const key = [
    bill.session,
    bill.billType,
    bill.billNumber,
    event.actionCode,
    event.date,
    actorId,
    normalizeName(member),
    type,
  ];
  return `tlo:${createHash("sha256").update(JSON.stringify(key)).digest("hex")}`;
}

function makeAction(
  context: AdapterContext,
  config: TloBillHistoryConfig,
  snapshot: Snapshot,
  bill: TloBill,
  event: TloHistoryAction,
  type: "authored" | "signed",
  member?: string,
): OfficialAction {
  const actorId = context.request.candidate.id;
  const primary = bill.affiliations.find((item) => item.kind === "primary_author");
  // Candidate binding is adapter-only metadata. Project only the shared tenure
  // fields rather than spreading the upstream assertion into an OfficialAction.
  const tenure = config.governorTenure && {
    start: config.governorTenure.start,
    end: config.governorTenure.end,
    sourceUrl: config.governorTenure.sourceUrl,
  };
  return {
    id: eventId(bill, event, actorId, member ?? actorId, type),
    actorId,
    issueIds: [],
    role: config.role,
    body:
      type === "signed"
        ? "Texas Governor"
        : bill.chamber === "house"
          ? "Texas House of Representatives"
          : "Texas Senate",
    type,
    stance: type === "authored" ? "author" : "n/a",
    date: event.date,
    title: `${bill.bill}: ${event.description}`,
    // The latest (often enrolled) caption is not backdated to filing. The raw
    // source remains immutable in SnapshotClient; these are XML field values.
    officialText: [
      event.description,
      event.comment,
      type === "authored" ? primary?.name : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
    sourceUrl: snapshot.sourceUrl,
    extraction: "xml",
    provenance: [
      provenance(snapshot, adapterVersion, event.locator),
      ...(type === "authored" && primary
        ? [provenance(snapshot, adapterVersion, primary.locator)]
        : []),
    ],
    attribution:
      type === "signed"
        ? { method: "office_tenure", tenure }
        : { method: "named_record", sourceActorId: member },
  };
}

async function collect(context: AdapterContext, value: unknown): Promise<TloBillHistoryResult> {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    return {
      actions: [],
      bills: [],
      status: "needs_review",
      reason: `Invalid TLO configuration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    };
  }
  const config = parsed.data;
  const governor = governorRole(config.role);
  if (governor && !config.governorTenure) {
    return {
      actions: [],
      bills: [],
      status: "needs_review",
      reason:
        "Governor actions require verified governorTenure dates, an official tenure source URL, and a matching candidateId.",
    };
  }
  if (!governor && config.governorTenure) {
    return {
      actions: [],
      bills: [],
      status: "needs_review",
      reason:
        "governorTenure requires an explicit Governor role, not a legislator or Lieutenant Governor role.",
    };
  }
  if (config.governorTenure && config.governorTenure.candidateId !== context.request.candidate.id) {
    return {
      actions: [],
      bills: [],
      status: "needs_review",
      reason: "governorTenure.candidateId must match the request candidate ID; tenure cannot be reused for another candidate.",
    };
  }

  const names = fullNames(context);
  const mappedName =
    config.memberName && config.memberIdentitySourceUrl && config.memberSessions &&
      config.memberCandidateId === context.request.candidate.id
      ? normalizeName(config.memberName)
      : undefined;
  const mappedSessions = new Set(config.memberSessions ?? []);
  let outsideSession = 0;
  const unverifiedMapping =
    !!config.memberName && !mappedName && !names.has(normalizeName(config.memberName));
  const memberIdentity = mappedName
    ? {
        candidateId: config.memberCandidateId!,
        memberName: config.memberName!,
        sourceUrl: config.memberIdentitySourceUrl!,
      }
    : undefined;
  const actions = new Map<string, OfficialAction>();
  const bills: TloParsedBill[] = [];
  let failures = 0;
  let duplicates = 0;
  for (const url of new Set(config.urls)) {
    let snapshot: Snapshot;
    let bill: TloBill;
    try {
      snapshot = await context.client.get(url, { format: "xml", root: "billhistory" });
      bill = parseTloBillHistory(snapshot.text);
      const expected = parseTloBillHistoryUrl(url);
      const received = parseTloBillHistoryUrl(snapshot.sourceUrl);
      if (
        [expected, received].some(
          (id) =>
            id.session !== bill.session ||
            id.billType !== bill.billType ||
            id.billNumber !== bill.billNumber,
        )
      ) {
        throw new Error("TLO source URL and XML bill identity disagree");
      }
    } catch {
      failures++;
      continue;
    }
    bills.push({ bill, provenance: provenance(snapshot, adapterVersion, "/billhistory") });
    for (const event of bill.actions) {
      if (!inWindow(event.date, context.window)) continue;
      let action: OfficialAction | undefined;
      if (governor) {
        const tenure = config.governorTenure!;
        // E020 + this explicit description is verified in 89(R) HB 2. H850 /
        // S850 are ministerial signatures. Veto codes need a verified sample.
        if (
          event.actionCode === "E020" &&
          /^signed by (?:the )?governor$/i.test(event.description) &&
          event.date >= tenure.start &&
          (!tenure.end || event.date <= tenure.end)
        ) {
          action = makeAction(context, config, snapshot, bill, event, "signed");
        }
      } else if (/^filed$/i.test(event.description) && event.chamber === bill.chamber) {
        const primary = bill.affiliations.find((item) => item.kind === "primary_author");
        const viaMapping = !!primary && mappedName === normalizeName(primary.name);
        if (viaMapping && !mappedSessions.has(bill.session)) outsideSession++;
        if (
          primary &&
          (names.has(normalizeName(primary.name)) || (viaMapping && mappedSessions.has(bill.session)))
        ) {
          action = makeAction(context, config, snapshot, bill, event, "authored", primary.name);
        }
      }
      if (action) {
        if (actions.has(action.id)) duplicates++;
        else actions.set(action.id, action);
      }
    }
  }
  const notes = [
    governor
      ? "Only E020 Governor signings within verified tenure are attributed; vetoes require a verified source sample."
      : "Only the primary author's dated filing is attributed. Joint/coauthor/sponsor/cosponsor rosters are undated context; no join dates are inferred. Affiliation-addition events require separate verification and are retained but not attributed.",
    "Bill history has no individual votes: committee totals and journal vote references remain unattributed context. Latest captions are not backdated.",
    ...(unverifiedMapping
      ? [
          "memberName was not used: surname/abbreviated mappings require an official memberIdentitySourceUrl, memberSessions, and a memberCandidateId matching the request candidate ID.",
        ]
      : []),
    ...(outsideSession
      ? [`${outsideSession} filing(s) matched memberName outside the verified memberSessions and were not attributed.`]
      : []),
    ...(failures
      ? [`${failures} configured XML source(s) could not be read or failed validation.`]
      : []),
    ...(duplicates ? [`${duplicates} duplicate attributed event(s) were omitted.`] : []),
  ];
  return {
    actions: [...actions.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
    bills,
    memberIdentity,
    status: unverifiedMapping
      ? "needs_review"
      : failures && bills.length === 0
        ? "unavailable"
        : "partial",
    reason: notes.join(" "),
  };
}

export const tloBillHistoryAdapter = { kind: "tlo-billhistory", collect } satisfies RecordsAdapter;
