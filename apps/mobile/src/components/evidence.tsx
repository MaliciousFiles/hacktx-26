// Evidence blocks shared by the contest, candidate and compare screens.
import type {
  CandidateProfile,
  Contest,
  ContextBrief as Brief,
  ContestMatch,
  JudicialDim,
  UserVector,
} from "@ftb/types";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import { Chip, ChipRow, CitedText, Empty, kitStyles, MaskTile, PoleLine } from "@/components/kit";
import { PressableScale } from "@/components/motion";
import { Note, Section } from "@/components/ui";
import { issueLabel } from "@/data/release";
import { BUCKET_COPY, FLAG_COPY, JUDICIAL_LABEL, TIER_LABEL } from "@/labels";
import { displayBucket, proximity } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

const NOTE_COPY = {
  no_organized_opposition_found: "No organized opposition found.",
  data_unavailable: "No data available.",
} as const;

/**
 * Context Brief in its fixed order. Supporters and opponents look identical (Inv. 17), and an
 * empty group says so rather than being padded.
 */
export function ContextBrief({ context }: { context: Brief }) {
  const systemNotes = context.notes.flatMap((note) => (note.kind === "system" ? [note.code] : []));
  const groups = [
    { title: "Documented", icon: "check" as const, claims: context.confirmed },
    { title: "Supporters say", icon: "info" as const, claims: context.supporters },
    { title: "Opponents say", icon: "info" as const, claims: context.opponents },
    { title: "Disputed or unknown", icon: "info" as const, claims: context.disputed },
  ];
  const emptyCopy = (title: string) => {
    if (title === "Opponents say" && systemNotes.includes("no_organized_opposition_found")) {
      return NOTE_COPY.no_organized_opposition_found;
    }
    return systemNotes.includes("data_unavailable")
      ? NOTE_COPY.data_unavailable
      : "Nothing on file.";
  };
  return (
    <Section title="What people are saying" icon="book">
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={kitStyles.label}>{group.title}</Text>
          {group.claims.length === 0 ? (
            <Empty>{emptyCopy(group.title)}</Empty>
          ) : (
            group.claims.map((claim, index) => (
              <CitedText key={`${group.title}-${index}`} sentences={claim.sentences} />
            ))
          )}
        </View>
      ))}
      {context.notes.map((note, index) =>
        note.kind === "verified" ? <CitedText key={index} sentences={[note.sentence]} /> : null,
      )}
    </Section>
  );
}

/** Masked mini card on the contest screen (UX.md §3.3 B2 §4). No alignment on it, ever. */
export function CandidateMini({ profile }: { profile: CandidateProfile }) {
  const router = useRouter();
  const session = useSession();
  const mask = session.masks[profile.id];
  const identity = session.identityFor(profile.id);
  const flags = countFlags(profile);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`See card for ${session.nameFor(profile.id)}`}
      onPress={() => router.push({ pathname: "/candidate/[id]", params: { id: profile.id } })}
      depth={0.98}
      style={kitStyles.card}
    >
      <View style={styles.miniHead}>
        <MaskTile mask={mask} name={identity?.name} />
        <View style={styles.fill}>
          <Text style={styles.miniName}>{session.nameFor(profile.id)}</Text>
          <Text style={styles.miniSub}>
            {identity ? (identity.party ?? "No party listed") : (mask?.title ?? "Masked candidate")}
          </Text>
        </View>
        <Icon name="chevron" size={18} strokeWidth={2.4} />
      </View>
      <ChipRow>
        <Chip
          label={
            profile.incumbent
              ? "Incumbent"
              : profile.recordInOffice === "none"
                ? "No record in office"
                : "Record in office"
          }
          tone="plain"
        />
        {profile.coverage === "objective_only" ? (
          <Chip label="Objective info only" tone="plain" icon="info" />
        ) : (
          <Chip label={`Evidence: ${profile.evidenceState}`} tone="plain" />
        )}
        {profile.plans.length > 0 ? (
          <Chip label={`Plan detail: ${TIER_LABEL[profile.specificity.tier] ?? "—"}`} tone="gold" />
        ) : null}
      </ChipRow>
      {flags.length > 0 ? (
        <Text style={styles.flags}>
          {flags.map((flag) => `${flag.emoji} ${flag.count}`).join("   ")}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export const FLAG_EMOJI = {
  beyond_power: "🚩",
  needs_others: "⚠️",
  no_funding: "💸",
  funded: "✅",
} as const;

export function countFlags(profile: CandidateProfile) {
  const counts = new Map<keyof typeof FLAG_EMOJI, number>();
  for (const flag of profile.credibility.flags)
    counts.set(flag.type, (counts.get(flag.type) ?? 0) + 1);
  return [...counts].map(([type, count]) => ({
    type,
    count,
    emoji: FLAG_EMOJI[type],
    title: FLAG_COPY[type].title,
  }));
}

/** B7 content: bucket chip, clarity, issue-by-issue. Lives inside the collapsed Accordion only. */
export function AlignmentDetail({
  match,
  profiles,
  userVector,
}: {
  match: ContestMatch;
  profiles: readonly CandidateProfile[];
  userVector: UserVector;
}) {
  const session = useSession();
  return (
    <View>
      {match.noStrongMatch ? (
        <Text style={kitStyles.copy}>
          No candidate lines up closely with your answers on the issues we could compare.
          Here&apos;s issue by issue.
        </Text>
      ) : null}
      {profiles.map((profile) => {
        const result = match.results.find((item) => item.candidateId === profile.id);
        if (!result) return null;
        const bucket = BUCKET_COPY[displayBucket(result)];
        return (
          <View key={profile.id} style={styles.alignBlock}>
            <Text style={styles.miniName}>{session.nameFor(profile.id)}</Text>
            <ChipRow>
              <Chip
                label={`${bucket.emoji} ${bucket.label}`}
                tone={displayBucket(result) === "clouded" ? "dashed" : "gold"}
              />
              <Chip label={`Compared on ${result.issuesCompared} issues`} tone="plain" />
            </ChipRow>
            <Clarity value={result.matchClarity} />
            {Object.entries(profile.stances).map(([issueId, stance]) => {
              const user = userVector[issueId];
              const state = profile.issueEvidenceState[issueId];
              const line = !user
                ? "you didn't answer this one"
                : state !== "sufficient"
                  ? "not enough evidence to compare"
                  : proximity(user.position, stance.position).label;
              return (
                <Text key={issueId} style={styles.issueLine}>
                  {issueLabel(issueId)}: {line}
                </Text>
              );
            })}
          </View>
        );
      })}
      <Note>
        This is a way to navigate, not a recommendation. It only covers issues with enough evidence.
      </Note>
    </View>
  );
}

function Clarity({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  return (
    <View style={styles.clarity} accessible accessibilityLabel={`Match clarity ${filled} of 5`}>
      <Text style={styles.clarityLabel}>Match clarity</Text>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={[styles.seg, i < filled && styles.segOn]} />
      ))}
    </View>
  );
}

