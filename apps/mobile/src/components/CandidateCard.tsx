import type { CandidateProfile, Contest, Position } from "@ftb/types";
import { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { issueById } from "@/fixtures/travisDemo";
import { useCandidateName } from "@/candidateName";
import { formatIsoDate, formatMoney, monogram } from "@/format";
import { FLAG_COPY, SOURCE_LABEL } from "@/labels";
import { proximity } from "@/matching";
import { colors, fonts, shadows } from "@/theme";
import { Portrait } from "@/components/Portrait";
import { Banner, ChoiceButton, Note, TextButton } from "@/components/ui";
import { useSession } from "@/session";
import { Chip, ChipRow, Disclosure, QuoteCard, Stat } from "@/components/cardKit";

const PLAN_SLOTS = [
  ["goal", "Goal"],
  ["mechanism", "How"],
  ["cost", "Cost"],
  ["funding", "Funding"],
  ["timeline", "When"],
  ["whoActs", "Who acts"],
] as const;

export function CandidateCard({
  contest,
  profile,
  userPositions,
}: {
  contest: Contest;
  profile: CandidateProfile;
  userPositions: Partial<Record<string, Position>>;
}) {
  const [showAlignment, setShowAlignment] = useState(false);
  const { name, subtitle, character } = useCandidateName(contest, profile);
  const session = useSession();
  const pick = session.picks[contest.id];
  const isPick = pick?.kind === "candidate" && pick.candidateId === profile.id;
  const objective = profile.coverage === "objective_only" || profile.evidenceState === "none";

  return (
    <View style={styles.card}>
      <View style={styles.identity}>
        {character ? (
          <Portrait character={character} size={64} />
        ) : (
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>{monogram(name)}</Text>
          </View>
        )}
        <View style={styles.identityText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.pickRow}>
        <ChoiceButton
          label={isPick ? "Your pick ✓ (tap to undo)" : "Pick this one"}
          selected={isPick}
          onPress={() =>
            session.setPick(
              contest.id,
              isPick ? null : { kind: "candidate", candidateId: profile.id },
            )
          }
        />
      </View>

      <ChipRow>
        {profile.incumbent ? <Chip label="Incumbent" tone="gold" /> : null}
        {profile.recordInOffice === "none" ? (
          <Chip label="Based on what they say, not what they've done" />
        ) : (
          <Chip label="Has a record in office" tone="forest" icon="check" />
        )}
      </ChipRow>

      {objective ? (
        <Banner
          title="Objective information"
          body="There isn't enough comparable evidence to line this up with your answers. What is documented is below."
        />
      ) : null}

      {profile.platformHighlights.length > 0 ? (
        <View style={styles.highlights}>
          <Text style={styles.blockLabel}>In their own words</Text>
          {profile.platformHighlights.map((sentence) => (
            <View key={sentence.text} style={styles.bullet}>
              <View style={styles.gem} />
              <Text style={styles.bulletText}>{sentence.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {profile.evidence.length > 0 ? (
        <Disclosure
          title="Evidence"
          icon="sparkle"
          count={`${profile.evidence.length}`}
          defaultOpen
        >
          {profile.evidence.map((item) => (
            <QuoteCard
              key={item.id}
              excerpt={item.excerpt}
              chips={
                <>
                  <Chip label={issueById(item.issueId)?.label ?? item.issueId} tone="gold" />
                  <Chip
                    label={SOURCE_LABEL[item.sourceType]}
                    tone={item.kind === "action" ? "forest" : "plain"}
                  />
                  <Chip
                    label={
                      item.eventDate.date ? formatIsoDate(item.eventDate.date) : "Date unknown"
                    }
                    icon="calendar"
                  />
                  {item.redacted ? <Chip label="Redacted" /> : null}
                </>
              }
            />
          ))}
          <Note>
            Source links stay hidden until a later release can return them after the reveal.
          </Note>
        </Disclosure>
      ) : null}

      {profile.plans.length > 0 ? (
        <Disclosure title="Plans" icon="book" count={`${profile.plans.length}`}>
          <Note>Filled slots only. This is not a score of whether a plan is true or possible.</Note>
          {profile.plans.map((plan) => (
            <PlanBlock key={plan.id} plan={plan} />
          ))}
        </Disclosure>
      ) : null}

      {profile.credibility.flags.length > 0 ? (
        <Disclosure
          title="Worth a second look"
          icon="info"
          count={`${profile.credibility.flags.length}`}
        >
          {profile.credibility.flags.map((flag) => (
            <View key={`${flag.type}-${flag.issueId}`} style={styles.flag}>
              <View style={styles.flagHead}>
                <Chip
                  label={issueById(flag.issueId)?.label ?? flag.issueId}
                  tone={
                    flag.type === "funded"
                      ? "forest"
                      : flag.type === "beyond_power"
                        ? "rose"
                        : "gold"
                  }
                />
                <Text style={styles.flagTitle}>{FLAG_COPY[flag.type].title}</Text>
              </View>
              <Text style={styles.paragraph}>{FLAG_COPY[flag.type].detail}</Text>
            </View>
          ))}
        </Disclosure>
      ) : null}

      {profile.saysVsDoes.length > 0 ? (
        <Disclosure title="Says and does" icon="scale" count={`${profile.saysVsDoes.length}`}>
          {profile.saysVsDoes.map((gap) => (
            <View key={gap.issueId} style={styles.flag}>
              <Chip label={issueById(gap.issueId)?.label ?? gap.issueId} tone="gold" />
              <Text style={styles.paragraph}>
                Public statements and recorded actions point different ways here.
              </Text>
            </View>
          ))}
        </Disclosure>
      ) : null}

      {profile.judicialProfile ? (
        <Disclosure title="On the record" icon="gavel" defaultOpen>
          <View style={styles.stats}>
            <Stat
              label="Years in practice"
              value={
                profile.judicialProfile.experienceYears != null
                  ? `${profile.judicialProfile.experienceYears}`
                  : "Not stated"
              }
            />
            <Stat
              label="Board certification"
              value={profile.judicialProfile.boardCertified ? "Listed" : "Not listed"}
            />
          </View>
          <Note>
            Philosophy is not compared here. Read the available evidence rather than a policy score.
          </Note>
        </Disclosure>
      ) : null}

      {profile.funding ? <Money profile={profile} /> : null}

      {!objective && contest.officeKind !== "judicial" ? (
        <>
          <TextButton
            label={
              showAlignment
                ? "Hide comparison with my answers"
                : "Compare with my answers (optional)"
            }
            onPress={() => setShowAlignment(!showAlignment)}
          />
          {showAlignment ? <Alignment profile={profile} userPositions={userPositions} /> : null}
        </>
      ) : null}
    </View>
  );
}

function PlanBlock({ plan }: { plan: CandidateProfile["plans"][number] }) {
  const slots = [plan.goal, plan.mechanism, plan.cost, plan.funding, plan.timeline, plan.whoActs];
  const applicable = slots.filter((slot) => slot.state !== "not_applicable");
  const filled = applicable.filter((slot) => slot.state === "documented").length;
  return (
    <View style={styles.plan}>
      <View style={styles.planHead}>
        <Text style={styles.planIssue}>{issueById(plan.issueId)?.label ?? plan.issueId}</Text>
        <Text style={styles.planCount}>
          {filled} of {applicable.length} filled
        </Text>
      </View>
      <View style={styles.meter}>
        <View
          style={[
            styles.meterFill,
            { width: `${applicable.length ? (filled / applicable.length) * 100 : 0}%` },
          ]}
        />
      </View>
      {PLAN_SLOTS.map(([key, label]) => {
        const slot = plan[key];
        if (slot.state === "not_applicable") {
          return (
            <View key={key} style={styles.slotRow}>
              <Text style={styles.slotLabel}>{label}</Text>
              <Text style={styles.slotText}>{slot.reason.text}</Text>
            </View>
          );
        }
        return (
          <View key={key} style={styles.slotRow}>
            <Text style={styles.slotLabel}>{label}</Text>
            {slot.state === "not_stated" ? (
              <Text style={styles.slotMissing}>Not stated</Text>
            ) : (
              <Text style={styles.slotText}>
                {slot.sentences.map((sentence) => sentence.text).join(" ")}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Alignment({
  profile,
  userPositions,
}: {
  profile: CandidateProfile;
  userPositions: Partial<Record<string, Position>>;
}) {
  const issueIds = Object.keys(profile.stances);
  const comparable = issueIds.filter((issueId) => {
    return profile.issueEvidenceState[issueId] === "sufficient" && userPositions[issueId] != null;
  });

  return (
    <View>
      <Note>A reading aid for issues you both addressed. It does not recommend a vote.</Note>
      {issueIds.length === 0 ? (
        <Text style={styles.paragraph}>No issue lines yet.</Text>
      ) : (
        issueIds.map((issueId) => {
          const label = issueById(issueId)?.label ?? issueId;
          const user = userPositions[issueId];
          const state = profile.issueEvidenceState[issueId];
          const stance = profile.stances[issueId];
          let reading: string;
          let score: number | null = null;
          if (user == null) reading = "You have not taken a side here";
          else if (state !== "sufficient" || !stance) reading = "Not enough independent evidence";
          else {
            const result = proximity(user, stance.position);
            reading = result.label;
            score = result.score;
          }
          return (
            <View key={issueId} style={styles.alignRow}>
              <View style={styles.alignHead}>
                <Text style={styles.alignLabel}>{label}</Text>
                <Text style={styles.alignReading}>{reading}</Text>
              </View>
              {score != null ? (
                <View style={styles.meter}>
                  <View style={[styles.meterFill, { width: `${Math.round(score * 100)}%` }]} />
                </View>
              ) : null}
            </View>
          );
        })
      )}
      {comparable.length < 3 ? (
        <Note>Too few shared issues to summarize. Read the lines one by one.</Note>
      ) : null}
    </View>
  );
}

function Money({ profile }: { profile: CandidateProfile }) {
  const funding = profile.funding;
  if (!funding) return null;
  return (
    <Disclosure title="Money on file" icon="coins">
      <Text style={styles.paragraph}>
        {formatIsoDate(funding.period.start)} to {formatIsoDate(funding.period.end)}
      </Text>
      <View style={styles.stats}>
        <Stat label="Direct receipts" value={formatMoney(funding.direct)} />
        <Stat label="Outside spending" value={formatMoney(funding.outside)} />
        <Stat
          label="Small donations"
          value={formatMoney(funding.traced.receipts.unitemizedSmall)}
          hint="Not treated as undisclosed"
        />
        {funding.ads.meta.max > 0 ? (
          <Stat label="Meta ads" value={formatMoney(funding.ads.meta)} hint="A reported range" />
        ) : null}
      </View>
      {funding.topIndustries.length > 0 ? (
        <>
          <Text style={styles.blockLabel}>Top industries</Text>
          {funding.topIndustries.map((industry) => (
            <View key={industry.industry} style={styles.industry}>
              <Text style={styles.industryName}>{industry.industry}</Text>
              <Text style={styles.industryAmount}>{formatMoney(industry.amount)}</Text>
            </View>
          ))}
          <Note>Industry labels are aggregates, not donor names.</Note>
        </>
      ) : null}
      <Note>
        No dark-money share is inferred. Unknown or unitemized money is not automatically
        undisclosed money.
      </Note>
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.paper,
    padding: 16,
    marginTop: 16,
  },
  identity: { flexDirection: "row", gap: 12, alignItems: "center" },
  pickRow: { marginTop: 12 },
  monogram: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.gold,
    boxShadow: shadows.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20 },
  identityText: { flex: 1 },
  name: { fontFamily: fonts.display, color: colors.heading, fontSize: 24, lineHeight: 28 },
  subtitle: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  paragraph: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 8,
  },
  blockLabel: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17, marginTop: 12 },
  highlights: { marginTop: 8 },
  bullet: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "flex-start" },
  gem: {
    width: 8,
    height: 8,
    marginTop: 8,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  bulletText: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  plan: {
    backgroundColor: colors.cream,
    borderColor: colors.lineSoft,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  planHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  planIssue: { fontFamily: fonts.display, color: colors.heading, fontSize: 20 },
  planCount: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13 },
  meter: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tray,
    overflow: "hidden",
    marginTop: 6,
  },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.goldDeep },
  slotRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  slotLabel: { width: 66, fontFamily: fonts.smallCaps, color: colors.line, fontSize: 15 },
  slotText: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 21 },
  slotMissing: {
    flex: 1,
    fontFamily: fonts.displayItalic,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
  },
  flag: { marginTop: 10 },
  flagHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flagTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 16 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  industry: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  industryName: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 15.5 },
  industryAmount: { fontFamily: fonts.bold, color: colors.heading, fontSize: 15.5 },
  alignRow: { marginTop: 12 },
  alignHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  alignLabel: { fontFamily: fonts.display, color: colors.heading, fontSize: 18 },
  alignReading: {
    flexShrink: 1,
    textAlign: "right",
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 14,
  },
});
