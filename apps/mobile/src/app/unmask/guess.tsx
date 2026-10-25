// U2 · Guess the party (optional, local only). The guesses are shown next to the real party in
// the ceremony, never summarized, and deleted with the session.
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { MaskTile } from "@/components/kit";
import { ChoiceButton, Kicker, Note, PrimaryButton, Screen, Title, TopBar } from "@/components/ui";
import { contests } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

// The masked release carries no party list per contest (that would leak through /ballot), so the
// options are the parties with ballot access in Texas, in alphabetical order.
const PARTIES = ["Democratic", "Green", "Libertarian", "Republican", "Independent"];

export default function Guess() {
  const router = useRouter();
  const session = useSession();
  const gate = usePhaseGate(["walkthrough"]);
  if (gate) return gate;

  const { picks, guesses } = session.state;
  const rounds = contests.flatMap((contest) => {
    const pick = picks[contest.id];
    return contest.partisan && pick?.kind === "candidate"
      ? [{ contest, candidateId: pick.candidateId }]
      : [];
  });

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={
        <PrimaryButton label="Unmask ✨" arrow onPress={() => router.replace("/unmask/reveal")} />
      }
    >
      <Kicker>Guess the party</Kicker>
      <Title>Who do you think they are?</Title>
      <Note>Only for contests where you picked someone. Skip any you like.</Note>
      {rounds.map(({ contest, candidateId }) => {
        const mask = session.masks[candidateId];
        const current = guesses[candidateId];
        return (
          <View key={contest.id} style={styles.round}>
            <Text style={styles.contest}>{contest.title}</Text>
            <View style={styles.who}>
              <MaskTile mask={mask} size={44} />
              <Text style={styles.question}>
                Which party do you think{" "}
                <Text style={styles.name}>{mask?.character ?? "your pick"}</Text> is?
              </Text>
            </View>
            <View style={styles.options}>
              {[...PARTIES, "No idea"].map((party) => {
                const value = party === "No idea" ? "unknown" : party;
                return (
                  <ChoiceButton
                    key={party}
                    label={party}
                    selected={current === value}
                    onPress={() => session.guess(candidateId, current === value ? null : value)}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { marginTop: 22 },
  contest: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  who: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  question: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 24 },
  name: { fontFamily: fonts.displayItalic },
  options: { gap: 8, marginTop: 10 },
});
