import type { CandidateProfile, Contest, Position } from "@ftb/types";
import { Text, View, StyleSheet } from "react-native";
import { issueById, identityFor } from "@/fixtures/travisDemo";
import { formatIsoDate, formatMoney, monogram } from "@/format";
import { FLAG_COPY, SOURCE_LABEL } from "@/labels";
import { proximity } from "@/matching";
import { useSession } from "@/session";
import { colors, serif } from "@/theme";
import { Banner, Note, Section } from "@/components/ui";

const PLAN_SLOTS = [
  ["goal", "Goal"],
  ["mechanism", "Mechanism"],
  ["cost", "Cost"],
  ["funding", "Funding"],
  ["timeline", "Timeline"],
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
  const session = useSession();
  const revealed = session.revealed[contest.id] === true;
  const mask = revealed ? session.openedMasks[profile.id] : session.masks?.map[profile.id];
  const identity = identityFor(profile.id);
  const name = revealed
    ? (identity?.name ?? "Name unavailable")
    : (mask?.character ?? "Masked candidate");
  const subtitle = revealed
    ? "Same evidence as before the name."
    : (mask?.title ?? "A character for this session only");
  const objective = profile.coverage === "objective_only" || profile.evidenceState === "none";

  return (
    <View style={styles.card}>
      <View style={styles.identity}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText}>{monogram(name)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {profile.recordInOffice === "none" ? (
        <Note>Based on what they say, not what they have done.</Note>
      ) : null}

      {objective ? (
        <Banner
          title="Objective information"
          body="There isn't enough comparable evidence to line this up with your answers. What is documented is below."
        />
      ) : (
        <Alignment profile={profile} userPositions={userPositions} />
      )}

      {profile.platformHighlights.length > 0 ? (
        <Section title="In their own record">
          {profile.platformHighlights.map((sentence) => (
            <Text key={sentence.text} style={styles.paragraph}>
              {sentence.text}
            </Text>
          ))}
        </Section>
      ) : null}

      {profile.evidence.length > 0 ? (
        <Section title="Evidence">
          {profile.evidence.map((item) => (
            <View key={item.id} style={styles.quote}>
              <Text style={styles.quoteText}>“{item.excerpt}”</Text>
              <Text style={styles.quoteMeta}>
                {issueById(item.issueId)?.label ?? item.issueId} · {SOURCE_LABEL[item.sourceType]} ·{" "}
                {formatIsoDate(item.date)}
                {item.redacted ? " · redacted" : ""}
              </Text>
            </View>
          ))}
          <Note>
            Source links stay hidden until a later release can return them after the reveal.
          </Note>
        </Section>
      ) : null}

      {profile.plans.length > 0 ? (
        <Section title="Plan">
          <Note>
            Filled slots only. This is not a score of whether the plan is true or possible.
          </Note>
          {profile.plans.map((plan) => (
            <View key={plan.id} style={styles.plan}>
              <Text style={styles.planIssue}>
                {issueById(plan.issueId)?.label ?? plan.issueId} · {filledSlots(plan)}
              </Text>
              {PLAN_SLOTS.map(([key, label]) => {
                const slot = plan[key];
                if (slot.state === "not_stated") {
                  return (
                    <Text key={key} style={styles.missing}>
                      {label}: Not stated
                    </Text>
                  );
                }
                if (slot.state === "not_applicable") {
                  return (
                    <Text key={key} style={styles.paragraph}>
                      {label}: {slot.reason.text}
                    </Text>
                  );
                }
                return (
                  <Text key={key} style={styles.paragraph}>
                    {label}: {slot.sentences.map((sentence) => sentence.text).join(" ")}
                  </Text>
                );
              })}
            </View>
          ))}
        </Section>
      ) : null}

      {profile.credibility.flags.length > 0 ? (
        <Section title="Worth a second look">
          {profile.credibility.flags.map((flag) => (
            <View key={`${flag.type}-${flag.issueId}`} style={styles.flag}>
              <Text style={styles.flagTitle}>{FLAG_COPY[flag.type].title}</Text>
              <Text style={styles.paragraph}>
                {issueById(flag.issueId)?.label ?? flag.issueId}. {FLAG_COPY[flag.type].detail}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      {profile.saysVsDoes.length > 0 ? (
        <Section title="Says and does">
          {profile.saysVsDoes.map((gap) => (
            <Text key={gap.issueId} style={styles.paragraph}>
              On {issueById(gap.issueId)?.label ?? gap.issueId}, the public statements and the
              recorded actions point different ways.
            </Text>
          ))}
        </Section>
      ) : null}

      {profile.judicialProfile ? (
        <Section title="On the record">
          <Text style={styles.paragraph}>
            Stated years in practice: {profile.judicialProfile.experienceYears ?? "not stated"}.
            Board certification: {profile.judicialProfile.boardCertified ? "listed" : "not listed"}.
          </Text>
          <Note>
            Philosophy is not compared. This sample does not have enough independent sources.
          </Note>
        </Section>
      ) : null}

      {profile.funding ? <Money profile={profile} /> : null}
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
          if (user == null) {
            return (
              <Text key={issueId} style={styles.paragraph}>
                {label}: you have not taken a side here.
              </Text>
            );
          }
          if (state !== "sufficient" || !stance) {
            return (
              <Text key={issueId} style={styles.paragraph}>
                {label}: not enough independent evidence to compare.
              </Text>
            );
          }
          const reading = proximity(user, stance.position);
          return (
            <Text key={issueId} style={styles.paragraph}>
              {label}: {reading.label}.
            </Text>
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
    <Section title="Money on file">
      <Text style={styles.paragraph}>
        {formatIsoDate(funding.period.start)} – {formatIsoDate(funding.period.end)}
      </Text>
      <Text style={styles.paragraph}>Direct receipts {formatMoney(funding.direct)}</Text>
      <Text style={styles.paragraph}>
        Small unitemized donations {formatMoney(funding.traced.receipts.unitemizedSmall)}. These are
        not treated as undisclosed.
      </Text>
      <Text style={styles.paragraph}>Outside spending {formatMoney(funding.outside)}</Text>
      {funding.ads.meta.max > 0 ? (
        <Text style={styles.paragraph}>
          Meta ads {formatMoney(funding.ads.meta)}, a reported range.
        </Text>
      ) : null}
      {funding.topIndustries.map((industry) => (
        <Text key={industry.industry} style={styles.paragraph}>
          {industry.industry}: {formatMoney(industry.amount)} in direct receipts. Industry labels
          are aggregates, not donor names.
        </Text>
      ))}
      <Note>
        No dark-money share is shown. Outside spending in this sample has no disclosed total to
        divide.
      </Note>
    </Section>
  );
}

function filledSlots(plan: CandidateProfile["plans"][number]): string {
  const slots = [plan.goal, plan.mechanism, plan.cost, plan.funding, plan.timeline, plan.whoActs];
  const applicable = slots.filter((slot) => slot.state !== "not_applicable");
  const filled = applicable.filter((slot) => slot.state === "documented").length;
  return `${filled} of ${applicable.length} slots filled`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginTop: 16,
  },
  identity: { flexDirection: "row", gap: 12, alignItems: "center" },
  monogram: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.forestSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { fontFamily: serif, color: colors.forest, fontSize: 18 },
  identityText: { flex: 1 },
  name: { fontFamily: serif, color: colors.ink, fontSize: 22, lineHeight: 28 },
  subtitle: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 2 },
  paragraph: { color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 8 },
  detailLabel: { fontFamily: serif, color: colors.ink, fontSize: 16 },
  quote: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  quoteText: { fontFamily: serif, color: colors.ink, fontSize: 16, lineHeight: 23 },
  quoteMeta: { color: colors.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 8 },
  plan: { marginTop: 8 },
  planIssue: { fontFamily: serif, color: colors.ink, fontSize: 16, marginTop: 8 },
  missing: { color: colors.rose, fontSize: 16, lineHeight: 23, marginTop: 8 },
  flag: { marginTop: 8 },
  flagTitle: { fontFamily: serif, color: colors.ink, fontSize: 16 },
});
