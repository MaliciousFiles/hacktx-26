// Daily Challenge (UX.md §3.7). Both games are still being prototyped and /daily has no payload
// shape yet (APP_BUILD §5), so this page says so plainly instead of faking a puzzle.
import { useRouter } from "expo-router";
import { Body, Kicker, Panel, Screen, Section, Title, TopBar } from "@/components/ui";
import { StyleSheet, Text } from "react-native";
import { colors, fonts } from "@/theme";

export default function Daily() {
  const router = useRouter();
  return (
    <Screen header={<TopBar onBack={() => router.back()} />}>
      <Kicker>Daily Challenge · in the works</Kicker>
      <Title>A short puzzle a day</Title>
      <Body>
        One puzzle a day, three lives, and a little grid to share. It only uses past races or races
        outside your area, so it never spoils your own ballot.
      </Body>
      <Section title="Quote Match" icon="scroll">
        <Panel>
          <Text style={styles.copy}>
            Pair four masked characters with the platforms they wrote.
          </Text>
          <Text style={styles.grid}>🟩🟩🟥🟩</Text>
        </Panel>
      </Section>
      <Section title="Follow the Gold" icon="coins">
        <Panel>
          <Text style={styles.copy}>Match four masked characters to who funds them.</Text>
          <Text style={styles.grid}>🟨🟨🟥🟨</Text>
        </Panel>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  grid: { fontSize: 22, marginTop: 8 },
});
