import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import { PressableScale } from "@/components/motion";
import { colors, fonts } from "@/theme";

export type ChipTone = "plain" | "gold" | "forest" | "rose";

/** A small rounded label. Use for facts like dates, sources and evidence strength. */
export function Chip({
  label,
  tone = "plain",
  icon,
}: {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
}) {
  return (
    <View style={[styles.chip, chipTone[tone]]}>
      {icon ? <Icon name={icon} size={12} strokeWidth={2.4} /> : null}
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** A tappable section that folds away, so a candidate is a short list of headings, not a wall. */
export function Disclosure({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: IconName;
  count?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.disclosure}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count ? `, ${count}` : ""}`}
        depth={0.99}
        onPress={() => setOpen(!open)}
        style={styles.disclosureHead}
      >
        <View style={styles.disclosureIcon}>
          <Icon name={icon} size={16} strokeWidth={2.2} />
        </View>
        <Text style={styles.disclosureTitle}>{title}</Text>
        {count ? <Text style={styles.disclosureCount}>{count}</Text> : null}
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={16} strokeWidth={2.4} />
        </View>
      </PressableScale>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

/** A number or short value with a small caption under it. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/** Verbatim excerpt with its issue, source and date, so the voter can weigh it. */
export function QuoteCard({
  excerpt,
  chips,
  meta,
}: {
  excerpt: string;
  chips: ReactNode;
  meta?: string;
}) {
  return (
    <View style={styles.quote}>
      <Text style={styles.quoteText}>“{excerpt}”</Text>
      <ChipRow>{chips}</ChipRow>
      {meta ? <Text style={styles.quoteMeta}>{meta}</Text> : null}
    </View>
  );
}

const chipTone = StyleSheet.create({
  plain: { backgroundColor: colors.cream, borderColor: colors.lineSoft },
  gold: { backgroundColor: colors.goldSoft, borderColor: colors.goldDeep },
  forest: { backgroundColor: colors.forestSoft, borderColor: colors.forest },
  rose: { backgroundColor: colors.roseSoft, borderColor: colors.rose },
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chipText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 12.5, lineHeight: 17 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  disclosure: {
    borderTopWidth: 1.5,
    borderTopColor: colors.lineSoft,
    marginTop: 14,
    paddingTop: 4,
  },
  disclosureHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  disclosureIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  disclosureTitle: {
    flex: 1,
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 19,
    lineHeight: 24,
  },
  disclosureCount: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13 },
  disclosureBody: { paddingBottom: 6, paddingTop: 4 },
  stat: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.cream,
    borderColor: colors.lineSoft,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  statValue: { fontFamily: fonts.display, color: colors.heading, fontSize: 21, lineHeight: 26 },
  statLabel: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13.5, marginTop: 2 },
  statHint: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  quote: {
    backgroundColor: colors.cream,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  quoteText: { fontFamily: fonts.displayItalic, color: colors.ink, fontSize: 17, lineHeight: 24 },
  quoteMeta: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
});
