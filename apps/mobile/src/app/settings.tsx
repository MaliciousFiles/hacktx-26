// Settings (UX.md §3.6): analytics opt-in, start over, delete everything.
import { useRouter } from "expo-router";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Kicker, Note, Panel, Screen, Section, TextButton, Title, TopBar } from "@/components/ui";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Settings() {
  const router = useRouter();
  const session = useSession();

  const startOver = () =>
    Alert.alert(
      "Start over on a different ballot?",
      "Your answers, picks and masks for this ballot are removed from this phone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start over",
          style: "destructive",
          onPress: () => {
            session.startOver();
            if (router.canDismiss()) router.dismissAll();
            router.replace("/");
          },
        },
      ],
    );

  const wipe = () =>
    Alert.alert("Delete everything on this phone?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void session.deleteEverything().then(() => {
            if (router.canDismiss()) router.dismissAll();
            router.replace("/");
          });
        },
      },
    ]);

  return (
    <Screen header={<TopBar onBack={() => router.back()} />}>
      <Kicker>Settings</Kicker>
      <Title>Settings</Title>
      <Panel>
        <View style={styles.row}>
          <Text style={styles.label}>Share anonymous usage counts</Text>
          <Switch
            accessibilityLabel="Share anonymous usage counts"
            value={session.state.analyticsOptIn}
            onValueChange={session.setAnalytics}
            trackColor={{ true: colors.line, false: colors.tray }}
            thumbColor={colors.cream}
          />
        </View>
        <Note>Step counts only. Never your answers, picks or ballot.</Note>
      </Panel>
      <Section title="Display" icon="sparkle">
        <Text style={styles.copy}>Text size follows your phone&apos;s setting.</Text>
        <Text style={styles.copy}>
          Reduce Motion follows your phone&apos;s setting: animations become simple fades.
        </Text>
      </Section>
      <Section title="Your data" icon="lock">
        <TextButton label="Start over on a different ballot" icon="back" onPress={startOver} />
        <TextButton label="Delete everything on this phone" icon="info" onPress={wipe} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { flex: 1, fontFamily: fonts.bold, color: colors.ink, fontSize: 16 },
  copy: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 6 },
});
