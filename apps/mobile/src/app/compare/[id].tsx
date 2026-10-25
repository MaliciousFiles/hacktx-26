// B4 · Compare side by side. One pole line per issue any candidate has evidence on, plus every
// starred issue. Candidates are ink shapes; the user is the ◆ (VISUAL_DESIGN §2).
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { countFlags } from "@/components/evidence";
import { Empty, kitStyles, PoleLine } from "@/components/kit";
import { Kicker, Note, SampleMark, Screen, Section, Title, TopBar } from "@/components/ui";
import { cards, contestById, demo, issueById, issueLabel, orderedProfiles } from "@/data/release";
import { formatMoney } from "@/format";
import { usePhaseGate, WALKING } from "@/gate";
import { TIER_LABEL } from "@/labels";
import { salienceFrom, userVectorFor } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Compare() {
  const router = useRouter();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gate = usePhaseGate(WALKING);
  if (gate) return gate;
  const contest = contestById(id);
  if (!contest) return null;

  const profiles = orderedProfiles(contest, session.state.order[contest.id]);
  const userVector = userVectorFor(cards, session.state.swipes);
  const starred = Object.keys(salienceFrom(cards, session.state.swipes));
  const issueIds = new Set<string>();
  for (const profile of profiles) {
    for (const [issueId, state] of Object.entries(profile.issueEvidenceState)) {
      if (state !== "none") issueIds.add(issueId);
    }
  }
  for (const issueId of starred)
    if (issueById(issueId) && !issueId.startsWith("judicial.")) issueIds.add(issueId);

  return (
    <Screen header={<TopBar onBack={() => router.back()} backLabel="Contest" />}>
      {demo ? <SampleMark /> : null}
      <Kicker>Compare side by side</Kicker>
      <Title>{contest.title}</Title>
      <Note>The poles are labels, not grades. Neither end is the better one.</Note>

      <Section title="Issues" icon="scale">
        {issueIds.size === 0 ? <Empty>No issue has evidence from any candidate.</Empty> : null}
        {[...issueIds].map((issueId) => {
          const issue = issueById(issueId);
          return (
            <View key={issueId} style={styles.row}>
              <Text style={kitStyles.label}>{issueLabel(issueId)}</Text>
              <PoleLine
                left={issue?.negativePole ?? "One pole"}
                right={issue?.positivePole ?? "Other pole"}
                marks={[
                  ...profiles.map((profile) => ({
                    key: profile.id,
                    label: session.nameFor(profile.id),
                    position:
                      profile.issueEvidenceState[issueId] === "none"
                        ? null
                        : (profile.stances[issueId]?.position ?? null),
                  })),
                  {
                    key: "you",
                    label: "You",
                    position: userVector[issueId]?.position ?? null,
                    user: true,
                  },
                ]}
              />
            </View>
          );
        })}
      </Section>

      <Section title="At a glance" icon="book">
        {profiles.map((profile) => (
          <View key={profile.id} style={kitStyles.card}>
            <Text style={styles.name}>{session.nameFor(profile.id)}</Text>
            <Text style={kitStyles.copy}>
              Plan detail:{" "}
              {profile.plans.length > 0
                ? TIER_LABEL[profile.specificity.tier]
                : "No specific plans"}
            </Text>
            <Text style={kitStyles.copy}>
              Flags:{" "}
              {countFlags(profile)
                .map((flag) => `${flag.emoji} ${flag.count}`)
                .join("  ") || "none"}
            </Text>
            <Text style={kitStyles.copy}>
              Direct $: {profile.funding ? formatMoney(profile.funding.direct) : "No filings found"}
            </Text>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 14 },
  name: { fontFamily: fonts.display, color: colors.heading, fontSize: 22 },
});
