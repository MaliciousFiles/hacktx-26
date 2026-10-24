// Plain building blocks for the mockup. Neutral styling on purpose: swap freely, nothing depends on it.
import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { router } from "expo-router";
import type { CitedSentence, EvidenceRef, EvidenceState, Slot } from "@ftb/types";
import { citationFor, release } from "./data";

export const colors = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  text: "#1c1c1f",
  muted: "#6b6b73",
  border: "#dcdce0",
  accent: "#2f5bd3",
  bad: "#c0362c",
  okBg: "#eaf5ec",
  warnBg: "#fdf4e3",
};

/** Scrollable page with title, optional subtitle, and the nonpartisan footer. */
export function Screen({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent}>
      <Text style={s.h1} accessibilityRole="header">
        {title}
      </Text>
      {sub && <Muted>{sub}</Muted>}
      {children}
      <Footer />
    </ScrollView>
  );
}

function Footer() {
  return (
    <View style={s.footer}>
      <Muted small>
        Nonpartisan: we do not endorse candidates or measures. Data release {release.release.id} as
        of {release.release.asOfDate}.
      </Muted>
      <Btn kind="link" label="Report an error" onPress={() => router.push("/report")} />
      <Muted small>MOCKUP — fixture data, not real candidate analysis.</Muted>
    </View>
  );
}

export function P({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.p, style]}>{children}</Text>;
}

export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  return <Text style={[s.p, s.muted, small && s.small]}>{children}</Text>;
}

export function Bad({ children }: { children: ReactNode }) {
  return <Text style={[s.p, s.bad]}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

export function H3({ children }: { children: ReactNode }) {
  return <Text style={s.h3}>{children}</Text>;
}

export function H4({ children }: { children: ReactNode }) {
  return <Text style={s.h4}>{children}</Text>;
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.h2} accessibilityRole="header">
        {title}
      </Text>
      {note && <Muted small>{note}</Muted>}
      {children}
    </View>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" }) {
  return (
    <View
      style={[
        s.card,
        tone === "ok" && { backgroundColor: colors.okBg },
        tone === "warn" && { backgroundColor: colors.warnBg },
      ]}
    >
      {children}
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

export function Btn({
  label,
  onPress,
  kind = "default",
  selected,
  disabled,
  role = "button",
}: {
  label: string;
  onPress: () => void;
  kind?: "default" | "primary" | "link" | "option";
  selected?: boolean;
  disabled?: boolean;
  role?: "button" | "radio" | "tab";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{
        selected,
        checked: role === "radio" ? !!selected : undefined,
        disabled,
      }}
      style={({ pressed }) => [
        kind === "link" ? s.link : s.btn,
        kind === "primary" && s.btnPrimary,
        kind === "option" && s.btnOption,
        selected && s.btnSelected,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          s.btnText,
          kind === "primary" && { color: "#fff" },
          kind === "link" && { color: colors.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text style={{ color: colors.accent }}>
          {open ? "▾" : "▸"} {title}
        </Text>
      </Pressable>
      {open && <View style={{ paddingTop: 8 }}>{children}</View>}
    </View>
  );
}

/** Label/value rows: the mobile stand-in for a table. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={i} style={s.kv}>
          <Text style={s.kvKey}>{k}</Text>
          <View style={{ flex: 1 }}>{typeof v === "string" ? <P>{v}</P> : v}</View>
        </View>
      ))}
    </View>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <View style={s.quote}>
      <P>{children}</P>
    </View>
  );
}

/** One generated sentence plus its citation markers. Pre-reveal there is no source URL. */
export function Cited({ s: sentence }: { s: CitedSentence }) {
  return (
    <P>
      {sentence.text}
      {sentence.citations.map((ref, i) => (
        <CiteMark key={i} r={ref} n={i + 1} />
      ))}
    </P>
  );
}

function CiteMark({ r, n }: { r: EvidenceRef; n: number }) {
  const cite = citationFor(r);
  const label =
    r.kind === "candidate"
      ? `Citation ${n}: candidate evidence ${r.id}, link held until reveal`
      : `Citation ${n}: ${cite?.outlet ?? "source"} ${cite?.sourceId ?? r.id}`;
  return (
    <Text style={s.cite} accessibilityLabel={label}>
      {" "}
      [{n}]
    </Text>
  );
}

export function Sentences({ items, empty }: { items: CitedSentence[]; empty?: string }) {
  if (items.length === 0) return <Muted small>{empty ?? "None found."}</Muted>;
  return (
    <View>
      {items.map((x, i) => (
        <Cited key={i} s={x} />
      ))}
    </View>
  );
}

export function SlotView({ slot }: { slot: Slot }) {
  if (slot.state === "not_stated") return <Bad>Not stated</Bad>;
  if (slot.state === "not_applicable")
    return (
      <View>
        <Muted small>Not applicable:</Muted>
        <Cited s={slot.reason} />
      </View>
    );
  return <Sentences items={slot.sentences} />;
}

const evidenceText: Record<EvidenceState, string> = {
  sufficient: "Sufficient evidence",
  thin: "Thin evidence",
  none: "No evidence",
};

export function EvidenceTag({ state }: { state: EvidenceState }) {
  return (
    <View style={s.tag}>
      <Text style={[s.small, state === "none" && { color: colors.bad }]}>
        {evidenceText[state]}
      </Text>
    </View>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <View style={{ marginVertical: 6 }} accessibilityLabel={`${label}: ${pct}%`}>
      <Text style={s.small}>
        {label} <Text style={s.muted}>{pct}%</Text>
      </Text>
      <View style={s.meterTrack}>
        <View style={[s.meterFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: 16, paddingBottom: 48 },
  h1: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: 6 },
  h3: { fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 2 },
  h4: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 4,
  },
  p: { fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { color: colors.muted },
  small: { fontSize: 13, lineHeight: 18 },
  bad: { color: colors.bad, fontWeight: "600" },
  eyebrow: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: colors.muted },
  section: { marginTop: 24 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginVertical: 8,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginVertical: 10 },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnOption: { paddingVertical: 14, width: "100%" },
  btnSelected: { borderColor: colors.accent, borderWidth: 2 },
  btnText: { fontSize: 15, color: colors.text },
  link: { paddingVertical: 4 },
  collapsible: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  kv: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  kvKey: { width: 110, fontSize: 14, color: colors.muted },
  quote: { borderLeftWidth: 3, borderColor: colors.border, paddingLeft: 10, marginVertical: 4 },
  cite: { color: colors.accent, fontSize: 11 },
  tag: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  meterTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 4 },
  meterFill: { height: 6, backgroundColor: colors.accent, borderRadius: 3 },
  footer: { marginTop: 32, paddingTop: 12, borderTopWidth: 1, borderColor: colors.border, gap: 4 },
});
