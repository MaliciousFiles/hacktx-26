// About & nonpartisan statement (UX.md §3.6, Inv. 21).
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Body, Kicker, Panel, SampleMark, Screen, Section, Title, TopBar } from "@/components/ui";
import { demo, release } from "@/data/release";
import { formatIsoDate } from "@/format";
import { colors, fonts } from "@/theme";

export default function About() {
  const router = useRouter();
  return (
    <Screen header={<TopBar onBack={() => router.back()} />}>
      {demo ? <SampleMark /> : null}
      <Kicker>About</Kicker>
      <Title>We don&apos;t endorse candidates.</Title>
      <Body>
        Fairy Tale Ballot shows what each choice on your ballot can do, what candidates have said
        and done, and what&apos;s missing. It never tells you how to vote, and propositions never
        get a recommendation.
      </Body>
      <Section title="This data release" icon="book">
        <Panel>
          <Text style={styles.release}>{release.id}</Text>
          <Text style={styles.line}>As of {formatIsoDate(release.asOfDate)}</Text>
          <Text style={styles.line}>Manifest {release.manifestHash}</Text>
        </Panel>
      </Section>
      <Section title="Limitations" icon="info">
        <Body>
          Evidence coverage is uneven. When a contest has too little public evidence to compare
          fairly, it shows objective facts only. Masks hide names, not facts: a quote can be
          searched.
        </Body>
      </Section>
      <Section title="Corrections" icon="scroll">
        <Body>
          Anyone can report an error from the menu. Reports are reviewed the same way for every
          candidate, and corrections ship in a new numbered release with a published diff.
        </Body>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  release: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20 },
  line: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, marginTop: 4 },
});
