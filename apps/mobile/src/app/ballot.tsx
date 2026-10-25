import { Redirect, useRouter } from "expo-router";
import type { OfficeKind } from "@ftb/types";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import { Enter, PressableScale } from "@/components/motion";
import {
  Body,
  IconBox,
  Kicker,
  Note,
  SampleMark,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { contestById, demoBallot, identityFor, orderedProfiles } from "@/fixtures/travisDemo";
import { contestTone, officeKindLabel } from "@/labels";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

export default function Ballot() {
  const session = useSession();
  const router = useRouter();
  if (!session.started) return <Redirect href="/" />;

  const contests = demoBallot.ballot.contestIds.flatMap((id) => {
    const contest = contestById(id);
    return contest ? [contest] : [];
  });

  return (
    <Screen
      header={
        <TopBar
          onBack={() => router.navigate("/explore")}
          backLabel="Deck"
          action={
            <TextButton
              label="Start over"
              icon="back"
              onPress={() => {
                session.reset();
                router.navigate("/");
              }}
            />
          }
        />
      }
    >
      <SampleMark />
      <Kicker>Your ballot</Kicker>
      <Title>Every contest is here.</Title>
      <Body>
        {contests.length} contests on sample style A. Open any of them. Nothing is dropped because
        the evidence is thin.
      </Body>
      {session.deckIndex < demoBallot.cards.length ? (
        <Note>You still have unanswered cards in the deck.</Note>
      ) : null}
      {contests.map((contest, index) => {
        const profiles = orderedProfiles(contest, session.order[contest.id]);
        const objective = profiles.every(
          (profile) => profile.coverage === "objective_only" || profile.evidenceState === "none",
        );
        const names = profiles.map((profile) => {
          if (session.revealed[contest.id]) return identityFor(profile.id)?.name ?? "Named";
          return session.masks?.map[profile.id]?.character ?? "Masked candidate";
        });
        return (
          <Enter key={contest.id} kind="deal" delay={120 + index * 110}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Open ${contest.title}`}
              onPress={() => router.push({ pathname: "/contest/[id]", params: { id: contest.id } })}
              depth={0.98}
              style={styles.row}
            >
              <View style={styles.rowHead}>
                <IconBox icon={OFFICE_ICONS[contest.officeKind]} />
                <Text style={styles.kind}>{officeKindLabel(contest.officeKind)}</Text>
                {session.revealed[contest.id] ? (
                  <View style={styles.unmasked}>
                    <Icon name="mask" size={14} strokeWidth={2} />
                    <Text style={styles.unmaskedText}>unmasked</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.rowTitle}>{contest.title}</Text>
              <Text style={styles.tone}>{contestTone(contest.officeKind, objective)}</Text>
              <View style={styles.namesRow}>
                <Text style={styles.names}>
                  {names.length > 0 ? names.join("  ·  ") : "No candidates"}
                </Text>
                <Icon name="chevron" size={18} strokeWidth={2.4} />
              </View>
            </PressableScale>
          </Enter>
        );
      })}
      <Note>Names stay behind characters until you lift the mask on a contest.</Note>
    </Screen>
  );
}

const OFFICE_ICONS: Record<OfficeKind, IconName> = {
  legislative: "house",
  executive: "star",
  regulatory: "scale",
  judicial: "gavel",
  board: "book",
  measure: "scroll",
};

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, ${shadows.paper}`,
    padding: 16,
    marginTop: 16,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  unmasked: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  unmaskedText: { fontFamily: fonts.bold, color: colors.line, fontSize: 12 },
  namesRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  kind: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  rowTitle: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 25,
    lineHeight: 30,
    marginTop: 4,
  },
  tone: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 16, marginTop: 6 },
  names: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
