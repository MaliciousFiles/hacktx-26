// Report an error (UX.md §3.6). Pre-filled with the release and the cited item. It never includes
// swipes or picks (PLAN §10). There's no POST /reports yet (APP_BUILD §9 gap 2), so the report goes
// out through the share sheet for now.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, TextInput } from "react-native";
import { Kicker, Note, PrimaryButton, Screen, Title, TopBar } from "@/components/ui";
import { release } from "@/data/release";
import { colors, fonts } from "@/theme";

export default function Report() {
  const router = useRouter();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [message, setMessage] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const send = async () => {
    // Only the allowlisted report fields; nothing from the session.
    const lines = [
      "Fairy Tale Ballot error report",
      `Release: ${release.id}`,
      ref ? `Item: ${ref}` : null,
      `What's wrong: ${message.trim()}`,
      evidenceUrl.trim() ? `Evidence: ${evidenceUrl.trim()}` : null,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      setNote("Sharing isn't available here.");
    }
  };

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={
        <PrimaryButton label="Send report" disabled={message.trim().length === 0} onPress={send} />
      }
    >
      <Kicker>Corrections</Kicker>
      <Title>Report an error</Title>
      <Text style={styles.meta}>
        Release {release.id}
        {ref ? ` · item ${ref}` : ""}
      </Text>
      <Text style={styles.label}>What&apos;s wrong?</Text>
      <TextInput
        accessibilityLabel="What's wrong?"
        multiline
        value={message}
        onChangeText={setMessage}
        style={[styles.input, styles.multi]}
        placeholder="A quote is wrong, a source is missing…"
        placeholderTextColor={colors.inkSoft}
      />
      <Text style={styles.label}>Link to evidence (optional)</Text>
      <TextInput
        accessibilityLabel="Link to evidence"
        value={evidenceUrl}
        onChangeText={setEvidenceUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
        placeholderTextColor={colors.inkSoft}
      />
      <Note>Your answers and picks are never included in a report.</Note>
      {note ? <Note>{note}</Note> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontFamily: fonts.bold, color: colors.line, fontSize: 14 },
  label: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, marginTop: 16 },
  input: {
    marginTop: 6,
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.cream,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  multi: { minHeight: 120, textAlignVertical: "top" },
});
