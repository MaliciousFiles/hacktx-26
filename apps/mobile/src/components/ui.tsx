import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  Corner,
  DottedRule,
  Fade,
  Flourish as VineFlourish,
  Godmother,
  Icon,
  PaperDots,
  RibbonArt,
  type IconName,
} from "@/components/art";
import { DrawIn, Enter, Flourish, Idle, PressableScale, PulseRing } from "@/components/motion";
import { colors, fonts, shadows } from "@/theme";
import { useBallotData } from "@/ballotData";

const HEADER_GUESS = 40;

export function Screen({
  children,
  header,
  footer,
  tray,
}: {
  children: ReactNode;
  /** Pinned under the status bar; content scrolls beneath it and fades out. */
  header?: ReactNode;
  footer?: ReactNode;
  /** Full-width bottom shelf, drawn under the footer. */
  tray?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(header ? HEADER_GUESS : 0);
  const top = insets.top + (header ? headerHeight + 10 : 22);
  const bottomInset = Math.max(insets.bottom, 14);

  return (
    <View style={styles.screen}>
      <Glow />
      <PaperDots color="rgba(160,96,70,0.07)" gap={9} />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: top + 8, paddingBottom: footer || tray ? 28 : bottomInset + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: tray ? 12 : bottomInset }]}>
          <Fade color={colors.bg} to="up" style={styles.footerFade} />
          <View style={[styles.column, styles.footerInner]}>{footer}</View>
        </View>
      ) : null}

      {tray ? (
        <View style={[styles.tray, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.trayRow}>{tray}</View>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.topLayer}>
        <Fade color={colors.bg} style={{ height: top + 26 }} />
        <Corner style={{ position: "absolute", top: insets.top + 2, left: 6 }} />
        <Corner flip style={{ position: "absolute", top: insets.top + 2, right: 6 }} />
        {header ? (
          <View
            pointerEvents="box-none"
            onLayout={(event) =>
              setHeaderHeight(
                Math.max(0, Math.round(event.nativeEvent.layout.height - insets.top - 14)),
              )
            }
            style={[styles.header, { paddingTop: insets.top + 14 }]}
          >
            <View pointerEvents="box-none" style={styles.column}>
              {header}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Warm lamplight in the middle of the page; edges match the plain background. */
function Glow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="pageGlow" cx="50%" cy="34%" rx="75%" ry="55%">
          <Stop offset="0" stopColor={colors.bgLight} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.bgLight} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#pageGlow)" />
    </Svg>
  );
}

export function SampleMark({ centered = false }: { centered?: boolean }) {
  const { sample, data } = useBallotData();
  return (
    <View style={[styles.sample, centered && styles.sampleCentered]}>
      <Icon name="sparkle" size={12} strokeWidth={1.8} fill={colors.gold} />
      <Text style={styles.sampleText}>
        {sample
          ? "Demo edition · fictional candidates"
          : `Release ${data.release.id} · ${data.release.asOfDate}`}
      </Text>
    </View>
  );
}

export function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Title({ children }: { children: string }) {
  return (
    <View style={styles.titleBlock}>
      <Enter>
        <Text accessibilityRole="header" style={styles.title}>
          {children}
        </Text>
      </Enter>
      <Rule />
    </View>
  );
}

/** Dotted ink rule that draws itself in. */
export function Rule({ delay }: { delay?: number }) {
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants">
      <DrawIn delay={delay}>
        <DottedRule />
      </DrawIn>
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
    <View style={styles.ornament}>
      <VineFlourish width={132} />
    </View>
  );
}

export function BackButton({ label = "Back", onPress }: { label?: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={styles.back}
    >
      <View style={styles.backDisc}>
        <View style={{ transform: [{ scaleX: -1 }] }}>
          <Icon name="arrow" size={16} strokeWidth={2.4} />
        </View>
      </View>
      <Text style={styles.backLabel}>{label}</Text>
    </PressableScale>
  );
}

