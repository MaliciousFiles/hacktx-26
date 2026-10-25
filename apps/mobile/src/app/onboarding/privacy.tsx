// O3 · Privacy promise. Every bullet describes what the code really does (Inv. 5, 7).
import { useRouter } from "expo-router";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import {
  Kicker,
  Note,
  Panel,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

const PROMISES: { icon: IconName; text: string }[] = [
  {
    icon: "house",
    text: "Your address never leaves this phone. You pick your ballot style from the official list, and only that style is used to load the ballot.",
  },
  {
    icon: "lock",
    text: "Your answers and picks stay on this phone. We can't see them.",
  },
  {
    icon: "mask",
    text: "Masks hide names, not facts. A determined person could search a quote. Masks are a speed bump, not a secret.",
  },
];

export default function Privacy() {
  const router = useRouter();
  const session = useSession();

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={
        <PrimaryButton label="Got it" arrow onPress={() => router.push("/onboarding/style")} />
      }
    >
      <Kicker>Before we start</Kicker>
      <Title>What stays on this phone</Title>
      {PROMISES.map((promise) => (
        <Panel key={promise.icon}>
          <View style={styles.row}>
            <Icon name={promise.icon} size={22} strokeWidth={2} fill={colors.gold} />
            <Text style={styles.text}>{promise.text}</Text>
          </View>
        </Panel>
      ))}
      <Panel>
        <View style={styles.row}>
          <Text style={[styles.text, styles.toggleLabel]}>Share anonymous usage counts</Text>
          <Switch
            accessibilityLabel="Share anonymous usage counts"
            value={session.state.analyticsOptIn}
            onValueChange={session.setAnalytics}
            trackColor={{ true: colors.line, false: colors.tray }}
            thumbColor={colors.cream}
          />
        </View>
        <Note>
          Optional and off by default. Only step counts like &quot;finished the deck&quot;, never
          your answers, picks or ballot.
        </Note>
      </Panel>
      <TextButton
        label="Read the full method"
        icon="book"
        onPress={() => router.push("/how-it-works")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  toggleLabel: { fontFamily: fonts.bold },
});
