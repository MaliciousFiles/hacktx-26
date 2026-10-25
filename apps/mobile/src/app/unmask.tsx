import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { CandidateIdentity, ID } from "@ftb/types";
import { useBallotData } from "@/ballotData";
import { GodmotherArt, SparkleArt } from "@/components/art";
import { Chip, ChipRow } from "@/components/cardKit";
import { Enter, useReducedMotion } from "@/components/motion";
import { Portrait } from "@/components/Portrait";
import {
  Body,
  GuideBubble,
  Kicker,
  Note,
  Ornament,
  PrimaryButton,
  SampleMark,
  Screen,
  Title,
  TopBar,
} from "@/components/ui";
import { isDecided } from "@/lib/picks";
import { surpriseStats } from "@/lib/surprise";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

const native = Platform.OS !== "web";
const CEREMONY_MS = 2600;
const SPARKLES = [
  { left: "8%", top: "12%", delay: 0.38 },
  { left: "78%", top: "8%", delay: 0.44 },
  { left: "20%", top: "58%", delay: 0.5 },
  { left: "86%", top: "52%", delay: 0.42 },
  { left: "46%", top: "2%", delay: 0.48 },
  { left: "62%", top: "70%", delay: 0.54 },
  { left: "4%", top: "36%", delay: 0.56 },
  { left: "92%", top: "30%", delay: 0.6 },
] as const;

type Phase = "ready" | "casting" | "done";

