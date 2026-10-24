import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, shadows } from "@/theme";

export function Screen({
  children,
  footer,
  tray,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Full-width bottom shelf, drawn under the footer. */
  tray?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const bottomPad = tray ? 12 : Math.max(insets.bottom, 14);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Corners top={insets.top} />
      <View style={styles.column}>
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={{ paddingBottom: footer || tray ? 12 : insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.fill}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
      </View>
      {tray ? (
        <View style={[styles.tray, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.trayRow}>{tray}</View>
        </View>
      ) : null}
    </View>
  );
}

/** Gilded page corners from the storybook frame. */
function Corners({ top }: { top: number }) {
  return (
    <>
      <View pointerEvents="none" style={[styles.corner, { top: top + 4, left: 6 }]}>
        <View style={styles.cornerGold} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.corner, { top: top + 4, right: 6, transform: [{ scaleX: -1 }] }]}
      >
        <View style={styles.cornerGold} />
      </View>
    </>
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
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      <Rule />
    </View>
  );
}

/** Dotted ink rule under headings. */
export function Rule() {
  return (
    <View style={styles.rule} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: 90 }, (_, index) => (
        <View key={index} style={styles.ruleDot} />
      ))}
    </View>
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
      <View style={styles.ornamentGem} />
      <View style={styles.ornamentLine} />
    </View>
  );
}