const DIMENSIONS: { dim: JudicialDim; left: string; right: string }[] = [
  { dim: "text_vs_purpose", left: "Text", right: "Purpose" },
  { dim: "restraint_vs_review", left: "Defers to lawmakers", right: "Willing to strike laws down" },
  { dim: "precedent", left: "Sticks with past rulings", right: "Willing to overturn" },
  { dim: "procedural_strictness", left: "Flexible on procedure", right: "Strict on procedure" },
];

/** B8: one pole line per dimension, user ◆ and each judge's dot. No buckets, no "match". */
export function JudicialPhilosophy({
  profiles,
  userVector,
}: {
  profiles: readonly CandidateProfile[];
  userVector: UserVector;
}) {
  const session = useSession();
  return (
    <Section title="Judicial philosophy" icon="gavel">
      <Note>Judges aren&apos;t scored on policy. This only shows how each one reads the law.</Note>
      {DIMENSIONS.map(({ dim, left, right }) => {
        const user = userVector[`judicial.${dim}`];
        return (
          <View key={dim} style={styles.dim}>
            <Text style={kitStyles.label}>{JUDICIAL_LABEL[dim]}</Text>
            <PoleLine
              left={left}
              right={right}
              marks={[
                ...profiles.map((profile) => ({
                  key: profile.id,
                  label: session.nameFor(profile.id),
                  position: profile.judicialProfile?.philosophy[dim]?.position ?? null,
                })),
                { key: "you", label: "You", position: user?.position ?? null, user: true },
              ]}
            />
          </View>
        );
      })}
    </Section>
  );
}

/** Objective qualifications for a judge, all cited in the data. */
export function JudicialQualifications({ profile }: { profile: CandidateProfile }) {
  const judicial = profile.judicialProfile;
  if (!judicial) return <Empty>No qualifications on file.</Empty>;
  return (
    <View>
      <Text style={kitStyles.copy}>
        Years of experience: {judicial.experienceYears ?? "not stated"}
      </Text>
      <Text style={kitStyles.copy}>
        Board certified:{" "}
        {judicial.boardCertified == null ? "not stated" : judicial.boardCertified ? "yes" : "no"}
      </Text>
      {judicial.barPoll ? (
        <Text style={kitStyles.copy}>
          Bar poll:{" "}
          {Object.entries(judicial.barPoll.summary)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · ")}
        </Text>
      ) : (
        <Text style={kitStyles.copy}>Bar poll: no data</Text>
      )}
    </View>
  );
}

export function contestKindNote(contest: Contest): string {
  return contest.partisan ? "Partisan race" : "Nonpartisan race";
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  group: { marginTop: 12 },
  miniHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  miniName: { fontFamily: fonts.display, color: colors.heading, fontSize: 22, lineHeight: 26 },
  miniSub: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14, lineHeight: 19 },
  flags: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, marginTop: 8 },
  alignBlock: { marginTop: 12 },
  issueLine: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  clarity: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  clarityLabel: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13, marginRight: 6 },
  seg: {
    width: 18,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  segOn: { backgroundColor: colors.line },
  dim: { marginTop: 14 },
});
