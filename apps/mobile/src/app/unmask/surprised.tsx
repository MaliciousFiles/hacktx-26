// U4 · Surprised? Exactly two stats, computed on the phone (UX.md §3.4, lib/surprise.ts).
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Enter } from "@/components/motion";
import {
  Banner,
  GuideBubble,
  Kicker,
  Note,
  Panel,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from "@/components/ui";
import { contests } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { MIN_PARTISAN_PICKS, surpriseStats } from "@/lib/surprise";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Surprised() {
  const router = useRouter();
  const session = useSession();
  const gate = usePhaseGate(["revealed"]);
  if (gate) return gate;

  const stats = surpriseStats(contests, session.state.picks, session.state.revealed ?? {});

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label="Make a share card"
            arrow
            onPress={() => router.push("/unmask/share")}
          />
          <TextButton label="Back to My Ballot" onPress={() => router.replace("/ballot")} />
        </>
      }
    >
      <GuideBubble avatar>
        Plot twist! Or maybe not. Either way, you read the plans first.
      </GuideBubble>
      <Kicker>After the Unmasking</Kicker>
      <Title>Surprised?</Title>
      {stats ? (
        <>
          <Enter kind="deal" delay={120}>
            <Panel>
              <Text style={styles.big}>{stats.partyCount}</Text>
              <Text style={styles.line}>
                Your picks came from {stats.partyCount} different{" "}
                {stats.partyCount === 1 ? "party" : "parties"}.
              </Text>
            </Panel>
          </Enter>
          <Enter kind="deal" delay={320}>
            <Panel>
              <Text style={styles.big}>{stats.acrossAislePct}%</Text>
              <Text style={styles.line}>
                In {stats.acrossAislePct}% of partisan races, your pick wasn&apos;t from the party
                you picked most often.
              </Text>
            </Panel>
          </Enter>
          <Note>Partisan races only. Based on {stats.partisanPicks} picks.</Note>
        </>
      ) : (
        <Banner
          title="Not enough partisan picks for stats"
          body={`These stats need at least ${MIN_PARTISAN_PICKS} picks in partisan races, so we won't show a misleading number.`}
        />
      )}
      <View style={styles.gap} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 56,
    lineHeight: 62,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  line: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  gap: { height: 12 },
});