export function BackButton({ label = "Back", onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress}>
      <Text style={styles.back}>‹ {label}</Text>
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
  const label = `Card ${shown + 1} of ${total}`;
  return (
    <View accessible accessibilityLabel={label} style={styles.progress}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.pips}>
        {Array.from({ length: total }, (_, pip) => (
          <View
            key={pip}
            style={[
              styles.pip,
              pip <= index && styles.pipOn,
              pip === shown && styles.pipCurrent,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** Hanging bookmark ribbon. */
export function Ribbon({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.ribbon, pressed && styles.pressedDown]}
    >
      <View style={styles.ribbonBody}>
        <View style={styles.ribbonStitch} />
        <Text style={styles.ribbonGlyph}>❧</Text>
      </View>
      <View style={styles.ribbonTails}>
        <View style={[styles.ribbonTail, styles.ribbonTailLeft]} />
        <View style={[styles.ribbonTail, styles.ribbonTailRight]} />
      </View>
    </Pressable>
  );
}

/** Small framed square holding a glyph, used beside headings. */
export function IconBox({ glyph }: { glyph: string }) {
  return (
    <View style={styles.iconBox} accessibilityElementsHidden>
      <Text style={styles.iconGlyph}>{glyph}</Text>
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
        pressed && styles.pressedDown,
      ]}
    >
      <Text style={styles.choiceLabel}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  trailing,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  trailing?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.disabled,
        pressed && styles.pressedDown,
      ]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
      {trailing ? <Text style={styles.primaryTrailing}>{trailing}</Text> : null}
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

/** A framed tile on the bottom tray. */
export function Tile({
  label,
  glyph,
  onPress,
  on = false,
  accessibilityLabel,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  on?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.tileWrap, pressed && styles.pressedDown]}
    >
      <View style={[styles.tile, on && styles.tileOn]}>
        <Text style={[styles.tileGlyph, on && styles.tileGlyphOn]}>{glyph}</Text>
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
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
      <Text style={styles.starLabel}>{on ? "★ Matters to me" : "☆ Matters to me"}</Text>
    </Pressable>
  );
}

/** Speech bubble from the Fairy Godmother. */
export function GuideBubble({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bubble}>
      <Text style={styles.bubbleName}>Fairy Godmother</Text>
      <Text style={styles.bubbleBody}>{children}</Text>
      <View style={styles.bubbleTail} />
    </View>
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
    backgroundImage: `radial-gradient(ellipse at 50% 38%, ${colors.bgLight} 0%, ${colors.bg} 62%, #DFBF8E 100%)`,
    alignItems: "center",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderTopWidth: 7,
    borderLeftWidth: 7,
    borderColor: colors.line,
    borderTopLeftRadius: 3,
  },
  cornerGold: {
    position: "absolute",
    top: -5.5,
    left: -5.5,
    width: 30.5,
    height: 30.5,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#D6A445",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    paddingHorizontal: 22,
  },
  fill: { flex: 1 },
  footer: { gap: 10, paddingTop: 8 },
  tray: {
    alignSelf: "stretch",
    backgroundColor: colors.tray,
    borderTopWidth: 2,
    borderTopColor: colors.bevel,
    boxShadow: "inset 0 3px 0 rgba(255,246,226,0.6)",
    paddingTop: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  trayRow: {
    width: "100%",
    maxWidth: 520,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sample: {
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  kicker: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  titleBlock: { gap: 8, marginBottom: 12 },
  title: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 32,
    lineHeight: 36,
  },
  rule: { flexDirection: "row", gap: 3, height: 2, overflow: "hidden" },
  ruleDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: "rgba(122,59,59,0.5)" },
  body: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
  note: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  ornament: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 18,
  },
  ornamentLine: { width: 32, height: 2, borderRadius: 1, backgroundColor: colors.line },
  ornamentGem: {
    width: 9,
    height: 9,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    minHeight: 28,
  },
  back: { fontFamily: fonts.bold, color: colors.line, fontSize: 16 },
  progress: { alignItems: "flex-end", gap: 6 },
  progressLabel: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 5 },
  pip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  pipOn: { backgroundColor: colors.rose },
  pipCurrent: { boxShadow: "0 0 0 3px rgba(194,64,74,0.3)" },
  ribbon: { width: 44, height: 60, alignItems: "center" },
  ribbonBody: {
    width: 40,
    height: 44,
    backgroundColor: colors.rose,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  ribbonStitch: {
    position: "absolute",
    top: 0,
    bottom: 3,
    left: 3,
    right: 3,
    borderWidth: 1,
    borderTopWidth: 0,
    borderStyle: "dashed",
    borderColor: "#E7737B",
  },
  ribbonGlyph: { color: colors.cream, fontSize: 20, marginTop: 4 },
  ribbonTails: { flexDirection: "row", marginTop: -2 },
  ribbonTail: {
    width: 0,
    height: 0,
    borderTopWidth: 12,
    borderTopColor: colors.rose,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  ribbonTailLeft: { borderLeftWidth: 0, borderRightWidth: 20 },
  ribbonTailRight: { borderLeftWidth: 20, borderRightWidth: 0 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: `inset 0 0 0 2px ${colors.card}, inset 0 0 0 3px ${colors.lineSoft}, 0 2px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18, marginTop: -1 },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    justifyContent: "center",
  },
  choiceSelected: { backgroundColor: colors.goldSoft, boxShadow: shadows.chosen },
  choiceLabel: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 22 },
  primary: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.gold,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.button,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryLabel: {
    color: colors.line,
    fontSize: 19,
    letterSpacing: 0.6,
    fontFamily: fonts.smallCaps,
  },
  primaryTrailing: { color: colors.line, fontSize: 20, fontFamily: fonts.bold, marginTop: -2 },
  disabled: { opacity: 0.45 },
  pressedDown: { transform: [{ translateY: 2 }, { scale: 0.97 }] },
  textButton: { alignItems: "center", paddingVertical: 8 },
  textButtonLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 15 },
  tileWrap: { width: 66, alignItems: "center", gap: 6 },
  tile: {
    width: 56,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  tileOn: {
    backgroundColor: colors.gold,
    boxShadow: `inset 0 0 0 3px ${colors.gold}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
  },
  tileGlyph: { color: colors.line, fontSize: 24, fontFamily: fonts.display },
  tileGlyphOn: { color: "#B5541F" },
  tileLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 14, lineHeight: 15 },
  star: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
    backgroundColor: colors.card,
    boxShadow: shadows.paper,
  },
  starOn: { backgroundColor: colors.gold },
  starLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 14 },
  bubble: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.paper,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 14,
  },
  bubbleName: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 16, marginBottom: 2 },
  bubbleBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
  bubbleTail: {
    position: "absolute",
    right: 30,
    bottom: -9,
    width: 14,
    height: 14,
    backgroundColor: colors.cream,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    padding: 16,
    marginTop: 12,
  },
  section: { marginTop: 22 },
  sectionTitle: {
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 21,
    lineHeight: 26,
    marginBottom: 6,
  },
  banner: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.paper,
    padding: 14,
    marginTop: 12,
  },
  bannerRose: { backgroundColor: colors.roseSoft },
  bannerForest: { backgroundColor: colors.forestSoft },
  bannerTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17, marginBottom: 4 },
  bannerBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 21 },
});