export default function Unmask() {
  const { data, contestById, identityFor } = useBallotData();
  const session = useSession();
  const router = useRouter();
  const reduced = useReducedMotion();
  const allRevealed =
    data.ballot.contestIds.length > 0 &&
    data.ballot.contestIds.every((id) => session.revealed[id] === true);
  const [phase, setPhase] = useState<Phase>(allRevealed ? "done" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  if (!session.started) return <Redirect href="/" />;

  const contests = data.ballot.contestIds.flatMap((id) => {
    const contest = contestById(id);
    return contest ? [contest] : [];
  });
  const maskFor = (id: ID) => session.masks?.map[id] ?? session.openedMasks[id];
  const costumes = contests.flatMap((contest) => {
    const pick = session.picks[contest.id];
    const mask = pick?.kind === "candidate" ? maskFor(pick.candidateId) : undefined;
    return mask ? [{ id: contest.id, character: mask.character }] : [];
  });

  const cast = async () => {
    if (phase !== "ready") return;
    setError(null);
    setPhase("casting");
    progress.setValue(0);
    const animation = reduced
      ? Promise.resolve()
      : new Promise<void>((resolve) =>
          Animated.timing(progress, {
            toValue: 1,
            duration: CEREMONY_MS,
            easing: Easing.linear,
            useNativeDriver: native,
          }).start(() => resolve()),
        );
    try {
      await Promise.all([session.revealAll(), animation]);
      setPhase("done");
    } catch (cause) {
      progress.setValue(0);
      setError(
        cause instanceof Error
          ? cause.message
          : "The names could not be loaded. Check your connection and try again.",
      );
      setPhase("ready");
    }
  };

  return (
    <Screen
      header={
        phase === "casting" ? undefined : (
          <TopBar
            onBack={() => router.navigate(phase === "done" ? "/ballot" : "/share")}
            backLabel={phase === "done" ? "Ballot" : "My ballot"}
          />
        )
      }
      footer={
        phase === "ready" ? (
          <>
            {error ? <Note>{error}</Note> : null}
            <PrimaryButton label="Wave the wand ✨" onPress={cast} />
          </>
        ) : phase === "done" ? (
          <PrimaryButton
            label="Back to the ballot"
            arrow
            onPress={() => router.navigate("/ballot")}
          />
        ) : undefined
      }
    >
      <SampleMark />
      {phase === "done" ? (
        <TrueBallot contests={contests} identityFor={identityFor} maskFor={maskFor} />
      ) : (
        <>
          <Kicker>The unmasking</Kicker>
          <Title>{phase === "casting" ? "Bibbidi… bobbidi…" : "Masks off, everyone."}</Title>
          {phase === "ready" ? (
            <Body>
              Your Fairy Godmother will turn every storybook character on your ballot into the real
              candidate. You cannot put the masks back on for this ballot.
            </Body>
          ) : null}
          <Stage progress={progress} costumes={costumes} casting={phase === "casting"} />
          {phase === "ready" ? (
            <GuideBubble avatar>
              {costumes.length > 0
                ? `Ready? I'll reveal who is behind all ${contests.length} races, including the ${costumes.length} you picked.`
                : `Ready? I'll reveal who is behind all ${contests.length} races.`}
            </GuideBubble>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** The Godmother, her wand, and your costumed picks about to poof. */
function Stage({
  progress,
  costumes,
  casting,
}: {
  progress: Animated.Value;
  costumes: { id: string; character: string }[];
  casting: boolean;
}) {
  const wand = progress.interpolate({
    inputRange: [0, 0.12, 0.26, 0.4, 0.54, 0.7, 1],
    outputRange: ["-30deg", "18deg", "-24deg", "20deg", "-14deg", "-4deg", "-4deg"],
  });
  const costumeOpacity = progress.interpolate({
    inputRange: [0, 0.56, 0.7, 1],
    outputRange: [1, 1, 0, 0],
  });
  const costumeScale = progress.interpolate({
    inputRange: [0, 0.56, 0.7, 1],
    outputRange: [1, 1.06, 0.7, 0.7],
  });
  const puffOpacity = progress.interpolate({
    inputRange: [0, 0.5, 0.6, 0.85, 1],
    outputRange: [0, 0, 0.95, 0, 0],
  });
  const puffScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.4, 2.4],
  });
  const flash = progress.interpolate({
    inputRange: [0, 0.54, 0.62, 0.8, 1],
    outputRange: [0, 0, 0.7, 0, 0],
  });

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.flash, { opacity: flash }]} pointerEvents="none" />

      <View style={styles.costumes}>
        <Animated.View
          style={[
            styles.costumeGrid,
            { opacity: costumeOpacity, transform: [{ scale: costumeScale }] },
          ]}
        >
          {costumes.length === 0 ? (
            <Text style={styles.noCostumes}>Every race is about to be unmasked.</Text>
          ) : (
            costumes
              .slice(0, 12)
              .map((costume) => (
                <Portrait key={costume.id} character={costume.character} size={50} />
              ))
          )}
        </Animated.View>
        {casting ? (
          <>
            {[0, 1, 2, 3, 4].map((index) => (
              <Animated.View
                key={index}
                pointerEvents="none"
                style={[
                  styles.puff,
                  {
                    left: `${10 + index * 18}%`,
                    top: index % 2 === 0 ? "10%" : "30%",
                    opacity: puffOpacity,
                    transform: [{ scale: puffScale }],
                  },
                ]}
              />
            ))}
          </>
        ) : null}
      </View>

      <View style={styles.fairy} pointerEvents="none">
        <GodmotherArt size={110} />
        <Animated.View style={[styles.wand, { transform: [{ rotate: wand }] }]}>
          <Wand />
        </Animated.View>
      </View>

      {casting
        ? SPARKLES.map((sparkle, index) => (
            <Animated.View
              key={index}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: sparkle.left,
                top: sparkle.top,
                opacity: progress.interpolate({
                  inputRange: [0, sparkle.delay, sparkle.delay + 0.1, sparkle.delay + 0.3, 1],
                  outputRange: [0, 0, 1, 0, 0],
                }),
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, sparkle.delay, sparkle.delay + 0.15, 1],
                      outputRange: [0.2, 0.2, 1.5, 0.4],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, sparkle.delay, 1],
                      outputRange: [0, 0, -26],
                    }),
                  },
                ],
              }}
            >
              <SparkleArt size={22} />
            </Animated.View>
          ))
        : null}
    </View>
  );
}

function Wand() {
  return (
    <Svg width={84} height={84} viewBox="0 0 84 84">
      <Path d="M8 78L56 30" stroke={colors.line} strokeWidth={7} strokeLinecap="round" />
      <Path d="M8 78L56 30" stroke="#C79A5E" strokeWidth={4} strokeLinecap="round" />
      <Path
        d="M62 10l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"
        fill={colors.gold}
        stroke={colors.line}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Circle cx={74} cy={8} r={2.2} fill={colors.gold} />
      <Circle cx={50} cy={6} r={1.6} fill={colors.gold} />
    </Svg>
  );
}

