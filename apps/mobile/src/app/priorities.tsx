// E5 · What matters to you: a neutral reflection of the deck, with no score (UX.md §3.2).
import type { PolicyCard, Swipe } from "@ftb/types";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/art";
import { Enter } from "@/components/motion";
import { kitStyles } from "@/components/kit";
import {
  Banner,
  IconBox,
  Kicker,
  Note,
  PrimaryButton,
  SampleMark,
  Screen,
  Section,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { cards, demo, issueLabel } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { JUDICIAL_LABEL } from "@/labels";
import { anchorsDone, orderDeck } from "@/lib/deck";
import { cardIcon } from "@/deckCopy";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

const DECK = orderDeck(cards);

function topic(card: PolicyCard): string {
  if (card.kind === "pole") return issueLabel(card.issueId);
  if (card.kind === "judicial_pole") return JUDICIAL_LABEL[card.dimension];
  return "A tradeoff";
}

function sentence(card: PolicyCard, swipe: Swipe): string {
  if (card.kind === "tradeoff") {
    return swipe.chosen === "accept"
      ? `You said "${card.policy.toLowerCase()}" was worth ${card.cost.toLowerCase()}.`
      : `You said ${card.cost.toLowerCase()} was too high a cost for "${card.policy.toLowerCase()}". That doesn't mean you oppose the goal.`;
  }
  const pole = swipe.chosen === "a" ? card.poleA : card.poleB;
  return `You leaned toward: ${pole}`;
}

export default function Priorities() {
  const router = useRouter();
  const session = useSession();
  const gate = usePhaseGate(["explore", "walkthrough"]);
  if (gate) return gate;

  const swipes = session.state.swipes;
  const byId = new Map(swipes.map((swipe) => [swipe.cardId, swipe]));
  const answered = DECK.filter((card) => {
    const swipe = byId.get(card.id);
    return swipe && swipe.chosen !== "skip";
  });
  const starred = answered.filter((card) => byId.get(card.id)?.starred);
  const rest = answered.filter((card) => !byId.get(card.id)?.starred);
  const skipped = DECK.filter((card) => byId.get(card.id)?.chosen === "skip");
  const unanswered = DECK.filter((card) => !byId.has(card.id));
  const ready = anchorsDone(DECK, swipes);

  const walk = () => {
    session.finishExplore();
    router.replace("/ballot");
  };
  const change = (card?: PolicyCard) => {
    session.setDeckIndex(card ? DECK.indexOf(card) : 0);
    router.navigate("/explore");
  };

  const row = (card: PolicyCard, index: number) => {
    const swipe = byId.get(card.id);
    if (!swipe) return null;
    return (
      <Enter key={card.id} delay={80 + index * 60}>
        <View style={[styles.row, index > 0 && styles.divider]}>
          <IconBox icon={cardIcon(card)} />
          <View style={styles.text}>
            <Text style={styles.topic}>{topic(card)}</Text>
            <Text style={kitStyles.copy}>{sentence(card, swipe)}</Text>
          </View>
          {swipe.starred ? (
            <Icon name="star" size={20} strokeWidth={1.7} fill={colors.goldDeep} />
          ) : null}
        </View>
      </Enter>
    );
  };

  return (
    <Screen
      header={<TopBar onBack={() => router.back()} backLabel="Deck" />}
      footer={
        <>
          <PrimaryButton label="Walk my ballot" arrow disabled={!ready} onPress={walk} />
          <TextButton label="Change answers" icon="back" onPress={() => change()} />
        </>
      }
    >
      {demo ? <SampleMark /> : null}
      <Kicker>The deck so far</Kicker>
      <Title>What matters to you</Title>
      <Text style={styles.lead}>
        This is a reflection, not a score. It only shapes which evidence lines up with your answers.
      </Text>
      {!ready ? (
        <Banner
          tone="rose"
          title="A few anchor cards are left"
          body="Answer or skip the anchor cards before walking the ballot. The rest can wait."
        />
      ) : null}

      {starred.length > 0 ? (
        <Section title="Matters most to you" icon="star">
          <View style={styles.list}>{starred.map(row)}</View>
        </Section>
      ) : null}
      {rest.length > 0 ? (
        <Section title={starred.length > 0 ? "Also on your mind" : "Your answers"} icon="book">
          <View style={styles.list}>{rest.map(row)}</View>
        </Section>
      ) : null}
      {answered.length === 0 ? <Note>You haven&apos;t answered any cards yet.</Note> : null}

      {skipped.length > 0 ? (
        <Note>
          You skipped {skipped.length}. That&apos;s fine. Races on those issues will show evidence
          but no alignment.
        </Note>
      ) : null}
      {unanswered.length > 0 ? (
        <TextButton
          label={`${unanswered.length} card${unanswered.length === 1 ? "" : "s"} not answered yet`}
          icon="arrow"
          onPress={() => change(unanswered[0])}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.body, color: colors.ink, fontSize: 17, lineHeight: 24 },
  list: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1.5, borderTopColor: colors.lineSoft, borderStyle: "dashed" },
  text: { flex: 1, gap: 2 },
  topic: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
});
