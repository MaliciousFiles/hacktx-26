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
import { contestById, demoBallot, identityFor, issueById } from "@/fixtures/travisDemo";
import { useSession } from "@/session";
import { colors, serif } from "@/theme";

export default function RevealScreen() {
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
        <Title>That contest is not in this sample.</Title>
      </Screen>
    );
  }

  const message = shareMessage(session.swipes);

  return (
    <Screen
      footer={
        <PrimaryButton
          label="Share the card"
          onPress={() => {
            Share.share({ message }).catch(() => {
              setShareNote(
                "Sharing is not available in this window. The card above is the whole message.",
              );
            });
          }}
        />
      }
    >
      <TopBar
        onBack={() => router.navigate({ pathname: "/contest/[id]", params: { id: contest.id } })}
        backLabel="Evidence"
      />
      <SampleMark />
      <Kicker>{contest.title}</Kicker>
      <Title>The mask is off.</Title>
      <Body>The evidence did not change. Whether the names surprise you is yours to sit with.</Body>
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
        <Text style={styles.cardKicker}>My Fairy Tale Ballot</Text>
        <Text style={styles.cardLine}>{message}</Text>
      </Panel>
      {shareNote ? <Note>{shareNote}</Note> : null}
      <Note>This card leaves the names off, even after the reveal.</Note>
    </Screen>
  );
}

function shareMessage(swipes: { cardId: string; starred: boolean; kind: string }[]): string {
  const starred = swipes.filter((swipe) => swipe.starred);
  const labels = starred.map((swipe) => {
    const card = demoBallot.cards.find((item) => item.id === swipe.cardId);
    if (!card) return "a card";
    if (card.kind === "pole") return issueById(card.issueId)?.label ?? "an issue";
    if (card.kind === "tradeoff") return "a tradeoff";
    return "a judicial question";
  });
  const unique = [...new Set(labels)];
  const marked =
    unique.length > 0 ? `Marked as mine to weigh: ${unique.join(", ")}.` : "I did not star a card.";
  return [
    "My Fairy Tale Ballot",
    "I looked at the plans before the names.",
    marked,
    "Names are not on this card.",
    "Sample release — not a live ballot.",
  ].join("\n");
}

const styles = StyleSheet.create({
  was: { color: colors.inkSoft, fontSize: 14, lineHeight: 20 },
  name: { fontFamily: serif, color: colors.ink, fontSize: 28, lineHeight: 34, marginTop: 4 },
  party: { color: colors.ink, fontSize: 16, marginTop: 4 },
  cardKicker: { fontFamily: serif, color: colors.forest, fontSize: 18, marginBottom: 8 },
  cardLine: { color: colors.ink, fontSize: 16, lineHeight: 24 },
});
