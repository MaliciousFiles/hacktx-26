// U3 · Reveal ceremony: contest by contest in ballot order (UX.md §3.4). Masks are destroyed
// only after every /reveal call succeeds; on failure they stay on and a retry is offered.
import type { Mask } from "@ftb/types";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Enter, StampIn } from "@/components/motion";
import { MaskTile } from "@/components/kit";
import {
  Banner,
  GuideBubble,
  Kicker,
  Note,
  Ornament,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from "@/components/ui";
import { contests, orderedProfiles } from "@/data/release";
import { usePhaseGate, WALKING } from "@/gate";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

const STAGED = contests.filter((contest) => contest.candidateIds.length > 0);

export default function Reveal() {
  const router = useRouter();
  const session = useSession();
  // Keep the masks long enough to say "You knew them as …" after they're destroyed.
  const masksBefore = useRef<Record<string, Mask>>(session.masks);
  const started = useRef(false);
  const [status, setStatus] = useState<"loading" | "error" | "done">(
    session.state.phase === "revealed" ? "done" : "loading",
  );
  const [index, setIndex] = useState(0);
  const { reveal, ready } = session;
  const phase = session.state.phase;

  const run = useCallback(() => {
    setStatus("loading");
    reveal()
      .then(() => setStatus("done"))
      .catch(() => setStatus("error"));
  }, [reveal]);

  useEffect(() => {
    if (!ready || started.current || phase !== "walkthrough") return;
    started.current = true;
    if (Object.keys(masksBefore.current).length === 0) masksBefore.current = session.masks;
    run();
  }, [phase, ready, run, session.masks]);

  const gate = usePhaseGate(WALKING);
  if (gate) return gate;

  if (status !== "done") {
    return (
      <Screen
        footer={
          status === "error" ? (
            <>
              <PrimaryButton label="Try again" onPress={run} />
              <TextButton label="Back to My Ballot" onPress={() => router.replace("/ballot")} />
            </>
          ) : undefined
        }
      >
        <GuideBubble avatar>Masks off, everyone.</GuideBubble>
        <Ornament />
        {status === "loading" ? (
          <Note>Fetching who&apos;s who for {STAGED.length} contests…</Note>
        ) : (
          <Banner
            tone="rose"
            title="Needs a connection"
            body="We couldn't load every name, so your masks are still on. Nothing was lost."
          />
        )}
      </Screen>
    );
  }

  const contest = STAGED[index];
  const last = index >= STAGED.length - 1;
  if (!contest) return null;
  const pick = session.state.picks[contest.id];
  const profiles = orderedProfiles(contest, session.state.order[contest.id]);

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label={last ? "Surprised?" : "Next contest"}
            arrow
            onPress={() => (last ? router.replace("/unmask/surprised") : setIndex(index + 1))}
          />
          {!last ? (
            <TextButton
              label="Skip to the end"
              onPress={() => router.replace("/unmask/surprised")}
            />
          ) : null}
        </>
      }
    >
      {index === 0 ? <GuideBubble avatar>Masks off, everyone.</GuideBubble> : null}
      <Kicker>{`Contest ${index + 1} of ${STAGED.length}`}</Kicker>
      <Title>{contest.title}</Title>
      {pick?.kind === "undecided" || !pick ? (
        <Note>You hadn&apos;t decided. Here&apos;s who&apos;s who.</Note>
      ) : null}
      {profiles.map((profile, n) => {
        const identity = session.identityFor(profile.id);
        const mask = masksBefore.current[profile.id];
        const mine = pick?.kind === "candidate" && pick.candidateId === profile.id;
        const guess = session.state.guesses[profile.id];
        return (
          <Enter key={`${contest.id}-${profile.id}`} kind="deal" delay={150 + n * 350}>
            <View style={[styles.card, mine && styles.cardMine]}>
              {mine ? (
                <StampIn style={styles.ribbon}>
                  <Text style={styles.ribbonText}>Your pick</Text>
                </StampIn>
              ) : null}
              <View style={styles.row}>
                <MaskTile name={identity?.name} size={64} />
                <View style={styles.fill}>
                  <Text style={styles.was}>
                    {mask ? `You knew them as ${mask.character}` : "A masked character"}
                  </Text>
                  <Text style={styles.name}>{identity?.name ?? "Name unavailable"}</Text>
                  {contest.partisan ? (
                    <Text style={styles.party}>{identity?.party ?? "No party listed"}</Text>
                  ) : null}
                  {guess ? (
                    <Text style={styles.guess}>
                      You guessed: {guess === "unknown" ? "No idea" : guess}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </Enter>
        );
      })}
      <Note>Source links are unlocked on every screen now.</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    padding: 16,
    marginTop: 14,
  },
  cardMine: { boxShadow: shadows.chosen, backgroundColor: colors.goldSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  ribbon: {
    position: "absolute",
    top: -12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.line,
  },
  ribbonText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 15 },
  was: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14 },
  name: { fontFamily: fonts.display, color: colors.heading, fontSize: 26, lineHeight: 31 },
  party: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15 },
  guess: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 15, marginTop: 2 },
});
