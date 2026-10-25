// A1 · Share card. Rendered and captured on the phone, then handed to the OS share sheet.
// Nothing is uploaded (Inv. 5). Text sharing is the fallback.
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import { Share, StyleSheet, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { shareLine, ShareCard, type ShareStatKey } from "@/components/ShareCard";
import { ChoiceButton, Kicker, Note, PrimaryButton, Screen, Title, TopBar } from "@/components/ui";
import { contests } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { surpriseStats } from "@/lib/surprise";
import { useSession } from "@/session";

export default function ShareScreen() {
  const router = useRouter();
  const session = useSession();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [chosen, setChosen] = useState<ShareStatKey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const gate = usePhaseGate(["revealed"]);
  if (gate) return gate;

  const stats = surpriseStats(contests, session.state.picks, session.state.revealed ?? {});
  const options: { key: ShareStatKey; value: number | null }[] = [
    ...(stats
      ? [
          { key: "parties" as const, value: stats.partyCount },
          { key: "across_aisle" as const, value: stats.acrossAislePct },
        ]
      : []),
    { key: "plans_first", value: null },
  ];
  const selected = options.find((option) => option.key === chosen) ?? options[0]!;

  const share = async () => {
    setNote(null);
    const text = `${shareLine(selected.key, selected.value)}\nMy Fairy Tale Ballot`;
    try {
      if (card.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(card, { format: "png", width: 1080, height: 1350 });
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your card" });
        return;
      }
      await Share.share({ message: text });
    } catch {
      try {
        await Share.share({ message: text });
      } catch {
        setNote("Sharing isn't available here. A screenshot of the card works too.");
      }
    }
  };

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={<PrimaryButton label="Share" arrow onPress={share} />}
    >
      <Kicker>Share card</Kicker>
      <Title>Pick a stat to feature</Title>
      <View style={styles.options}>
        {options.map((option) => (
          <ChoiceButton
            key={option.key}
            label={shareLine(option.key, option.value)}
            selected={option.key === selected.key}
            onPress={() => setChosen(option.key)}
          />
        ))}
      </View>
      <View style={styles.preview}>
        <ShareCard ref={card} statKey={selected.key} statValue={selected.value} />
      </View>
      <Note>The card never includes your picks, names, parties or ballot.</Note>
      {note ? <Note>{note}</Note> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  preview: { marginTop: 18 },
});
