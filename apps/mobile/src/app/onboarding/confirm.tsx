// O6 · Confirm ballot: counts by section and the pinned data release (Inv. 4).
import type { Contest } from "@ftb/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import {
  Kicker,
  Note,
  Panel,
  PrimaryButton,
  SampleMark,
  Screen,
  Title,
  TopBar,
} from "@/components/ui";
import { ballot, ballotStyles, contests, demo, release } from "@/data/release";
import { formatIsoDate } from "@/format";
import { sectionOf, SECTION_LABEL } from "@/labels";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function Confirm() {
  const router = useRouter();
  const session = useSession();
  const { style } = useLocalSearchParams<{ style: string }>();
  const chosen = ballotStyles.find((item) => item.id === style) ?? ballotStyles[0];

  const races = contests.filter((c) => c.officeKind !== "measure" && c.officeKind !== "judicial");
  const judicial = contests.filter((c) => c.officeKind === "judicial");
  const measures = contests.filter((c) => c.officeKind === "measure");
  const grouped = new Map<string, Contest[]>();
  for (const contest of contests) {
    const section = sectionOf(contest);
    grouped.set(section, [...(grouped.get(section) ?? []), contest]);
  }

  const start = () => {
    if (!chosen || !session.begin(chosen.id)) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace("/explore");
  };

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} />}
      footer={<PrimaryButton label="Start exploring" arrow onPress={start} />}
    >
      {demo ? <SampleMark /> : null}
      <Kicker>{chosen?.label ?? "Your ballot"}</Kicker>
      <Title>{`Your ballot has ${plural(contests.length, "contest", "contests")}`}</Title>
      <Text style={styles.lead}>
        {plural(races.length, "race", "races")},{" "}
        {plural(judicial.length, "judicial race", "judicial races")},{" "}
        {plural(measures.length, "proposition", "propositions")}. Every one of them is here.
      </Text>
      {[...grouped].map(([section, items]) => (
        <View key={section}>
          <Text style={styles.section}>{SECTION_LABEL[section as keyof typeof SECTION_LABEL]}</Text>
          {items.map((contest) => (
            <View key={contest.id} style={styles.row}>
              <Icon name="check" size={14} strokeWidth={2.6} />
              <Text style={styles.contest}>{contest.title}</Text>
            </View>
          ))}
        </View>
      ))}
      <Panel>
        <Text style={styles.stamp}>
          Data release {release.id} · as of {formatIsoDate(release.asOfDate)}
        </Text>
        <Note>
          This release stays pinned for your whole walkthrough, so the evidence won't shift under
          you. Style {ballot.ballotStyleId}.
        </Note>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 24 },
  section: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 18,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  contest: { flex: 1, fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 22 },
  stamp: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15 },
});
