// The share image (VISUAL_DESIGN §8). Its props are a fixed allowlist, so picks, names, parties or
// buckets can't reach it by accident (APP_BUILD.md §4). lib.test.ts checks the prop keys.
import { forwardRef, type ComponentRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Flourish } from "@/components/art";
import { colors, fonts } from "@/theme";

export type ShareStatKey = "parties" | "across_aisle" | "plans_first";

export interface ShareCardProps {
  statKey: ShareStatKey;
  statValue: number | null;
}

export const SHARE_CARD_PROP_KEYS = ["statKey", "statValue"] as const;

export function shareLine(statKey: ShareStatKey, statValue: number | null): string {
  switch (statKey) {
    case "parties":
      return `My picks came from ${statValue ?? 0} different ${statValue === 1 ? "party" : "parties"}.`;
    case "across_aisle":
      return `${statValue ?? 0}% of my picks crossed the aisle.`;
    case "plans_first":
      return "I read the plans before the names.";
  }
}

export const ShareCard = forwardRef<ComponentRef<typeof View>, ShareCardProps>(function ShareCard(
  { statKey, statValue },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.inner}>
        <Text style={styles.kicker}>My Fairy Tale Ballot</Text>
        <Text style={styles.stat}>{shareLine(statKey, statValue)}</Text>
        <Flourish width={150} />
        <Text style={styles.domain}>Pick the plan before the party</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    aspectRatio: 4 / 5,
    backgroundColor: colors.bg,
    borderWidth: 3,
    borderColor: colors.goldDeep,
    borderRadius: 12,
    padding: 8,
  },
  inner: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.goldDeep,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    padding: 24,
  },
  kicker: {
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 20,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  stat: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 34,
    lineHeight: 41,
    textAlign: "center",
  },
  domain: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 15 },
});
