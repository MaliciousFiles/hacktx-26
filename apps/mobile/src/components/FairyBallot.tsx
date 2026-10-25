import type { ComponentRef, RefObject } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import { Portrait } from "@/components/Portrait";
import { Rule } from "@/components/ui";
import { isChosen, rowText, type BallotRow } from "@/lib/shareBallot";
import { colors, fonts, shadows } from "@/theme";

/**
 * The voter's picks as storybook characters. This view is rendered to an image on the device,
 * so it only ever receives characters: no names, parties or candidate ids.
 */
export function FairyBallot({
  rows,
  footer,
  viewRef,
}: {
  rows: BallotRow[];
  footer?: string;
  /** Lets the share screen capture this card as an image. */
  viewRef?: RefObject<ComponentRef<typeof View> | null>;
}) {
  return (
    <View ref={viewRef} collapsable={false} style={styles.card}>
      <View style={styles.inner}>
        <Text style={styles.kicker}>MY FAIRY TALE BALLOT</Text>
        <Text style={styles.title}>Wishing Well</Text>
        <Rule />
        {rows.map((row) => (
          <View key={row.contestId} style={[styles.row, !isChosen(row) && styles.rowMuted]}>
            {row.kind === "character" ? (
              <Portrait character={row.mask.character} size={52} />
            ) : (
              <View style={styles.plain}>
                <Icon name="mask" size={22} strokeWidth={2} />
              </View>
            )}
            <View style={styles.text}>
              <Text style={styles.contest} numberOfLines={2}>
                {row.contest}
              </Text>
              <Text style={[styles.pick, !isChosen(row) && styles.pickMuted]}>{rowText(row)}</Text>
              {row.kind === "character" ? <Text style={styles.sub}>{row.mask.title}</Text> : null}
            </View>
          </View>
        ))}
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 3,
    borderRadius: 14,
    boxShadow: shadows.paper,
    padding: 6,
    marginTop: 16,
  },
  inner: {
    borderColor: colors.goldDeep,
    borderWidth: 2,
    borderRadius: 10,
    padding: 16,
    backgroundColor: colors.bgLight,
  },
  kicker: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 12,
    letterSpacing: 1.6,
    textAlign: "center",
  },
  title: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  rowMuted: { opacity: 0.7 },
  plain: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  contest: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13, lineHeight: 17 },
  pick: { fontFamily: fonts.display, color: colors.heading, fontSize: 21, lineHeight: 25 },
  pickMuted: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 17 },
  sub: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 14 },
  footer: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
});
