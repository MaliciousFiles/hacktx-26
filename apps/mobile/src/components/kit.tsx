// Components from VISUAL_DESIGN.md §6 that the walkthrough screens share.
import type { CitedSentence, EvidenceRef, Mask, Slot } from "@ftb/types";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/art";
import { PressableScale } from "@/components/motion";
import { monogram } from "@/format";
import { colors, fonts, shadows } from "@/theme";

/** Placeholder portrait until the mask art lands: initials on a gold field (VISUAL_DESIGN §5). */
export function MaskTile({
  mask,
  name,
  size = 56,
}: {
  mask?: Mask;
  /** Shown after the reveal in place of the mask. */
  name?: string;
  size?: number;
}) {
  const label = name ?? mask?.character ?? "Masked";
  return (
    <View
      aria-hidden
      style={[
        styles.mask,
        { width: size, height: size, borderRadius: size / 2 },
        name ? styles.maskOff : null,
      ]}
    >
      <Text style={[styles.maskText, { fontSize: size * 0.36 }]}>{monogram(label)}</Text>
    </View>
  );
}

export type ChipTone = "gold" | "rose" | "sage" | "plain" | "dashed";

export function Chip({
  label,
  icon,
  tone = "gold",
}: {
  label: string;
  icon?: IconName;
  tone?: ChipTone;
}) {
  return (
    <View
      style={[
        styles.chip,
        tone === "rose" && styles.chipRose,
        tone === "sage" && styles.chipSage,
        tone === "plain" && styles.chipPlain,
        tone === "dashed" && styles.chipDashed,
      ]}
    >
      {icon ? <Icon name={icon} size={13} strokeWidth={2.2} fill={colors.goldDeep} /> : null}
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** Small [n] chip that opens the citation sheet. Locked links until the Unmasking. */
export function CitationChip({ refItem, n }: { refItem: EvidenceRef; n: number }) {
  const router = useRouter();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Source ${n}`}
      hitSlop={10}
      onPress={() =>
        router.push({ pathname: "/citation/[id]", params: { id: refItem.id, kind: refItem.kind } })
      }
      style={styles.cite}
    >
      <Text style={styles.citeText}>{n}</Text>
    </PressableScale>
  );
}

/** Sentences with their citation chips. */
export function CitedText({ sentences }: { sentences: readonly CitedSentence[] }) {
  return (
    <View style={styles.cited}>
      {sentences.map((sentence, index) => (
        <View key={`${index}-${sentence.text}`} style={styles.citedRow}>
          <Text style={styles.copy}>{sentence.text}</Text>
          <View style={styles.citeRow}>
            {sentence.citations.map((ref, n) => (
              <CitationChip key={`${ref.kind}-${ref.id}`} refItem={ref} n={n + 1} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** One Plan Explorer slot: documented, red "Not stated", or grey not-applicable with a reason. */
export function SlotRow({ label, slot }: { label: string; slot: Slot }) {
  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{label}</Text>
      {slot.state === "documented" ? (
        slot.sentences.length > 0 ? (
          <CitedText sentences={slot.sentences} />
        ) : (
          <Text style={styles.copy}>Documented.</Text>
        )
      ) : slot.state === "not_stated" ? (
        <NotStated />
      ) : (
        <View>
          <Chip label="Doesn't apply" tone="plain" />
          <CitedText sentences={[slot.reason]} />
        </View>
      )}
    </View>
  );
}

export function NotStated({ label = "Not stated" }: { label?: string }) {
  return (
    <View style={styles.notStated}>
      <Icon name="info" size={13} strokeWidth={2.2} color={colors.rose} />
      <Text style={styles.notStatedText}>{label}</Text>
    </View>
  );
}

/** "How your answers line up (optional)": closed by default (Inv. 22). */
export function Accordion({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.accordion}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.accordionHead}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Text style={styles.accordionOptional}>optional</Text>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chevron" size={16} strokeWidth={2.4} />
        </View>
      </PressableScale>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

export type PoleMark = { key: string; label: string; position: number | null; user?: boolean };

const SHAPES = ["●", "■", "▲", "◆", "★", "⬟"];

/**
 * A horizontal axis with neutral pole labels at the ends. Candidates are ink shapes, the user is
 * the maroon ◆, and a hollow ring means no evidence (VISUAL_DESIGN §6). Never colored by side.
 */
export function PoleLine({
  left,
  right,
  marks,
}: {
  left: string;
  right: string;
  marks: readonly PoleMark[];
}) {
  let shape = 0;
  const placed = marks.map((mark) => ({
    ...mark,
    glyph: mark.user ? "◆" : mark.position == null ? "○" : (SHAPES[shape++ % SHAPES.length] ?? "●"),
  }));
  return (
    <View style={styles.pole}>
      <View style={styles.poleTrack}>
        <View style={styles.poleLine} />
        {placed
          .filter((mark) => mark.position != null)
          .map((mark) => (
            <Text
              key={mark.key}
              style={[
                styles.poleGlyph,
                mark.user && styles.poleUser,
                { left: `${((mark.position ?? 0) + 1) * 50}%` },
              ]}
            >
              {mark.glyph}
            </Text>
          ))}
      </View>
      <View style={styles.poleEnds}>
        <Text style={styles.poleEnd}>{left}</Text>
        <Text style={[styles.poleEnd, styles.poleEndRight]}>{right}</Text>
      </View>
      <View style={styles.legend}>
        {placed.map((mark) => (
          <Text key={mark.key} style={styles.legendItem}>
            <Text style={mark.user ? styles.poleUser : undefined}>{mark.glyph}</Text> {mark.label}
            {mark.position == null ? " · no evidence" : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** A tappable row with a chevron, used for menus and lists. */
export function RowLink({
  title,
  detail,
  icon,
  onPress,
  right,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  onPress: () => void;
  right?: ReactNode;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      depth={0.98}
      style={styles.rowLink}
    >
      {icon ? <Icon name={icon} size={20} strokeWidth={2} /> : null}
      <View style={styles.fill}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right}
      <Icon name="chevron" size={16} strokeWidth={2.4} />
    </PressableScale>
  );
}

export function Empty({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

export const kitStyles = StyleSheet.create({
  copy: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  label: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  quote: {
    backgroundColor: colors.cream,
    borderLeftWidth: 3,
    borderLeftColor: colors.line,
    borderRadius: 6,
    padding: 12,
    marginTop: 10,
  },
  quoteText: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 26 },
  meta: {
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    padding: 16,
    marginTop: 14,
  },
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  copy: kitStyles.copy,
  mask: {
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.goldSoft,
    boxShadow: shadows.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  maskOff: { backgroundColor: colors.cream },
  maskText: { fontFamily: fonts.display, color: colors.line },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.goldSoft,
  },
  chipRose: { backgroundColor: colors.roseSoft, borderColor: colors.rose },
  chipSage: { backgroundColor: colors.forestSoft },
  chipPlain: { backgroundColor: colors.cream, borderColor: colors.lineSoft },
  chipDashed: { borderStyle: "dashed", backgroundColor: colors.cream },
  chipText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 12.5 },
  cited: { gap: 8, marginTop: 6 },
  citedRow: { gap: 4 },
  citeRow: { flexDirection: "row", gap: 6 },
  cite: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  citeText: { fontFamily: fonts.bold, color: colors.line, fontSize: 12 },
  slot: { marginTop: 10, gap: 2 },
  slotLabel: kitStyles.label,
  notStated: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.rose,
    backgroundColor: colors.roseSoft,
  },
  notStatedText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13 },
  accordion: {
    marginTop: 22,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.lineSoft,
    borderRadius: 10,
    backgroundColor: "rgba(252,243,225,0.5)",
  },
  accordionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    minHeight: 48,
  },
  accordionTitle: { flex: 1, fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
  accordionOptional: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 14 },
  accordionBody: { paddingHorizontal: 14, paddingBottom: 14 },
  pole: { marginTop: 10 },
  poleTrack: { height: 26, justifyContent: "center", marginHorizontal: 10 },
  poleLine: { height: 2, backgroundColor: colors.lineSoft, borderRadius: 1 },
  poleGlyph: {
    position: "absolute",
    top: 2,
    marginLeft: -7,
    fontSize: 16,
    color: colors.ink,
  },
  poleUser: { color: colors.line },
  poleEnds: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  poleEnd: { flex: 1, fontFamily: fonts.body, color: colors.inkSoft, fontSize: 13, lineHeight: 17 },
  poleEndRight: { textAlign: "right" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendItem: { fontFamily: fonts.body, color: colors.ink, fontSize: 13 },
  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    marginTop: 10,
  },
  rowTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
  rowDetail: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14, lineHeight: 19 },
  empty: {
    fontFamily: fonts.displayItalic,
    color: colors.inkSoft,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
  },
});
