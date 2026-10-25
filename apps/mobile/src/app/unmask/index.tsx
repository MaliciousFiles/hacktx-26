// U1 · Ready? The Unmasking is for the whole ballot and permanent (UX.md §3.4, Inv. 8).
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import {
  Banner,
  GuideBubble,
  Kicker,
  Panel,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { contests } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { isDecided } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Ready() {
  const router = useRouter();
  const session = useSession();
  const [guess, setGuess] = useState(true);
  const gate = usePhaseGate(["walkthrough"]);
  if (gate) return gate;

  const { visited, picks } = session.state;
  const looked = contests.filter((contest) => visited[contest.id]).length;
  const picked = contests.filter((contest) => isDecided(picks[contest.id])).length;
  const guessable = contests.some(
    (contest) => contest.partisan && picks[contest.id]?.kind === "candidate",
  );

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} backLabel="Ballot" />}
      footer={
        <>
          <PrimaryButton
            label="Unmask ✨"
            disabled={looked === 0}
            onPress={() => router.replace(guess && guessable ? "/unmask/guess" : "/unmask/reveal")}
          />
          <TextButton label="Not yet" onPress={() => router.back()} />
        </>
      }
    >
      <GuideBubble avatar>Before the masks come off, take one last look around.</GuideBubble>
      <Kicker>The Unmasking</Kicker>
      <Title>Ready for the Unmasking?</Title>
      <Text style={styles.body}>
        The Unmasking shows the names and parties for <Text style={styles.bold}>every</Text> contest
        on your ballot. You can&apos;t put the masks back on for this ballot.
      </Text>
      <Banner
        tone="rose"
        title="This is permanent"
        body={`You looked at ${looked} of ${contests.length} contests and picked in ${picked}. Picks are locked once the masks are off.`}
      />
      {guessable ? (
        <Panel>
          <View style={styles.row}>
            <Text style={styles.toggle}>
              Play <Text style={styles.italic}>Guess the party</Text> first
            </Text>
            <Switch
              accessibilityLabel="Play Guess the party first"
              value={guess}
              onValueChange={setGuess}
              trackColor={{ true: colors.line, false: colors.tray }}
              thumbColor={colors.cream}
            />
          </View>
          <Text style={styles.note}>Just for fun. Your guesses stay on this phone.</Text>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 25 },
  bold: { fontFamily: fonts.bold },
  italic: { fontFamily: fonts.displayItalic },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggle: { flex: 1, fontFamily: fonts.bold, color: colors.ink, fontSize: 16 },
  note: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14, marginTop: 6 },
});
