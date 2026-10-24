import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, serif } from "@/theme";

export function Screen({
  children,
  footer,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.column}>
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={{ paddingBottom: footer ? 12 : insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.fill}>{children}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function SampleMark() {
  return <Text style={styles.sample}>Sample release · not a live ballot</Text>;
}

export function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Title({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function Ornament() {
  return (
    <View style={styles.ornament} accessibilityElementsHidden>
      <View style={styles.ornamentLine} />
      <View style={styles.ornamentDot} />
      <View style={styles.ornamentLine} />
    </View>
  );
}

export function BackButton({ label = "Back", onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress}>
      <Text style={styles.back}>{label}</Text>
    </Pressable>
  );
}

export function TopBar({
  onBack,
  backLabel = "Back",
  action,
}: {
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      {onBack ? <BackButton label={backLabel} onPress={onBack} /> : <View />}
      {action}
    </View>
  );
}

export function Progress({ index, total }: { index: number; total: number }) {
  const shown = Math.min(index, total - 1);
  return (
    <View accessibilityLabel={`Card ${shown + 1} of ${total}`} style={styles.progress}>
      {Array.from({ length: total }, (_, segment) => (
        <View
          key={segment}
          style={[styles.progressSegment, segment <= index && styles.progressSegmentOn]}
        />
      ))}
    </View>
  );
}

export function ChoiceButton({
  label,
  onPress,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.textButton}>
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function StarButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? "Marked as matters to me" : "Mark as matters to me"}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={8}
      style={[styles.star, on && styles.starOn]}
    >
      <Text style={[styles.starLabel, on && styles.starLabelOn]}>
        {on ? "★ Matters to me" : "☆ Matters to me"}
      </Text>
    </Pressable>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Banner({
  title,
  body,
  tone = "quiet",
}: {
  title: string;
  body: string;
  tone?: "quiet" | "rose" | "forest";
}) {
  return (
    <View
      style={[
        styles.banner,
        tone === "rose" && styles.bannerRose,
        tone === "forest" && styles.bannerForest,
      ]}
    >
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    paddingHorizontal: 22,
  },
  fill: { flex: 1 },
  footer: { gap: 10, paddingTop: 8 },
  sample: {
    color: colors.gold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  kicker: {
    fontFamily: serif,
    color: colors.gold,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontFamily: serif,
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 12,
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 25,
  },
  note: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  ornament: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 16,
  },
  ornamentLine: { width: 28, height: 1, backgroundColor: colors.gold },
  ornamentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    minHeight: 28,
  },
  back: { color: colors.forest, fontSize: 16 },
  progress: { flexDirection: "row", gap: 6, marginBottom: 18, width: "100%" },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#D3C4AE" },
  progressSegmentOn: { backgroundColor: colors.forest },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    justifyContent: "center",
  },
  choiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  choiceLabel: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  choiceLabelSelected: { color: colors.card },
  primary: {
    backgroundColor: colors.forest,
    borderRadius: 16,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryLabel: { color: colors.card, fontSize: 16, fontFamily: serif },
  pressed: { opacity: 0.82 },
  textButton: { alignItems: "center", paddingVertical: 8 },
  textButtonLabel: { color: colors.inkSoft, fontSize: 15 },
  star: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    backgroundColor: colors.card,
  },
  starOn: { backgroundColor: colors.goldSoft, borderColor: colors.gold },
  starLabel: { color: colors.inkSoft, fontSize: 14 },
  starLabelOn: { color: colors.ink },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  section: { marginTop: 22 },
  sectionTitle: {
    fontFamily: serif,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 8,
  },
  banner: {
    backgroundColor: colors.goldSoft,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  bannerRose: { backgroundColor: colors.roseSoft },
  bannerForest: { backgroundColor: colors.forestSoft },
  bannerTitle: { fontFamily: serif, color: colors.ink, fontSize: 16, marginBottom: 4 },
  bannerBody: { color: colors.ink, fontSize: 15, lineHeight: 22 },
});
