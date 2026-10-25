// B3 · Candidate card. Every candidate in a contest gets this exact layout, in this order, with
// the same empty states (Inv. 9). Sections are never hidden based on alignment (Inv. 22).
import type { CandidateProfile, Contest, PresentedEvidence } from "@ftb/types";
import { computeContestMatch } from "@ftb/types/scoring";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import {
  AlignmentDetail,
  countFlags,
  FLAG_EMOJI,
  JudicialQualifications,
} from "@/components/evidence";
import {
  Accordion,
  Chip,
  ChipRow,
  CitationChip,
  CitedText,
  Empty,
  kitStyles,
  MaskTile,
  PoleLine,
  SlotRow,
} from "@/components/kit";
import { Banner, Note, SampleMark, Screen, Section, Title, TopBar } from "@/components/ui";
import {
  cards,
  contestById,
  demo,
  evidenceItem,
  issueById,
  issueLabel,
  orderedProfiles,
  profileById,
} from "@/data/release";
import { formatIsoDate, formatMoney } from "@/format";
import { usePhaseGate, WALKING } from "@/gate";
import { FLAG_COPY, SLOT_LABEL, SOURCE_LABEL, TIER_LABEL } from "@/labels";
import { userVectorFor } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

const PLAN_SLOTS = ["goal", "mechanism", "cost", "funding", "timeline", "whoActs"] as const;
const PROMISE_ICON = {
  kept: "✅",
  fought_for: "🛠️",
  broken: "❌",
  no_action: "⏸️",
  outside_power: "🚫",
} as const;

export default function CandidateScreen() {
  const router = useRouter();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = usePhaseGate(WALKING);
  if (gate) return gate;

  const profile = profileById(id);
  const contest = contestById(profile?.contestId);
  if (!profile || !contest) {
    return (
      <Screen header={<TopBar onBack={() => router.back()} />}>
        <Title>That candidate isn&apos;t in this release.</Title>
      </Screen>
    );
  }

  const mask = session.masks[profile.id];
  const identity = session.identityFor(profile.id);
  const judicial = contest.officeKind === "judicial";

  return (
    <Screen header={<TopBar onBack={() => router.back()} backLabel="Contest" />}>
      {demo ? <SampleMark /> : null}

      {/* 1 · Mask header */}
      <View style={styles.header}>
        <MaskTile mask={mask} name={identity?.name} size={120} />
        <Text accessibilityRole="header" style={styles.name}>
          {session.nameFor(profile.id)}
        </Text>
        <Text style={styles.sub}>
          {identity
            ? [identity.party, `You knew them as ${mask?.character ?? "a masked character"}`]
                .filter(Boolean)
                .join(" · ")
            : (mask?.title ?? "A character for this session only")}
        </Text>
        <ChipRow>
          {profile.incumbent ? <Chip label="Incumbent" tone="plain" /> : null}
          {profile.recordInOffice === "none" ? (
            <Chip label="No record in office" tone="plain" icon="info" />
          ) : (
            <Chip label={`Record in ${profile.recordInOffice} office`} tone="plain" />
          )}
        </ChipRow>
        {profile.recordInOffice === "none" ? (
          <Note>Based on what they say, not what they&apos;ve done.</Note>
        ) : null}
        {!identity ? <Note>{contest.title}</Note> : null}
      </View>

      {profile.coverage === "objective_only" ? (
        <Banner
          title="Objective information only"
          body="There isn't enough public evidence to compare this candidate fairly. What's documented is below."
        />
      ) : null}

      <EvidenceClarity profile={profile} />
      {!judicial ? <AgreeDiffer contest={contest} profile={profile} /> : null}

      <Section title="Platform highlights" icon="scroll">
        {profile.platformHighlights.length > 0 ? (
          <CitedText sentences={profile.platformHighlights} />
        ) : (
          <Empty>No platform found in reviewed sources.</Empty>
        )}
      </Section>

      {judicial ? (
        <Section title="Objective qualifications" icon="gavel">
          <JudicialQualifications profile={profile} />
        </Section>
      ) : (
        <>
          <PlanExplorer profile={profile} />
          <Flags profile={profile} />
          <SaysVsDoes profile={profile} />
        </>
      )}

      <Money profile={profile} />

      {!judicial ? (
        <Section title="Bipartisanship" icon="scale">
          {profile.bipartisanship ? (
            <Text style={kitStyles.copy}>
              {profile.bipartisanship.label === "bipartisanship"
                ? "Bipartisanship"
                : "Coalition breadth"}
              {profile.bipartisanship.composite != null
                ? `: ${Math.round(profile.bipartisanship.composite * 100)} of 100`
                : ""}
            </Text>
          ) : (
            <Empty>Not available.</Empty>
          )}
        </Section>
      ) : null}

      <Section title="Fact-checks" icon="check">
        {profile.truthfulness.factChecks.length > 0 ? (
          profile.truthfulness.factChecks.map((check, index) => (
            <View key={index} style={kitStyles.quote}>
              <CitedText sentences={check.claim} />
              <Text style={kitStyles.meta}>
                {check.outlet} rated it “{check.rating}” · {formatIsoDate(check.date)}
              </Text>
            </View>
          ))
        ) : (
          <Empty>No fact-checks found. Coverage is uneven.</Empty>
        )}
      </Section>

      {profile.promiseKept.length > 0 || profile.recordInOffice !== "none" ? (
        <Section title="Promise kept" icon="book">
          {profile.promiseKept.length > 0 ? (
            profile.promiseKept.map((promise, index) => (
              <View key={index} style={styles.promise}>
                <Text style={styles.promiseIcon}>{PROMISE_ICON[promise.status]}</Text>
                <View style={styles.fill}>
                  <CitedText sentences={promise.promise} />
                </View>
              </View>
            ))
          ) : (
            <Empty>No tracked promises in this release.</Empty>
          )}
        </Section>
      ) : null}

      {!judicial && profile.coverage !== "objective_only" ? (
        <Accordion title="How your answers line up">
          <CandidateAlignment contest={contest} profile={profile} />
        </Accordion>
      ) : null}
    </Screen>
  );
}

