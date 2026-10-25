import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HeroScene, Icon, PaperDots, type IconName } from "@/components/art";
import { Enter, PressableScale, PulseRing } from "@/components/motion";
import {
  GuideBubble,
  Note,
  Ornament,
  Panel,
  PrimaryButton,
  Rule,
  SampleMark,
  Screen,
  TextButton,
} from "@/components/ui";
import { ELECTION, electionPhase, localIsoDate, type ElectionPhase } from "@/election";
import { formatIsoDate } from "@/format";
import { useBallotData } from "@/ballotData";
import { DataConnection } from "@/components/DataConnection";
import { DailyGameEntry } from "@/components/WebFeatures";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

type ChapterState = "ready" | "underway" | "done" | "locked";

type Chapter = {
  numeral: string;
  icon: IconName;
  title: string;
  blurb: string;
  status: string;
  state: ChapterState;
  href: Href | null;
};

export default function Home() {
  const { data: demoBallot, sample, loading } = useBallotData();
  const router = useRouter();
  const session = useSession();
  const [missing, setMissing] = useState(false);
  const { release, ballot, cards } = demoBallot;

  const contestCount = ballot.contestIds.length;
  const answered = session.swipes.filter((swipe) => swipe.chosen !== "skip").length;
  const deckDone = session.started && session.deckIndex >= cards.length;
  const revealedIds = ballot.contestIds.filter((id) => session.revealed[id]);
  const firstRevealed = revealedIds[0];

  const open = (href: Href) => {
    if (!session.started && !session.begin()) return;
    router.navigate(href);
  };

  const chapters: Chapter[] = [
    {
      numeral: "I",
      icon: "book",
      title: "Explore your priorities",
      blurb: "Answer a few questions about issues that matter to you.",
      status: deckDone
        ? "Finished"
        : session.started
          ? `${answered} of ${cards.length} answered`
          : `${cards.length} questions · a few minutes`,
      state: deckDone ? "done" : session.started ? "underway" : "ready",
      href: "/explore",
    },
    {
      numeral: "II",
      icon: "scroll",
      title: "Compare the candidates",
      blurb: "Every contest on your ballot, with the evidence first.",
      status: `${contestCount} contests · none left out`,
      state: deckDone ? "underway" : "ready",
      href: "/ballot",
    },
    {
      numeral: "III",
      icon: "mask",
      title: "Reveal the names",
      blurb: "See candidate names and parties when you are ready.",
      status:
        revealedIds.length === contestCount
          ? "All names revealed"
          : `${revealedIds.length} of ${contestCount} contests revealed`,
      state:
        revealedIds.length === contestCount
          ? "done"
          : revealedIds.length > 0
            ? "underway"
            : "ready",
      href: "/ballot",
    },
    {
      numeral: "IV",
      icon: "envelope",
      title: "Share your progress",
      blurb: "Share how much you explored, without sharing your answers.",
      status: firstRevealed ? "Ready to share" : "Available after your first reveal",
      state: firstRevealed ? "ready" : "locked",
      href: firstRevealed ? { pathname: "/reveal/[id]", params: { id: firstRevealed } } : null,
    },
  ];

  const cta = !session.started
    ? { label: "Get started", href: "/explore" as Href }
    : !deckDone
      ? { label: "Continue the questions", href: "/explore" as Href }
      : { label: "Explore my ballot", href: "/ballot" as Href };

  return (
    <Screen
      footer={
        <PrimaryButton
          label={loading ? "Loading ballot…" : cta.label}
          disabled={loading}
          arrow
          onPress={() => open(cta.href)}
        />
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
            Wishing Well
          </Text>
        </Enter>
        <Rule delay={320} />
        <Enter delay={260}>
          <Text style={styles.coverLine}>Make a wish. Know your choice.</Text>
        </Enter>
        <SampleMark centered />
      </View>

      <Enter delay={340}>
        <Countdown phase={electionPhase(localIsoDate(new Date()))} />
      </Enter>

      <View style={styles.guide}>
        <GuideBubble avatar>
          {guideLine({
            started: session.started,
            answered,
            deckDone,
            revealed: revealedIds.length,
            contests: contestCount,
          })}
        </GuideBubble>
      </View>

      <Ornament />
      <Text style={styles.storyTitle}>How it works</Text>
      <View style={styles.chapters}>
        <View style={styles.trail} />
        {chapters.map((chapter, index) => (
          <Enter key={chapter.numeral} kind="deal" delay={380 + index * 110}>
            <ChapterCard
              chapter={chapter}
              onPress={chapter.href ? () => open(chapter.href as Href) : undefined}
            />
          </Enter>
        ))}
      </View>

      <View style={styles.sectionHead}>
        <Icon name="house" size={18} />
        <Text style={styles.sectionLabel}>Ballot style on this phone</Text>
      </View>
      <Panel>
        <View style={styles.styleRow}>
          <Text style={styles.styleTitle}>
            {sample ? "Sample style A" : "Your connected ballot"}
          </Text>
          <View style={styles.styleTag}>
            <Text style={styles.styleTagText}>{ballot.ballotStyleId}</Text>
          </View>
        </View>
        <Text style={styles.styleBody}>
          {sample
            ? "A fictional council race, a court, and a proposition. Try the full experience in a few minutes."
            : `${contestCount} contests · release ${release.id}. Confirm this style matches your official ballot before you begin.`}
        </Text>
      </Panel>
      <DataConnection />
      <TextButton
        label="My ballot style is not listed"
        icon="info"
        onPress={() => setMissing((value) => !value)}
      />
      {missing ? (
        <Note>
          This build will not guess a style from your address. If the official style is missing,
          stop and confirm it. The sample is only for previewing the app.
        </Note>
      ) : null}

      <DailyGameEntry />
      <View style={styles.links}>
        <TextButton
          label="Our sources and methods"
          icon="book"
          onPress={() => router.navigate("/how-it-works")}
        />
        {session.started ? (
          <TextButton
            label="Start over"
            icon="back"
            onPress={() => {
              session.reset();
              setMissing(false);
            }}
          />
        ) : null}
      </View>

      {session.maskError ? <Note>{session.maskError}</Note> : null}
      <Note>
        Wishing Well does not endorse candidates or measures. Release {release.id} · as of{" "}
        {formatIsoDate(release.asOfDate)}. Nothing about an address leaves the phone, and this app
        never asks for one.
      </Note>
    </Screen>
  );
}

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

function guideLine(progress: {
  started: boolean;
  answered: number;
  deckDone: boolean;
  revealed: number;
  contests: number;
}): string {
  if (!progress.started) {
    return "You'll start with a few questions about your priorities. We do the research, then you compare candidates’ plans and records before revealing their names and parties. In the end, you decide who to support.";
  }
  if (!progress.deckDone) {
    return progress.answered === 0
      ? "Choose the option closest to your view. You can skip any question. Star the issues that matter most to you."
      : `You have answered ${progress.answered} questions. Continue where you left off, or open your ballot to read the evidence.`;
  }
  if (progress.revealed === 0) {
    return "You have finished the questions. Open a contest on your ballot to compare the evidence. Candidate names stay hidden until you choose to reveal them.";
  }
  if (progress.revealed < progress.contests) {
    return `You have revealed ${progress.revealed} of ${progress.contests} contests. Keep exploring to compare the remaining candidates and ballot measures.`;
  }
  return "All names are now visible. You can revisit the evidence or share your progress. Your answers are not included in the shared summary.";
}

function ChapterCard({ chapter, onPress }: { chapter: Chapter; onPress?: () => void }) {
  const locked = chapter.state === "locked";
  const done = chapter.state === "done";
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Step ${chapter.numeral}, ${chapter.title}. ${chapter.status}`}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      depth={0.98}
      style={[styles.chapter, locked && styles.chapterLocked]}
    >
      <View style={styles.sealColumn}>
        <View style={[styles.chapterSeal, done && styles.chapterSealDone]}>
          <Icon name={locked ? "lock" : done ? "check" : chapter.icon} size={22} strokeWidth={2} />
        </View>
        <Text style={styles.numeral}>{chapter.numeral}</Text>
      </View>
      <View style={styles.chapterText}>
        <Text style={styles.chapterTitle}>{chapter.title}</Text>
        <Text style={styles.chapterBlurb}>{chapter.blurb}</Text>
        <View
          style={[
            styles.statusPill,
            chapter.state === "underway" && styles.statusUnderway,
            done && styles.statusDone,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              chapter.state === "underway" && styles.statusDotUnderway,
              done && styles.statusDotDone,
            ]}
          />
          <Text style={styles.status}>{chapter.status}</Text>
        </View>
      </View>
      {locked ? null : (
        <View style={styles.chevron}>
          <Icon name="chevron" size={18} strokeWidth={2.4} />
        </View>
      )}
    </PressableScale>
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
  chapterLocked: { opacity: 0.62, boxShadow: "none", borderStyle: "dashed" },
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
  chapterSealDone: { backgroundColor: colors.gold },
  numeral: { fontFamily: fonts.display, color: colors.line, fontSize: 13 },
  chapterText: { flex: 1, gap: 3 },
  chapterTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20, lineHeight: 23 },
  chapterBlurb: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(122,59,59,0.07)",
  },
  statusUnderway: { backgroundColor: "rgba(194,64,74,0.12)" },
  statusDone: { backgroundColor: "rgba(226,169,58,0.25)" },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  statusDotUnderway: { backgroundColor: colors.rose },
  statusDotDone: { backgroundColor: colors.goldDeep },
  status: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 13 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cream,
    borderWidth: 1.5,
    borderColor: colors.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 30 },
  sectionLabel: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  styleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  styleTitle: { fontFamily: fonts.display, color: colors.heading, fontSize: 24 },
  styleTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.lineSoft,
    backgroundColor: colors.cream,
  },
  styleTagText: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 12 },
  styleBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  daily: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 22,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.lineSoft,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(252,243,225,0.4)",
  },
  dailyText: { flex: 1, gap: 3 },
  dailyKicker: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
  dailyBody: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 15, lineHeight: 20 },
  links: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
});
