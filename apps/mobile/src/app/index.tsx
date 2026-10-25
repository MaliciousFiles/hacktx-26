import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HeroScene, Icon, PaperDots, type IconName } from "@/components/art";
import { Enter, PulseRing } from "@/components/motion";
import {
  GuideBubble,
  Note,
  Ornament,
  PrimaryButton,
  Rule,
  SampleMark,
  Screen,
  TextButton,
} from "@/components/ui";
import { demo, release } from "@/data/release";
import { ELECTION, electionPhase, localIsoDate, type ElectionPhase } from "@/election";
import { formatIsoDate } from "@/format";
import { homeFor } from "@/gate";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

type Chapter = {
  numeral: string;
  icon: IconName;
  title: string;
  blurb: string;
};

export default function Home() {
  const router = useRouter();
  const session = useSession();
  if (!session.ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  // Returning voters open where they left off (UX.md §2).
  if (session.state.phase !== "onboarding") return <Redirect href={homeFor(session.state.phase)} />;

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label="Let's begin"
            arrow
            onPress={() => router.push("/onboarding/intro")}
          />
          <TextButton
            label="How it works"
            icon="book"
            onPress={() => router.push("/how-it-works")}
          />
        </>
      }
    >
      <Enter style={styles.plate}>
        <PaperDots />
        <HeroScene />
      </Enter>

      <View style={styles.cover}>
        <Enter delay={120}>
          <Text style={styles.coverKicker}>
            Travis County · {formatIsoDate(ELECTION.electionDay)}
          </Text>
        </Enter>
        <Enter delay={180}>
          <Text accessibilityRole="header" style={styles.coverTitle}>
            Pick the plan before the party.
          </Text>
        </Enter>
        <Rule delay={320} />
        <Enter delay={260}>
          <Text style={styles.coverLine}>
            Explore what matters to you, then meet every choice on your real ballot, masked.
          </Text>
        </Enter>
        {demo ? <SampleMark centered /> : null}
      </View>

      <Enter delay={340}>
        <Countdown phase={electionPhase(localIsoDate(new Date()))} />
      </Enter>

      <View style={styles.guide}>
        <GuideBubble avatar>
          I keep the names in my pocket until you have read the evidence. We never tell you how to
          vote.
        </GuideBubble>
      </View>

      <Ornament />
      <Text style={styles.storyTitle}>Your Story</Text>
      <View style={styles.chapters}>
        <View style={styles.trail} />
        {CHAPTERS.map((chapter, index) => (
          <Enter key={chapter.numeral} kind="deal" delay={380 + index * 110}>
            <ChapterCard chapter={chapter} />
          </Enter>
        ))}
      </View>

      <Note>
        Fairy Tale Ballot does not endorse candidates or measures. Release {release.id} · as of{" "}
        {formatIsoDate(release.asOfDate)}.
      </Note>
    </Screen>
  );
}

const CHAPTERS: Chapter[] = [
  {
    numeral: "I",
    icon: "book",
    title: "The Choosing Deck",
    blurb: "Pick between two ideas, or decide whether something is worth its cost.",
  },
  {
    numeral: "II",
    icon: "scroll",
    title: "The Ballot Walk",
    blurb: "Every contest on your ballot, with plans and records before names.",
  },
  {
    numeral: "III",
    icon: "mask",
    title: "The Unmasking",
    blurb: "One big reveal at the end shows who's who.",
  },
  {
    numeral: "IV",
    icon: "envelope",
    title: "The Share Card",
    blurb: "Pass along your surprise, with no picks or names on it.",
  },
];

/** Scalloped wax seal, drawn once and reused behind the countdown figure. */
function WaxSeal({ size }: { size: number }) {
  const lobes = 14;
  const outer = 30;
  const inner = 27;
  const points = Array.from({ length: lobes }, (_, index) => {
    const a0 = (index / lobes) * Math.PI * 2;
    const a1 = ((index + 0.5) / lobes) * Math.PI * 2;
    const a2 = ((index + 1) / lobes) * Math.PI * 2;
    const p = (a: number, r: number) => `${32 + Math.cos(a) * r} ${32 + Math.sin(a) * r}`;
    return `${index === 0 ? `M${p(a0, inner)}` : ""}Q${p(a1, outer + 3)} ${p(a2, inner)}`;
  }).join("");
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
      <Path d={`${points}z`} fill={colors.rose} stroke={colors.line} strokeWidth={2} />
      <Path
        d="M32 10a22 22 0 1 0 0.01 0z"
        fill="none"
        stroke="rgba(252,243,225,0.55)"
        strokeWidth={1.4}
        strokeDasharray="2 3"
      />
    </Svg>
  );
}