/** Round house button that returns to the start screen. Progress is kept. */
export function HomeButton() {
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Home"
      hitSlop={8}
      onPress={() => router.navigate("/")}
    >
      <View style={styles.backDisc}>
        <Icon name="house" size={17} strokeWidth={2.2} />
      </View>
    </PressableScale>
  );
}

export function TopBar({
  onBack,
  backLabel = "Back",
  action,
  home = true,
}: {
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
  /** Show the Home button on the right. On by default for every screen with a top bar. */
  home?: boolean;
}) {
  return (
    <View pointerEvents="box-none" style={styles.topBar}>
      {onBack ? <BackButton label={backLabel} onPress={onBack} /> : <View />}
      <View style={styles.topActions}>
        {action}
        {home ? <HomeButton /> : null}
      </View>
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
          <View key={pip} style={styles.pipSlot}>
            {pip === shown ? <PulseRing size={8} color="rgba(194,64,74,0.55)" /> : null}
            <View style={[styles.pip, pip <= index && styles.pipOn]} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Hanging bookmark ribbon that sways a little. */
export function Ribbon({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      depth={0.94}
    >
      <Idle kind="sway" origin="50% 0%">
        <RibbonArt />
      </Idle>
    </PressableScale>
  );
}

/** Small framed square holding an icon, used beside headings. */
export function IconBox({ icon }: { icon: IconName }) {
  return (
    <View style={styles.iconBox} aria-hidden>
      <Icon name={icon} size={18} strokeWidth={2.1} />
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
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={styles.choiceLabel}>{label}</Text>
    </PressableScale>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  arrow = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primary, disabled && styles.disabled]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
      {arrow ? (
        disabled ? (
          <Icon name="arrow" size={18} strokeWidth={2.4} />
        ) : (
          <Idle kind="nudge" origin="50% 50%">
            <Icon name="arrow" size={18} strokeWidth={2.4} />
          </Idle>
        )
      ) : null}
    </PressableScale>
  );
}

export function TextButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      style={styles.textButton}
    >
      {icon ? <Icon name={icon} size={16} strokeWidth={2.2} /> : null}
      <Text style={styles.textButtonLabel}>{label}</Text>
    </PressableScale>
  );
}

/** A framed tile on the bottom tray. Wiggles when it is switched on. */
export function Tile({
  label,
  icon,
  onPress,
  on = false,
  accessibilityLabel,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  on?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={styles.tileWrap}
    >
      <Flourish kind="wiggle" trigger={on}>
        <View style={[styles.tile, on && styles.tileOn]}>
          <Icon name={icon} size={26} strokeWidth={1.9} fill={on ? colors.goldDeep : undefined} />
        </View>
      </Flourish>
      <Text style={styles.tileLabel}>{label}</Text>
    </PressableScale>
  );
}

/** Tray tile that is the Fairy Godmother herself. */
export function GuideTile({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={on ? "Hide question help" : "Show question help from the Fairy Godmother"}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={styles.tileWrap}
    >
      <View style={styles.guideTile}>
        <Godmother size={50} />
      </View>
      <Text style={styles.tileLabel}>help</Text>
    </PressableScale>
  );
}

export function StarButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={on ? "Marked as matters to me" : "Mark as matters to me"}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={8}
      style={[styles.star, on && styles.starOn]}
    >
      <Icon name="star" size={16} strokeWidth={1.8} fill={on ? colors.goldDeep : undefined} />
      <Text style={styles.starLabel}>Matters to me</Text>
    </PressableScale>
  );
}

