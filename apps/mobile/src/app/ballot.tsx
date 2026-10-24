import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { Body, Kicker, Note, SampleMark, Screen, TextButton, Title, TopBar } from "@/components/ui";
import { contestById, demoBallot, identityFor, orderedProfiles } from "@/fixtures/travisDemo";
import { contestTone, officeKindLabel } from "@/labels";
import { useSession } from "@/session";
import { colors, serif } from "@/theme";

export default function Ballot() {
  const session = useSession();
  const router = useRouter();
  if (!session.started) return <Redirect href="/" />;

  const contests = demoBallot.ballot.contestIds.flatMap((id) => {
    const contest = contestById(id);
    return contest ? [contest] : [];
  });

  return (
    <Screen>
      <TopBar
        onBack={() => router.navigate("/explore")}
        backLabel="Deck"
        action={
          <TextButton
            label="Start over"
            onPress={() => {
              session.reset();
              router.navigate("/");
            }}
          />
        }
      />
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
      {contests.map((contest) => {
        const profiles = orderedProfiles(contest, session.order[contest.id]);
        const objective = profiles.every(
          (profile) => profile.coverage === "objective_only" || profile.evidenceState === "none",
        );
        const names = profiles.map((profile) => {
          if (session.revealed[contest.id]) return identityFor(profile.id)?.name ?? "Named";
          return session.masks?.map[profile.id]?.character ?? "Masked candidate";
        });
        return (
          <Pressable
            key={contest.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${contest.title}`}
            onPress={() => router.push({ pathname: "/contest/[id]", params: { id: contest.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.kind}>{officeKindLabel(contest.officeKind)}</Text>
            <Text style={styles.rowTitle}>{contest.title}</Text>
            <Text style={styles.tone}>{contestTone(contest.officeKind, objective)}</Text>
            <Text style={styles.names}>
              {names.length > 0 ? names.join("  ·  ") : "No candidates"}
            </Text>
          </Pressable>
        );
      })}
      <Note>Names stay behind characters until you lift the mask on a contest.</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
  },
  pressed: { opacity: 0.85 },
  kind: {
    color: colors.gold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  rowTitle: { fontFamily: serif, color: colors.ink, fontSize: 24, lineHeight: 30, marginTop: 4 },
  tone: { color: colors.forest, fontSize: 15, marginTop: 6 },
  names: { color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 8 },
});
