// O2 · How this works: three panels with Next and a page indicator (UX.md §3.1).
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import { Enter } from "@/components/motion";
import { GuideBubble, Panel, PrimaryButton, Screen, TextButton, TopBar } from "@/components/ui";
import { colors, fonts } from "@/theme";

const PANELS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "book",
    title: "First, what matters to you",
    body: "Pick between two ideas, or decide whether something is worth its cost. Any answer is fine, and so is skipping.",
  },
  {
    icon: "mask",
    title: "Then, your real ballot",
    body: "Candidates wear masks, so you see plans and records first. Every contest is there, even the ones with thin evidence.",
  },
  {
    icon: "sparkle",
    title: "Last, the Unmasking",
    body: "When you're ready, the Unmasking shows who's who. We never tell you how to vote.",
  },
];

export default function Intro() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const panel = PANELS[index] ?? PANELS[0]!;
  const last = index === PANELS.length - 1;

  return (
    <Screen
      header={
        <TopBar
          onBack={() => (index === 0 ? router.back() : setIndex(index - 1))}
          action={<TextButton label="Skip" onPress={() => router.push("/onboarding/privacy")} />}
        />
      }
      footer={
        <PrimaryButton
          label={last ? "Next: your privacy" : "Next"}
          arrow
          onPress={() => (last ? router.push("/onboarding/privacy") : setIndex(index + 1))}
        />
      }
    >
      <GuideBubble avatar>Here's how the story goes. It takes three pages.</GuideBubble>
      <Enter key={index} kind="deal">
        <Panel>
          <View style={styles.icon}>
            <Icon name={panel.icon} size={34} strokeWidth={1.8} fill={colors.gold} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {panel.title}
          </Text>
          <Text style={styles.body}>{panel.body}</Text>
        </Panel>
      </Enter>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`Page ${index + 1} of ${PANELS.length}`}
      >
        {PANELS.map((item, dot) => (
          <View key={item.title} style={[styles.dot, dot === index && styles.dotOn]} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center", marginBottom: 12, marginTop: 6 },
  title: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 28,
    lineHeight: 33,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 18 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  dotOn: { backgroundColor: colors.rose },
});
