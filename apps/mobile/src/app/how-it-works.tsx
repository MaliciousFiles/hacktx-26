import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import {
  Body,
  Kicker,
  Note,
  Panel,
  SampleMark,
  Screen,
  Section,
  Title,
  TopBar,
} from "@/components/ui";
import { formatIsoDate } from "@/format";
import { useBallotData } from "@/ballotData";
import { colors, fonts } from "@/theme";

const SOURCES: [string, string][] = [
  ["Records", "Votes, ordinances, and court filings. What officials did, not only what they said."],
  ["Statements", "Speeches, questionnaires, campaign sites, and public posts, quoted exactly."],
  ["The ballot", "Official contest lists and measure text from the county."],
  ["Money", "Campaign finance reports, shown as ranges when the report gives ranges."],
  ["Fact-checks", "Only from signatories of the International Fact-Checking Network."],
];

const PROMISES = [
  "Every contest on your ballot is shown. When evidence is thin, you get the plain facts and a note saying so.",
  "Every generated sentence cites its source. If a citation fails a check, the sentence is dropped, not rewritten.",
  "Masks are drawn at random each session. They say nothing about the candidate behind them.",
  "Alignment is a reading aid, not a recommendation. Judges are never scored on policy, and measures never get a verdict.",
  "Your answers stay on this phone. They are not sent with lookups, analytics, or share links.",
];

export default function HowItWorks() {
  const router = useRouter();
  const {
    data: { release },
    sample,
  } = useBallotData();
  return (
    <Screen header={<TopBar onBack={() => router.navigate("/")} backLabel="Home" />}>
      <SampleMark />
      <Kicker>How Wishing Well works</Kicker>
      <Title>Evidence first, names last.</Title>
      <Body>
        Answer questions about your priorities, compare candidates’ plans and records, then reveal
        their names and parties when you are ready. We do not endorse anyone.
      </Body>

      <Section title="Where the evidence comes from" icon="scroll">
        {SOURCES.map(([name, detail]) => (
          <Text key={name} style={styles.line}>
            <Text style={styles.lead}>{name}. </Text>
            {detail}
          </Text>
        ))}
      </Section>

      <Section title="What we promise" icon="check">
        {PROMISES.map((promise) => (
          <Text key={promise} style={styles.line}>
            <Text style={styles.lead}>❦ </Text>
            {promise}
          </Text>
        ))}
      </Section>

      <Section title="This release" icon="book">
        <Panel>
          <Text style={styles.release}>{release.id}</Text>
          <Text style={styles.line}>As of {formatIsoDate(release.asOfDate)}.</Text>
          <Note>
            {sample
              ? "You are viewing a hand-made sample. Its quotes, people, and dollars are fictional."
              : "You are viewing a connected frozen release. This walkthrough stays on the same snapshot."}{" "}
            Corrections publish a new release.
          </Note>
        </Panel>
      </Section>

      <Section title="Found a mistake?" icon="info">
        <Body>
          Candidates and voters will be able to report errors. Every correction is reviewed the same
          way for every candidate, and the changes are published with the next release.
        </Body>
        <Note>The report form arrives with the first live release.</Note>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 8 },
  lead: { fontFamily: fonts.bold, color: colors.line },
  release: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20 },
});
