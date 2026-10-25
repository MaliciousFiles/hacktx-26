// E2–E4 · The Explore deck: a stack of cards swiped off one at a time (UX.md §3.2). The stack's
// thickness is the number of cards left. Nothing scrolls except the open "More info" on a card.
import type { PolicyCard } from "@ftb/types";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, PageScene, PaperDots } from "@/components/art";
import { SwipeCard } from "@/components/SwipeCard";
import { GuideBubble, GuideTile, Kicker, SampleMark, Screen, Tile } from "@/components/ui";
import { cards as releaseCards, demo } from "@/data/release";
import { cardDetail, cardIcon, cardTitle } from "@/deckCopy";
import { usePhaseGate } from "@/gate";
import {
  orderDeck,
  statementFor,
  swipeFor,
  swipeForVerdict,
  verdictOf,
  type Verdict,
} from "@/lib/deck";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

const DECK = orderDeck(releaseCards);
/** The Fairy Godmother's tip steps aside on its own after this long. */
const GUIDE_MS = 10_000;
/** A full deck is at most this thick (pt), so long decks still fit. */
const MAX_DEPTH = 48;
const MAX_STEP = 6;
const MIN_STEP = 2;

export default function Explore() {
  const session = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState(true);

  const deckIndex = Math.min(session.state.deckIndex, DECK.length - 1);
  const card = DECK[deckIndex];
  const firstJudicial = card?.deck === "judicial" && DECK[deckIndex - 1]?.deck !== "judicial";

  // Bring the tip back once when the judicial cards start: they need a word of explanation.
  useEffect(() => {
    if (firstJudicial) setGuide(true);
  }, [firstJudicial]);
  useEffect(() => {
    if (!guide) return;
    const timer = setTimeout(() => setGuide(false), GUIDE_MS);
    return () => clearTimeout(timer);
  }, [guide, card?.id]);

  const gate = usePhaseGate(["explore", "walkthrough"]);
  if (gate) return gate;
  if (!card) return null;

  const swipe = session.state.swipes.find((item) => item.cardId === card.id);
  const flipped = session.state.flips[card.id] === true;
  const starred = session.starred(card.id);
  const labels =
    card.kind === "tradeoff"
      ? { agree: "Worth it", disagree: "Not worth it" }
      : { agree: "Agree", disagree: "Disagree" };

  // Stack geometry: one paper edge per card still under the top one.
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, MAX_DEPTH / Math.max(DECK.length - 1, 1)));
  const fullDepth = (DECK.length - 1) * step;
  const below = DECK.length - 1 - deckIndex;

  const next = () => {
    if (deckIndex >= DECK.length - 1) router.push("/priorities");
    else session.setDeckIndex(deckIndex + 1);
  };
  const decide = (verdict: Verdict) => {
    setGuide(false);
    session.answer(swipeForVerdict(card, flipped, verdict, starred));
    next();
  };
  const back = () => {
    if (deckIndex > 0) session.setDeckIndex(deckIndex - 1);
  };
  const skip = () => {
    // A skip is recorded as missing, never as neutral.
    session.answer(swipeFor(card, "skip", starred));
    next();
  };

  return (
    <Screen
      scroll={false}
      footer={
        <View style={styles.hints} aria-hidden>
          <Text style={styles.hint}>← {labels.disagree}</Text>
          <Text style={styles.hint}>{labels.agree} →</Text>
        </View>
      }
      tray={
        <>
          <Tile label="back" icon="back" onPress={back} accessibilityLabel="Previous card" />
          <Tile label="skip" icon="skip" onPress={skip} accessibilityLabel="Skip this card" />
          <Tile
            label="matters"
            icon="star"
            on={starred}
            onPress={() => session.toggleStar(card.id)}
            accessibilityLabel={starred ? "Marked as matters to me" : "Mark as matters to me"}
          />
          <Tile
            label="so far"
            icon="book"
            onPress={() => router.push("/priorities")}
            accessibilityLabel="What matters to you so far"
          />
          <GuideTile on={guide} onPress={() => setGuide((value) => !value)} />
        </>
      }
    >
      <View style={styles.area}>
        <View style={[styles.stack, { marginBottom: fullDepth }]}>
          {Array.from({ length: below }, (_, i) => below - i).map((depth) => {
            const under = DECK[deckIndex + depth];
            return (
              <View
                key={depth}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.layer,
                  {
                    top: depth * step,
                    bottom: -depth * step,
                    // Real paper never stacks perfectly square.
                    transform: [{ translateX: depth % 2 === 0 ? 1.5 : -1.5 }],
                  },
                ]}
              >
                {/* The next card is face up under the top one, so a swipe reveals it. */}
                {depth === 1 && under ? (
                  <CardPreview card={under} flipped={session.state.flips[under.id] === true} />
                ) : null}
              </View>
            );
          })}
          <TopCard
            key={card.id}
            card={card}
            flipped={flipped}
            previous={verdictOf(card, flipped, swipe)}
            labels={labels}
            left={below + 1}
            onSwipe={decide}
          />
        </View>
        {guide ? (
          <View style={styles.bubble} pointerEvents="none">
            <GuideBubble key={card.id}>{guideLine(card, firstJudicial)}</GuideBubble>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function TopCard({
  card,
  flipped,
  previous,
  labels,
  left,
  onSwipe,
}: {
  card: PolicyCard;
  flipped: boolean;
  previous: Verdict | "skip" | null;
  labels: { agree: string; disagree: string };
  left: number;
  onSwipe: (verdict: Verdict) => void;
}) {
  const [more, setMore] = useState(false);
  const [dragging, setDragging] = useState(false);
  const detail = cardDetail(card, flipped);
  const statement = statementFor(card, flipped);
  const kicker =
    card.kind === "tradeoff"
      ? "A tradeoff"
      : card.kind === "judicial_pole"
        ? "Judicial"
        : card.anchor
          ? "Anchor question"
          : "On your ballot";

  return (
    <SwipeCard
      style={StyleSheet.absoluteFill}
      onSwipe={onSwipe}
      onDragging={setDragging}
      agreeLabel={labels.agree}
      disagreeLabel={labels.disagree}
      accessibilityLabel={`${cardTitle(card)}. ${
        card.kind === "tradeoff" ? `${card.policy}, at the cost of ${card.cost}` : statement
      }. ${left} ${left === 1 ? "card" : "cards"} left.`}
    >
      <View style={styles.art}>
        <PaperDots />
        <PageScene time={flipped ? "dusk" : "day"} />
        {demo ? (
          <View style={styles.sample}>
            <SampleMark />
          </View>
        ) : null}
        {previous && previous !== "skip" ? (
          <View style={styles.answered}>
            <Icon name="check" size={13} strokeWidth={3} />
            <Text style={styles.answeredText}>
              You said: {previous === "agree" ? labels.agree : labels.disagree}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topic}>
          <Icon name={cardIcon(card)} size={16} strokeWidth={2.2} />
          <Text style={styles.topicText}>
            {cardTitle(card)} · {kicker}
          </Text>
        </View>

        {card.kind === "tradeoff" ? (
          <>
            <Kicker>The goal</Kicker>
            <Text style={styles.tradeoffText}>{card.policy}</Text>
            <View style={styles.costRow}>
              <View style={styles.costLine} />
              <Text style={styles.costLabel}>at the cost of</Text>
              <View style={styles.costLine} />
            </View>
            <Text style={styles.tradeoffText}>{card.cost}</Text>
            <Text style={styles.footnote}>
              Saying &quot;not worth it&quot; doesn&apos;t mean you oppose the goal.
            </Text>
          </>
        ) : (
          <Text style={styles.statement}>{statement}</Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((value) => !value)}
          hitSlop={8}
          style={styles.moreToggle}
        >
          <Text style={styles.moreLabel}>{more ? "Less info" : "More info"}</Text>
          <View style={{ transform: [{ rotate: more ? "-90deg" : "90deg" }] }}>
            <Icon name="chevron" size={14} strokeWidth={2.6} />
          </View>
        </Pressable>
        {more ? (
          <View style={styles.more}>
            {detail.about.map((line) => (
              <Text key={line} style={styles.moreText}>
                {line}
              </Text>
            ))}
            <Text style={styles.moreRecord}>{detail.agree}</Text>
            <Text style={styles.moreRecord}>{detail.disagree}</Text>
            <Text style={styles.moreNote}>{detail.note}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SwipeCard>
  );
}

function CardPreview({ card, flipped }: { card: PolicyCard; flipped: boolean }) {
  return (
    <>
      <View style={styles.art}>
        <PaperDots />
        <PageScene time={flipped ? "dusk" : "day"} />
      </View>
      <View style={styles.bodyContent}>
        <View style={styles.topic}>
          <Icon name={cardIcon(card)} size={16} strokeWidth={2.2} />
          <Text style={styles.topicText}>{cardTitle(card)}</Text>
        </View>
        <Text style={card.kind === "tradeoff" ? styles.tradeoffText : styles.statement}>
          {statementFor(card, flipped)}
        </Text>
      </View>
    </>
  );
}

function guideLine(card: PolicyCard, firstJudicial: boolean): string {
  if (firstJudicial) {
    return "Judges aren't scored on policy. These cards are about how a judge reads the law.";
  }
  if (card.kind === "tradeoff") {
    return "Swipe right if it's worth the cost, left if it isn't. Saying no to the cost isn't saying no to the goal.";
  }
  return "Swipe right to agree, left to disagree. Any answer is fine, and skipping counts as no answer.";
}

const styles = StyleSheet.create({
  area: { flex: 1 },
  stack: { flex: 1 },
  layer: {
    position: "absolute",
    overflow: "hidden",
    left: 0,
    right: 0,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.card,
    boxShadow: `0 1px 0 ${colors.bevel}`,
  },
  art: { backgroundColor: colors.page, borderBottomWidth: 2, borderBottomColor: colors.line },
  sample: { position: "absolute", top: 8, left: 8, transform: [{ scale: 0.85 }] },
  answered: {
    position: "absolute",
    bottom: 8,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.line,
  },
  answeredText: { fontFamily: fonts.bold, color: colors.line, fontSize: 13 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 20 },
  topic: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  topicText: {
    flex: 1,
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 12.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statement: { fontFamily: fonts.display, color: colors.ink, fontSize: 24, lineHeight: 31 },
  tradeoffText: { fontFamily: fonts.display, color: colors.ink, fontSize: 21, lineHeight: 27 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  costLine: { flex: 1, height: 1.5, backgroundColor: colors.lineSoft },
  costLabel: { fontFamily: fonts.displayItalic, color: colors.line, fontSize: 16 },
  footnote: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  moreLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 14 },
  more: {
    marginTop: 12,
    padding: 12,
    gap: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.line,
    backgroundColor: colors.cream,
    boxShadow: shadows.paper,
  },
  moreText: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 22 },
  moreRecord: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 20 },
  moreNote: { fontFamily: fonts.displayItalic, color: colors.inkSoft, fontSize: 14 },
  bubble: { position: "absolute", right: 0, bottom: 4, maxWidth: 280 },
  hints: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  hint: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 14 },
});