function Countdown({ phase }: { phase: ElectionPhase }) {
  const { figure, caption, detail } = countdownCopy(phase);
  const numeric = /^\d+$/.test(figure);
  return (
    <View
      style={styles.countdown}
      accessible
      accessibilityLabel={`${numeric ? figure : ""} ${caption}. ${detail}`}
    >
      <PaperDots color="rgba(196,110,88,0.10)" />
      <View style={styles.sealWrap}>
        <PulseRing size={52} color="rgba(194,64,74,0.35)" />
        <View style={styles.seal}>
          <WaxSeal size={66} />
          {numeric ? (
            <Text style={styles.sealNumber}>{figure}</Text>
          ) : (
            <Icon name={figure as IconName} size={26} color={colors.cream} fill={colors.gold} />
          )}
        </View>
      </View>
      <View style={styles.countdownText}>
        <Text style={styles.countdownCaption}>{caption}</Text>
        <Text style={styles.countdownDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function countdownCopy(phase: ElectionPhase): { figure: string; caption: string; detail: string } {
  const window = `Early voting runs ${formatIsoDate(ELECTION.earlyVotingStart).replace(", 2026", "")} to ${formatIsoDate(ELECTION.earlyVotingEnd).replace(", 2026", "")}.`;
  switch (phase.kind) {
    case "before_early":
      return {
        figure: String(phase.daysToEarly),
        caption: phase.daysToEarly === 1 ? "day until early voting" : "days until early voting",
        detail: `${window} Election Day is Tuesday, November 3.`,
      };
    case "early_voting":
      return phase.daysLeftInEarly === 0
        ? {
            figure: "sparkle",
            caption: "Last day of early voting",
            detail: "After today, the next chance is Election Day, Tuesday, November 3.",
          }
        : {
            // Count today: the window is open through the last day.
            figure: String(phase.daysLeftInEarly + 1),
            caption: "days of early voting left",
            detail: `Counting today, through ${formatIsoDate(ELECTION.earlyVotingEnd).replace(", 2026", "")}. Election Day is in ${phase.daysToElection} days.`,
          };
    case "between":
      return {
        figure: String(phase.daysToElection),
        caption: phase.daysToElection === 1 ? "day until Election Day" : "days until Election Day",
        detail: "Early voting has closed. Polls open Tuesday, November 3.",
      };
    case "election_day":
      return {
        figure: "star",
        caption: "Today is Election Day",
        detail: "Check your polling place with the Travis County Clerk before you go.",
      };
    case "after":
      return {
        figure: "check",
        caption: "This election has passed",
        detail: "The sample stays here for reading.",
      };
  }
}

function ChapterCard({ chapter }: { chapter: Chapter }) {
  return (
    <View
      accessible
      accessibilityLabel={`Chapter ${chapter.numeral}, ${chapter.title}. ${chapter.blurb}`}
      style={styles.chapter}
    >
      <View style={styles.sealColumn}>
        <View style={styles.chapterSeal}>
          <Icon name={chapter.icon} size={22} strokeWidth={2} />
        </View>
        <Text style={styles.numeral}>{chapter.numeral}</Text>
      </View>
      <View style={styles.chapterText}>
        <Text style={styles.chapterTitle}>{chapter.title}</Text>
        <Text style={styles.chapterBlurb}>{chapter.blurb}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.page,
    boxShadow: `inset 0 0 0 3px ${colors.page}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
  },
  cover: { alignItems: "center", gap: 8, marginTop: 18, marginBottom: 14 },
  coverKicker: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  coverTitle: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 44,
    lineHeight: 50,
    textAlign: "center",
  },
  coverLine: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 6,
  },
  countdown: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
    padding: 12,
  },
  sealWrap: { width: 66, height: 66, alignItems: "center", justifyContent: "center" },
  seal: { width: 66, height: 66, alignItems: "center", justifyContent: "center" },
  sealNumber: { fontFamily: fonts.display, color: colors.cream, fontSize: 30, marginTop: -3 },
  countdownText: { flex: 1, gap: 3 },
  countdownCaption: {
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 20,
    lineHeight: 23,
  },
  countdownDetail: { fontFamily: fonts.body, color: colors.ink, fontSize: 14, lineHeight: 19 },
  guide: { marginTop: 18 },
  storyTitle: {
    fontFamily: fonts.smallCaps,
    color: colors.line,
    fontSize: 24,
    textAlign: "center",
    marginTop: -6,
  },
  chapters: { gap: 14, marginTop: 14 },
  trail: {
    position: "absolute",
    left: 35,
    top: 30,
    bottom: 30,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.lineSoft,
  },
  chapter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: `inset 0 0 0 3px ${colors.card}, inset 0 0 0 4px ${colors.lineSoft}, 0 3px 0 ${colors.bevel}`,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 10,
  },
  sealColumn: { alignItems: "center", gap: 3 },
  chapterSeal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.line,
    boxShadow: `inset 0 0 0 2px ${colors.cream}, inset 0 0 0 3px ${colors.lineSoft}, 0 2px 0 ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  numeral: { fontFamily: fonts.display, color: colors.line, fontSize: 13 },
  chapterText: { flex: 1, gap: 3 },
  chapterTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20, lineHeight: 23 },
  chapterBlurb: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
});