function TrueBallot({
  contests,
  identityFor,
  maskFor,
}: {
  contests: ReturnType<ReturnType<typeof useBallotData>["contestById"]>[];
  identityFor: (id: ID) => CandidateIdentity | undefined;
  maskFor: (id: ID) => { character: string; title: string } | undefined;
}) {
  const { orderedProfiles } = useBallotData();
  const session = useSession();
  const real = contests.flatMap((contest) => (contest ? [contest] : []));
  const identities: Record<ID, CandidateIdentity[]> = {};
  for (const contest of real) {
    identities[contest.id] = contest.candidateIds.flatMap((id) => {
      const identity = identityFor(id);
      return identity ? [identity] : [];
    });
  }
  const stats = surpriseStats(real, session.picks, identities);
  const picked = real.filter((contest) => isDecided(session.picks[contest.id])).length;

  return (
    <>
      <Enter kind="pop">
        <Kicker>Your true ballot</Kicker>
        <Title>Poof! Here is who is who.</Title>
        <Body>
          {picked > 0
            ? `You picked in ${picked} of ${real.length} races. Your picks are marked below, with the character you knew them as.`
            : `Here is who was behind the characters in all ${real.length} races.`}
        </Body>
      </Enter>

      {stats ? (
        <Enter kind="pop" delay={150}>
          <View style={styles.stats}>
            <Text style={styles.statsTitle}>Plot twist!</Text>
            <Text style={styles.statsLine}>
              Your picks came from {stats.partyCount}{" "}
              {stats.partyCount === 1 ? "party" : "different parties"}.
            </Text>
            <Text style={styles.statsLine}>
              In {stats.acrossAislePct}% of partisan races, your pick was not from the party you
              picked most often.
            </Text>
          </View>
        </Enter>
      ) : null}

      {real.map((contest, index) => {
        const pick = session.picks[contest.id];
        const profiles = orderedProfiles(contest, session.order[contest.id]);
        return (
          <Enter key={contest.id} kind="deal" delay={200 + Math.min(index, 8) * 90}>
            <View style={styles.contest}>
              <Text style={styles.contestTitle}>{contest.title}</Text>
              {pick?.kind === "measure" ? (
                <ChipRow>
                  <Chip
                    label={`You chose ${pick.choice === "yes" ? "For" : "Against"}`}
                    tone="forest"
                    icon="check"
                  />
                </ChipRow>
              ) : null}
              {pick && pick.kind !== "candidate" && pick.kind !== "measure" ? (
                <ChipRow>
                  <Chip
                    label={
                      pick.kind === "skip"
                        ? "You skipped this race"
                        : pick.kind === "write_in"
                          ? "You chose a write-in"
                          : "You hadn't decided"
                    }
                  />
                </ChipRow>
              ) : null}
              {profiles.map((profile) => {
                const identity = identityFor(profile.id);
                const mask = maskFor(profile.id);
                const mine = pick?.kind === "candidate" && pick.candidateId === profile.id;
                return (
                  <View key={profile.id} style={[styles.person, mine && styles.personMine]}>
                    {mask ? <Portrait character={mask.character} size={46} /> : null}
                    <View style={styles.personText}>
                      {mine ? <Text style={styles.mine}>YOUR PICK</Text> : null}
                      <Text style={styles.realName}>{identity?.name ?? "Name unavailable"}</Text>
                      {identity?.party ? <Text style={styles.party}>{identity.party}</Text> : null}
                      {mask ? (
                        <Text style={styles.was}>You knew them as {mask.character}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </Enter>
        );
      })}

      <Ornament />
      <Note>
        We never tell you how to vote. These were the same plans and records you read before the
        names.
      </Note>
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 330,
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    boxShadow: shadows.paper,
    overflow: "hidden",
  },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: colors.goldSoft },
  costumes: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    paddingBottom: 0,
  },
  costumeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  noCostumes: {
    fontFamily: fonts.displayItalic,
    color: colors.inkSoft,
    fontSize: 18,
    textAlign: "center",
  },
  puff: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#FFF9EE",
    borderWidth: 2,
    borderColor: colors.lineSoft,
  },
  fairy: { height: 120, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 },
  wand: {
    position: "absolute",
    bottom: 14,
    left: "50%",
    marginLeft: 22,
    transformOrigin: "10% 90%",
  },
  stats: {
    backgroundColor: colors.goldSoft,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    boxShadow: shadows.paper,
  },
  statsTitle: { fontFamily: fonts.display, color: colors.heading, fontSize: 24 },
  statsLine: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 4,
  },
  contest: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 12,
    boxShadow: shadows.paper,
    padding: 14,
    marginTop: 14,
  },
  contestTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19, lineHeight: 24 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
  },
  personMine: { backgroundColor: colors.forestSoft, borderWidth: 1.5, borderColor: colors.forest },
  personText: { flex: 1 },
  mine: { fontFamily: fonts.bold, color: colors.forest, fontSize: 11.5, letterSpacing: 1 },
  realName: { fontFamily: fonts.display, color: colors.heading, fontSize: 21, lineHeight: 25 },
  party: { fontFamily: fonts.bold, color: colors.line, fontSize: 14 },
  was: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 13.5 },
});