function EvidenceClarity({ profile }: { profile: CandidateProfile }) {
  const states = Object.values(profile.issueEvidenceState);
  const withEvidence = states.filter((state) => state !== "none").length;
  const actions = profile.evidence.filter((item) => item.kind === "action").length;
  const words = profile.evidence.length - actions;
  return (
    <Section title="Evidence clarity" icon="sparkle">
      {profile.evidenceState === "thin" || profile.evidenceState === "none" ? (
        <Banner
          tone="rose"
          title="Thin evidence"
          body="Read what's here as a starting point, not the whole story."
        />
      ) : null}
      <Text style={kitStyles.copy}>
        Issues with evidence: {withEvidence} of {states.length}
      </Text>
      <Text style={kitStyles.copy}>
        Source mix: {actions} action{actions === 1 ? "" : "s"} · {words} statement
        {words === 1 ? "" : "s"}
      </Text>
    </Section>
  );
}

function EvidenceQuote({ item }: { item: PresentedEvidence }) {
  return (
    <View style={kitStyles.quote}>
      <Text style={kitStyles.quoteText}>“{item.excerpt}”</Text>
      <Text style={kitStyles.meta}>
        {item.redacted ? "Excerpt, names removed" : "Verbatim"} · {issueLabel(item.issueId)} ·{" "}
        {formatIsoDate(item.date)}
      </Text>
      <ChipRow>
        <Chip label={SOURCE_LABEL[item.sourceType]} tone="plain" />
      </ChipRow>
    </View>
  );
}

function AgreeDiffer({ contest, profile }: { contest: Contest; profile: CandidateProfile }) {
  const session = useSession();
  const userVector = userVectorFor(cards, session.state.swipes);
  const profiles = orderedProfiles(contest, session.state.order[contest.id]);
  const result = computeContestMatch(userVector, contest, profiles).results.find(
    (item) => item.candidateId === profile.id,
  );
  const agree = (result?.agreements ?? []).flatMap((id) => evidenceItem(id) ?? []).slice(0, 3);
  const differ = (result?.disagreements ?? []).flatMap((id) => evidenceItem(id) ?? []).slice(0, 3);
  return (
    <Section title="Where you agree / differ" icon="scale">
      {agree.length === 0 && differ.length === 0 ? (
        <Empty>Not enough overlap with your answers to compare.</Empty>
      ) : (
        <>
          <Text style={[kitStyles.label, styles.gap]}>Where you agree</Text>
          {agree.length > 0 ? (
            agree.map((item) => <EvidenceQuote key={item.id} item={item} />)
          ) : (
            <Empty>None found.</Empty>
          )}
          <Text style={[kitStyles.label, styles.gap]}>Where you differ</Text>
          {differ.length > 0 ? (
            differ.map((item) => <EvidenceQuote key={item.id} item={item} />)
          ) : (
            <Empty>None found.</Empty>
          )}
        </>
      )}
    </Section>
  );
}

function PlanExplorer({ profile }: { profile: CandidateProfile }) {
  return (
    <>
      <Section title="Plan Explorer" icon="book">
        {profile.plans.length === 0 ? <Empty>No specific plans found.</Empty> : null}
        {profile.plans.map((plan) => (
          <View key={plan.id} style={kitStyles.card}>
            <Text style={styles.planTitle}>{issueLabel(plan.issueId)}</Text>
            {PLAN_SLOTS.map((slot) => (
              <SlotRow key={slot} label={SLOT_LABEL[slot]} slot={plan[slot]} />
            ))}
          </View>
        ))}
      </Section>
      {profile.plans.length > 0 ? (
        <Section title="Plan detail" icon="star">
          <ChipRow>
            <Chip label={TIER_LABEL[profile.specificity.tier] ?? "Limited detail"} tone="gold" />
            <Chip label={`Score ${Math.round(profile.specificity.score * 100)}`} tone="plain" />
            <Chip
              label={`${profile.plans.length} plan${profile.plans.length === 1 ? "" : "s"}`}
              tone="plain"
            />
          </ChipRow>
          <Note>How specific the plans are, not whether they&apos;re true or achievable.</Note>
        </Section>
      ) : null}
    </>
  );
}