/** Speech bubble from the Fairy Godmother. */
export function GuideBubble({
  children,
  avatar = false,
}: {
  children: ReactNode;
  /** Show her beside the bubble instead of pointing down at the tray. */
  avatar?: boolean;
}) {
  const bubble = (
    <View style={[styles.bubble, avatar && styles.bubbleBeside]}>
      <Text style={styles.bubbleName}>Fairy Godmother</Text>
      <Text style={styles.bubbleBody}>{children}</Text>
      <View style={avatar ? styles.bubbleTailLeft : styles.bubbleTail} />
    </View>
  );
  return (
    <Enter kind="pop" style={avatar ? styles.bubbleRow : undefined}>
      {avatar ? (
        <View style={styles.avatar}>
          <Godmother size={56} />
        </View>
      ) : null}
      {bubble}
    </Enter>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {icon ? <Icon name={icon} size={18} strokeWidth={2} /> : <View style={styles.sectionGem} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
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
  const icon: IconName = tone === "rose" ? "info" : tone === "forest" ? "check" : "sparkle";
  return (
    <View
      style={[
        styles.banner,
        tone === "rose" && styles.bannerRose,
        tone === "forest" && styles.bannerForest,
      ]}
    >
      <View style={styles.bannerIcon}>
        <Icon name={icon} size={18} strokeWidth={2} fill={colors.gold} />
      </View>
      <View style={styles.fill}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
    </View>
  );
}

const paperRim = `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  scrollContent: { alignItems: "center", paddingHorizontal: 20 },
  column: { width: "100%", maxWidth: 520, alignSelf: "center" },
  topLayer: { position: "absolute", top: 0, left: 0, right: 0 },
  header: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 6, backgroundColor: colors.bg },
  footerFade: { position: "absolute", left: 0, right: 0, top: -30, height: 30 },
  footerInner: { gap: 10 },
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
    alignItems: "flex-end",
  },
  sample: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.lineSoft,
    backgroundColor: "rgba(252,243,225,0.55)",
    marginBottom: 14,
  },
  sampleCentered: { alignSelf: "center" },
  sampleText: {
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  kicker: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  titleBlock: { gap: 8, marginBottom: 14 },
  title: { fontFamily: fonts.display, color: colors.heading, fontSize: 32, lineHeight: 37 },
  body: { fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 24 },
  note: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  ornament: { alignItems: "center", marginVertical: 20 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 36,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 8 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  backDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    boxShadow: `0 2px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  backLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 16 },
  progress: { alignItems: "flex-end", gap: 7, paddingTop: 8, paddingRight: 10 },
  progressLabel: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  pips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 5 },
  pipSlot: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  pip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  pipOn: { backgroundColor: colors.rose },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: `inset 0 0 0 2px ${colors.card}, inset 0 0 0 3px ${colors.lineSoft}, 0 2px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: paperRim,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    justifyContent: "center",
  },
  choiceSelected: { backgroundColor: colors.goldSoft, boxShadow: shadows.chosen },
  choiceLabel: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 22 },
  primary: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.gold,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.button,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryLabel: {
    color: colors.line,
    fontSize: 20,
    letterSpacing: 0.6,
    fontFamily: fonts.smallCaps,
    marginTop: -2,
  },
  disabled: { opacity: 0.45 },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  textButtonLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 15 },
  tileWrap: { width: 66, alignItems: "center", gap: 6 },
  tile: {
    width: 56,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: paperRim,
    alignItems: "center",
    justifyContent: "center",
  },
  tileOn: {
    backgroundColor: colors.gold,
    boxShadow: `inset 0 0 0 3px ${colors.gold}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
  },
  guideTile: { width: 58, height: 52, alignItems: "center", justifyContent: "flex-end" },
  tileLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 14, lineHeight: 15 },
  star: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  avatar: { paddingBottom: 2 },
  bubble: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 14,
    boxShadow: shadows.paper,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleBeside: { flex: 1 },
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
  bubbleTailLeft: {
    position: "absolute",
    left: -9,
    bottom: 18,
    width: 14,
    height: 14,
    backgroundColor: colors.cream,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  panel: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: paperRim,
    padding: 16,
    marginTop: 12,
  },
  section: { marginTop: 26 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  sectionGem: {
    width: 8,
    height: 8,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.line,
    transform: [{ rotate: "45deg" }],
  },
  sectionTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 21, lineHeight: 26 },
  banner: {
    flexDirection: "row",
    gap: 12,
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
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17, marginBottom: 4 },
  bannerBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 21 },
});
