import type { Contest } from "@ftb/types";
import { StyleSheet, Text, View } from "react-native";
import { issueById } from "@/fixtures/travisDemo";
import { useCandidateName } from "@/candidateName";
import { dividingIssues, type DividingEntry, type DividingIssue } from "@/dividing";
import { formatIsoDate, monogram } from "@/format";
import { SOURCE_LABEL } from "@/labels";
import { useBallotData } from "@/ballotData";
import { useSession } from "@/session";
import { Chip, ChipRow } from "@/components/cardKit";
import { Section } from "@/components/ui";
import { colors, fonts, shadows } from "@/theme";

/** Where the candidates in this contest part ways, one card per issue. */
export function DividingIssues({ contest }: { contest: Contest }) {
  const { orderedProfiles } = useBallotData();
  const session = useSession();
  const profiles = orderedProfiles(contest, session.order[contest.id]);
  const issues = dividingIssues(profiles, issueById);
  if (issues.length === 0) return null;

  return (
    <Section title="Dividing issues" icon="swap">
      <Text style={styles.lead}>
        Where the candidates lean opposite ways, using what is on file for each. Issues with thin
        evidence are marked.
      </Text>
      {issues.map((issue) => (
        <IssueCard key={issue.issueId} contest={contest} issue={issue} />
      ))}
    </Section>
  );
}

function IssueCard({ contest, issue }: { contest: Contest; issue: DividingIssue }) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.issue}>
        {issue.label}
      </Text>
      <Side
        contest={contest}
        tag="For"
        pole={issue.positivePole}
        entries={issue.positive}
        tone="for"
      />
      <Side
        contest={contest}
        tag="Against"
        pole={issue.negativePole}
        entries={issue.negative}
        tone="against"
      />
      {issue.between.length > 0 ? (
        <View style={styles.between}>
          <Text style={styles.betweenTitle}>In between or mixed</Text>
          {issue.between.map((entry) => (
            <EntryRow key={entry.profile.id} contest={contest} entry={entry} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Side({
  contest,
  tag,
  pole,
  entries,
  tone,
}: {
  contest: Contest;
  tag: string;
  pole: string;
  entries: DividingEntry[];
  tone: "for" | "against";
}) {
  return (
    <View style={[styles.side, tone === "for" ? styles.sideFor : styles.sideAgainst]}>
      <View style={styles.sideHead}>
        <View style={[styles.tag, tone === "for" ? styles.tagFor : styles.tagAgainst]}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
        <Text style={styles.pole}>{pole}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.nobody}>No candidate on file leans this way.</Text>
      ) : (
        entries.map((entry) => (
          <EntryRow key={entry.profile.id} contest={contest} entry={entry} />
        ))
      )}
    </View>
  );
}

function EntryRow({ contest, entry }: { contest: Contest; entry: DividingEntry }) {
  const { name } = useCandidateName(contest, entry.profile);
  const evidence = entry.evidence;
  return (
    <View style={styles.entry}>
      <View style={styles.entryHead}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText}>{monogram(name)}</Text>
        </View>
        <Text style={styles.entryName}>{name}</Text>
      </View>
      {evidence ? (
        <>
          <Text style={styles.quote}>“{evidence.excerpt}”</Text>
          <ChipRow>
            <Chip
              label={SOURCE_LABEL[evidence.sourceType]}
              tone={evidence.kind === "action" ? "forest" : "plain"}
            />
            <Chip
              label={evidence.eventDate.date ? formatIsoDate(evidence.eventDate.date) : "Date unknown"}
              icon="calendar"
            />
            {entry.evidenceState === "thin" ? <Chip label="Thin evidence" tone="gold" /> : null}
          </ChipRow>
        </>
      ) : (
        <ChipRow>
          <Chip label="No quote on file" />
          {entry.evidenceState === "thin" ? <Chip label="Thin evidence" tone="gold" /> : null}
        </ChipRow>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.paper,
    padding: 14,
    marginTop: 14,
  },
  issue: { fontFamily: fonts.display, color: colors.heading, fontSize: 24, lineHeight: 28 },
  side: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginTop: 10 },
  sideFor: { backgroundColor: colors.forestSoft, borderColor: colors.forest },
  sideAgainst: { backgroundColor: colors.goldSoft, borderColor: colors.goldDeep },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  tag: {
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagFor: { backgroundColor: colors.card },
  tagAgainst: { backgroundColor: colors.card },
  tagText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 14, lineHeight: 18 },
  pole: { flex: 1, fontFamily: fonts.bold, color: colors.ink, fontSize: 16, lineHeight: 22 },
  nobody: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    marginTop: 8,
  },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  entryHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  monogram: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 12 },
  entryName: { flex: 1, fontFamily: fonts.display, color: colors.heading, fontSize: 18 },
  quote: {
    fontFamily: fonts.displayItalic,
    color: colors.ink,
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 8,
  },
  between: { marginTop: 12 },
  betweenTitle: { fontFamily: fonts.smallCaps, color: colors.inkSoft, fontSize: 15 },
});