function Flags({ profile }: { profile: CandidateProfile }) {
  const counts = countFlags(profile);
  return (
    <Section title="Credibility flags" icon="info">
      {counts.length === 0 ? <Empty>No flags.</Empty> : null}
      {profile.credibility.flags.map((flag, index) => (
        <View key={`${flag.type}-${flag.issueId}-${index}`} style={kitStyles.card}>
          <Text style={styles.flagTitle}>
            {FLAG_EMOJI[flag.type]} {FLAG_COPY[flag.type].title}
          </Text>
          <Text style={kitStyles.copy}>
            {issueLabel(flag.issueId)}. {FLAG_COPY[flag.type].detail}
          </Text>
          <View style={styles.citeRow}>
            {flag.evidenceIds.map((evidenceId, n) => (
              <CitationChip
                key={evidenceId}
                refItem={{ kind: "candidate", id: evidenceId }}
                n={n + 1}
              />
            ))}
          </View>
        </View>
      ))}
    </Section>
  );
}

function SaysVsDoes({ profile }: { profile: CandidateProfile }) {
  return (
    <Section title="Says vs. does" icon="scale">
      {profile.saysVsDoes.length === 0 ? <Empty>Not enough record to compare.</Empty> : null}
      {profile.saysVsDoes.map((row) => {
        const issue = issueById(row.issueId);
        return (
          <View key={row.issueId} style={styles.gap}>
            <Text style={kitStyles.label}>{issueLabel(row.issueId)}</Text>
            <PoleLine
              left={issue?.negativePole ?? "One pole"}
              right={issue?.positivePole ?? "Other pole"}
              marks={[
                { key: "says", label: "Official / speech", position: row.says ?? null },
                { key: "social", label: "Social", position: row.social ?? null },
                { key: "does", label: "Record", position: row.does ?? null },
              ]}
            />
            {row.gap > 0 ? (
              <Text style={kitStyles.copy}>
                What they say and what the record shows point different ways here.
              </Text>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

function Money({ profile }: { profile: CandidateProfile }) {
  const funding = profile.funding;
  return (
    <Section title="Follow the money" icon="coins">
      {!funding ? (
        <Empty>No filings found. That doesn&apos;t mean $0.</Empty>
      ) : (
        <>
          <Text style={kitStyles.copy}>
            {formatIsoDate(funding.period.start)} – {formatIsoDate(funding.period.end)}
          </Text>
          <Text style={kitStyles.copy}>Direct receipts: {formatMoney(funding.direct)}</Text>
          <Text style={kitStyles.copy}>Outside spending: {formatMoney(funding.outside)}</Text>
          <Note>These are separate. They are never added into one total.</Note>
          <Text style={kitStyles.copy}>
            Small donors: {formatMoney(funding.traced.receipts.unitemizedSmall)}. Small donors, not
            dark money.
          </Text>
          {funding.darkShare ? (
            <Text style={kitStyles.copy}>
              Untraceable share of outside spending: {Math.round(funding.darkShare.min * 100)}%
              {funding.darkShare.max != null ? `–${Math.round(funding.darkShare.max * 100)}%` : "+"}
            </Text>
          ) : null}
          {funding.topIndustries.map((industry) => (
            <Text key={industry.industry} style={kitStyles.copy}>
              {industry.industry} (inferred): {formatMoney(industry.amount)}
            </Text>
          ))}
          {funding.inStateShare != null ? (
            <Text style={kitStyles.copy}>
              In-state share: {Math.round(funding.inStateShare * 100)}%
            </Text>
          ) : null}
        </>
      )}
    </Section>
  );
}

function CandidateAlignment({ contest, profile }: { contest: Contest; profile: CandidateProfile }) {
  const session = useSession();
  const userVector = userVectorFor(cards, session.state.swipes);
  const profiles = orderedProfiles(contest, session.state.order[contest.id]);
  const match = computeContestMatch(userVector, contest, profiles);
  return (
    <AlignmentDetail
      match={{ ...match, results: match.results.filter((r) => r.candidateId === profile.id) }}
      profiles={[profile]}
      userVector={userVector}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { alignItems: "center", gap: 6 },
  name: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 32,
    lineHeight: 37,
    textAlign: "center",
    marginTop: 8,
  },
  sub: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 15, textAlign: "center" },
  gap: { marginTop: 12 },
  planTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19 },
  flagTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
  citeRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  promise: { flexDirection: "row", gap: 10, marginTop: 10 },
  promiseIcon: { fontSize: 18 },
});
