// Citation sheet: excerpt, Verbatim vs. Excerpt label, outlet, date. Source links are held until
// the Unmasking (Inv. 7); the masked release doesn't carry URLs at all.
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import { Chip, ChipRow, kitStyles } from "@/components/kit";
import { Kicker, Note, Screen, TextButton } from "@/components/ui";
import { citationById, evidenceItem, issueLabel } from "@/data/release";
import { formatIsoDate } from "@/format";
import { SOURCE_LABEL } from "@/labels";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function CitationSheet() {
  const router = useRouter();
  const session = useSession();
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const revealed = session.state.phase === "revealed";

  const evidence = kind === "candidate" ? evidenceItem(id) : undefined;
  const citation = kind !== "candidate" ? citationById(id) : undefined;
  const excerpt = evidence?.excerpt ?? citation?.excerpt;
  const redacted = evidence?.redacted ?? citation?.redacted ?? true;
  const meta = [
    redacted ? "Excerpt, names removed" : "Verbatim",
    evidence ? SOURCE_LABEL[evidence.sourceType] : null,
    evidence ? issueLabel(evidence.issueId) : null,
    citation?.outlet,
    evidence?.date ?? citation?.publishedAt,
  ]
    .filter(Boolean)
    .map((part) => (/^\d{4}-\d{2}-\d{2}$/.test(String(part)) ? formatIsoDate(String(part)) : part))
    .join(" · ");

  return (
    <Screen footer={<TextButton label="Close" onPress={() => router.back()} />}>
      <Kicker>Source</Kicker>
      {excerpt ? (
        <View style={kitStyles.quote}>
          <Text style={kitStyles.quoteText}>“{excerpt}”</Text>
          <Text style={kitStyles.meta}>{meta}</Text>
        </View>
      ) : (
        <Note>This source isn&apos;t in the current release.</Note>
      )}
      {evidence ? (
        <ChipRow>
          <Chip label={evidence.kind === "action" ? "Action" : "Words"} tone="plain" />
        </ChipRow>
      ) : null}
      <View style={styles.lock}>
        <Icon name="lock" size={16} strokeWidth={2.2} />
        <Text style={styles.lockText}>
          {revealed
            ? "Full links come with the next release. This sample has none to show."
            : "Full link available after the Unmasking."}
        </Text>
      </View>
      <TextButton
        label="Report a problem with this"
        icon="info"
        onPress={() => router.push({ pathname: "/report", params: { ref: id } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lock: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  lockText: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
  },
});
