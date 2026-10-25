import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text } from "react-native";
import {
  Body,
  Kicker,
  Note,
  Ornament,
  Panel,
  PrimaryButton,
  SampleMark,
  Screen,
  Title,
  TopBar,
} from "@/components/ui";
import { useBallotData } from "@/ballotData";
import { useSession } from "@/session";
import { WebFeatureButton } from "@/components/WebFeatures";
import { webLink } from "@/lib/webLinks";
import { colors, fonts } from "@/theme";

export default function RevealScreen() {
  const { sample, contestById, identityFor } = useBallotData();
  const session = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [shareNote, setShareNote] = useState<string | null>(null);
  if (!session.started) return <Redirect href="/" />;

  const contest = id ? contestById(id) : undefined;
  if (!contest) {
    return (
      <Screen>
        <SampleMark />
        <Title>That contest is not in this release.</Title>
      </Screen>
    );
  }

  if (!session.revealed[contest.id])
    return <Redirect href={{ pathname: "/contest/[id]", params: { id: contest.id } }} />;
  const message = `My Wishing Well journey\nI read the plans before the names.\n${session.swipes.filter((swipe) => swipe.chosen !== "skip").length} questions explored · ${Object.keys(session.revealed).length} contests unmasked.\n${sample ? "Fictional sample ballot." : "Explore the evidence. Make your own choice."}`;

  return (
    <Screen
      footer={
        <PrimaryButton
          label="Share text invitation"
          onPress={() => {
            let invitation = message;
            try {
              if (process.env.EXPO_PUBLIC_WEB_URL) invitation += `\nMake a wish. Know your choice.\n${webLink(process.env.EXPO_PUBLIC_WEB_URL, "invite", { questions: session.swipes.filter((swipe) => swipe.chosen !== "skip").length, contests: Object.keys(session.revealed).length, sample })}`;
            } catch { setShareNote("The website address is invalid. Sharing the text summary instead."); }
            Share.share({ message: invitation }).catch(() => {
              setShareNote(
                "Sharing is not available in this window. The card above is the whole message.",
              );
            });
          }}
        />
      }
      header={
        <TopBar
          onBack={() => router.navigate({ pathname: "/contest/[id]", params: { id: contest.id } })}
          backLabel="Evidence"
        />
      }
    >
      <SampleMark />
      <Kicker>{contest.title}</Kicker>
      <Title>{sample ? "The names behind the masks." : "Same ideas. Real names."}</Title>
      <Body>
        These are the candidates behind the character names. Their plans and records are the same
        ones you just read.
      </Body>
      {contest.candidateIds.map((candidateId) => {
        const mask = session.openedMasks[candidateId];
        const identity = identityFor(candidateId);
        return (
          <Panel key={candidateId}>
            <Text style={styles.was}>
              {mask ? `You knew them as ${mask.character}` : "A character from this session"}
            </Text>
            <Text style={styles.name}>{identity?.name ?? "Name unavailable"}</Text>
            {identity?.party ? <Text style={styles.party}>{identity.party}</Text> : null}
          </Panel>
        );
      })}
      <Ornament />
      <Panel>
        <Text style={styles.cardKicker}>My Wishing Well journey</Text>
        <Text style={styles.cardLine}>{message}</Text>
      </Panel>
      {shareNote ? <Note>{shareNote}</Note> : null}
      <Note>Your shared summary includes counts only. Names, answers and picks stay off it.</Note>
      <WebFeatureButton page="invite" counts={{ questions: session.swipes.filter((swipe) => swipe.chosen !== "skip").length, contests: Object.keys(session.revealed).length, sample }} />
      <PrimaryButton label="Continue the ballot" arrow onPress={() => router.navigate("/ballot")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  was: { fontFamily: fonts.body, color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  name: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 30,
    lineHeight: 34,
    marginTop: 4,
  },
  party: { fontFamily: fonts.bold, color: colors.line, fontSize: 16, marginTop: 4 },
  cardKicker: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19, marginBottom: 8 },
  cardLine: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 24 },
});
