// A2 · My ballot notes: contests in ballot order with the voter's pick (UX.md §3.5).
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { kitStyles } from "@/components/kit";
import {
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { contests, demo } from "@/data/release";
import { usePhaseGate, WALKING } from "@/gate";
import { pickLabel } from "@/lib/picks";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Notes() {
  const router = useRouter();
  const session = useSession();
  const sheet = useRef<ComponentRef<typeof View>>(null);
  const [note, setNote] = useState<string | null>(null);
  const gate = usePhaseGate(WALKING);
  if (gate) return gate;

  const save = async () => {
    setNote(null);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("unavailable");
      const uri = await captureRef(sheet, { format: "png" });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save your notes" });
    } catch {
      setNote("Saving isn't available here. A screenshot works too.");
    }
  };

  const clear = () =>
    Alert.alert(
      "Clear my picks?",
      "This removes every pick on this phone. Your deck answers stay.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: session.clearPicks },
      ],
    );

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={
        <>
          <PrimaryButton label="Save as image" onPress={save} />
          <TextButton label="Clear my picks" onPress={clear} />
        </>
      }
    >
      {demo ? <SampleMark /> : null}
      <Kicker>Take these to the polls</Kicker>
      <Title>My ballot notes</Title>
      <View ref={sheet} collapsable={false} style={styles.sheet}>
        <Text style={styles.sheetTitle}>My ballot notes</Text>
        {contests.map((contest, index) => (
          <View key={contest.id} style={[styles.row, index > 0 && styles.divider]}>
            <Text style={styles.number}>{index + 1}.</Text>
            <View style={styles.fill}>
              <Text style={styles.contest}>{contest.title}</Text>
              <Text style={kitStyles.copy}>
                {session.state.picks[contest.id]
                  ? pickLabel(session.state.picks[contest.id], session.nameFor)
                  : "Undecided"}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Note>
        Texas lets you bring written notes to the polls, but not use your phone in the voting booth.
        Print or write this down.
      </Note>
      {note ? <Note>{note}</Note> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    padding: 16,
    marginTop: 6,
  },
  sheetTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20, marginBottom: 4 },
  row: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1.5, borderTopColor: colors.lineSoft, borderStyle: "dashed" },
  number: { fontFamily: fonts.bold, color: colors.line, fontSize: 16, width: 22 },
  contest: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15 },
});
