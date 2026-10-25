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
  PrimaryButton,
  SampleMark,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { useBallotData } from "@/ballotData";
import { contestTone, officeKindLabel } from "@/labels";
import { Portrait } from "@/components/Portrait";
import { isDecided } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

export default function Ballot() {
  const { data: demoBallot, sample, contestById, orderedProfiles } = useBallotData();
  const session = useSession();
  const router = useRouter();
  if (!session.started) return <Redirect href="/" />;

  const contests = demoBallot.ballot.contestIds.flatMap((id) => {
    const contest = contestById(id);
    return contest ? [contest] : [];
  });
  const decided = contests.filter((contest) => isDecided(session.picks[contest.id])).length;

  return (
    <Screen
      footer={
        <>
          <Note>
            {decided} of {contests.length} races picked. Names and parties stay hidden until the
            unmasking.
          </Note>
          <PrimaryButton
            label={decided === 0 ? "Pick in at least one race" : "Show my fairy-tale ballot"}
            disabled={decided === 0}
            arrow
            onPress={() => router.push("/share")}
          />
        </>
      }
      header={
        <TopBar
          onBack={() => router.navigate("/explore")}
          backLabel="Questions"
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
      <Title>Meet the ideas first.</Title>
      <Body>
        {contests.length} contests on{" "}
        {sample ? "your sample ballot" : `style ${demoBallot.ballot.ballotStyleId}`}. Open a race,
        read the evidence, then pick the one you like best. Every candidate wears a storybook
        character until the big unmasking at the end.
      </Body>
      {session.deckIndex < demoBallot.cards.length ? (
        <Note>You still have unanswered questions. You can return to them at any time.</Note>
      ) : null}
      {contests.map((contest, index) => {
        const profiles = orderedProfiles(contest, session.order[contest.id]);
        const objective = profiles.every(
          (profile) => profile.coverage === "objective_only" || profile.evidenceState === "none",
        );
        const pick = session.picks[contest.id];
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
                {isDecided(pick) ? (
                  <View style={styles.unmasked}>
                    <Icon name="check" size={14} strokeWidth={2.4} />
                    <Text style={styles.unmaskedText}>picked</Text>
                  </View>
                ) : pick ? (
                  <View style={styles.unmasked}>
                    <Text style={styles.unmaskedText}>
                      {pick.kind === "skip" ? "skipped" : "undecided"}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.rowTitle}>{contest.title}</Text>
              <Text style={styles.tone}>{contestTone(contest.officeKind, objective)}</Text>
              <View style={styles.namesRow}>
                <View style={styles.cast}>
                  {profiles.map((profile) => {
                    const mask = session.masks?.map[profile.id] ?? session.openedMasks[profile.id];
                    const chosen = pick?.kind === "candidate" && pick.candidateId === profile.id;
                    return mask ? (
                      <View key={profile.id} style={[styles.castItem, chosen && styles.castChosen]}>
                        <Portrait character={mask.character} size={chosen ? 40 : 34} />
                      </View>
                    ) : null;
                  })}
                  {profiles.length === 0 ? <Text style={styles.names}>No candidates</Text> : null}
                </View>
                <Icon name="chevron" size={18} strokeWidth={2.4} />
              </View>
            </PressableScale>
          </Enter>
        );
      })}
      <Note>
        Characters are dealt at random for this session and have nothing to do with who the
        candidates really are.
      </Note>
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
  namesRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  cast: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  castItem: { opacity: 0.8 },
  castChosen: {
    opacity: 1,
    borderRadius: 24,
    padding: 2,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.line,
  },
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
