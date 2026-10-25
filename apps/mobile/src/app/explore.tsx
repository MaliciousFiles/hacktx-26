import type { PolicyCard } from "@ftb/types";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, PageScene, PaperDots } from "@/components/art";
import { Enter, PressableScale } from "@/components/motion";
import { SwipeCard, type SwipeCardHandle } from "@/components/SwipeCard";
import {
  Banner,
  GuideBubble,
  GuideTile,
  IconBox,
  Kicker,
  Progress,
  Ribbon,
  Rule,
  SampleMark,
  Screen,
  Tile,
} from "@/components/ui";
import { cards as releaseCards, demo } from "@/data/release";
import { usePhaseGate } from "@/gate";
import { cardIcon, cardTitle } from "@/deckCopy";
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

export default function Explore() {
  const session = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState(true);
  const swipeCard = useRef<SwipeCardHandle>(null);
  const gate = usePhaseGate(["explore", "walkthrough"]);
  if (gate) return gate;

  const cards = DECK;
  const deckIndex = Math.min(session.state.deckIndex, cards.length - 1);
  const card = cards[deckIndex];
  if (!card) return null;

  const swipe = session.state.swipes.find((item) => item.cardId === card.id);
  const flipped = session.state.flips[card.id] === true;
  const starred = session.starred(card.id);
  const previous = verdictOf(card, flipped, swipe);
  const copy = cardCopy(card);
  const labels =
    card.kind === "tradeoff"
      ? { agree: "Worth it", disagree: "Not worth it" }
      : { agree: "Agree", disagree: "Disagree" };

  const next = () => {
    // The guide greets you on arrival, then steps aside so later cards have room.
    setGuide(false);
    if (deckIndex >= cards.length - 1) router.push("/priorities");
    else session.setDeckIndex(deckIndex + 1);
  };
  const decide = (verdict: Verdict) => {
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
      header={
        <View pointerEvents="box-none" style={styles.header}>
          <Ribbon label="What matters to you" onPress={() => router.push("/priorities")} />
          <Progress index={deckIndex} total={cards.length} />
        </View>
      }
      footer={
        <>
          {guide ? (
            <View style={styles.bubbleSlot}>
              <GuideBubble key={card.id}>{copy.guide}</GuideBubble>
            </View>
          ) : null}
          <View style={styles.verdicts}>
            <VerdictButton
              label={labels.disagree}
              side="left"
              onPress={() => swipeCard.current?.fling("disagree")}
            />
            <VerdictButton
              label={labels.agree}
              side="right"
              onPress={() => swipeCard.current?.fling("agree")}
            />
          </View>
        </>
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
          <GuideTile on={guide} onPress={() => setGuide((value) => !value)} />
        </>
      }
    >
      <View key={card.id}>
        {demo ? <SampleMark /> : null}
        {card.deck === "judicial" && cards[deckIndex - 1]?.deck !== "judicial" ? (
          <Banner
            title="Judicial cards"
            body="Judges aren't scored on policy. These cards are about how a judge reads the law."
          />
        ) : null}
        <Enter style={styles.heading}>
          <View style={styles.headingRow}>
            <IconBox icon={copy.icon} />
            <Text accessibilityRole="header" style={styles.headingTitle}>
              {copy.title}
            </Text>
          </View>
          <View style={styles.indent}>
            <Rule />
          </View>
          <Text style={[styles.indent, styles.headingSub]}>
            <Text style={styles.headingKicker}>{copy.kicker.toUpperCase()}</Text> · {copy.prompt}
          </Text>
        </Enter>

        <Enter kind="deal" delay={100} style={styles.cardSlot}>
          <SwipeCard
            ref={swipeCard}
            onSwipe={decide}
            agreeLabel={labels.agree}
            disagreeLabel={labels.disagree}
            accessibilityLabel={
              card.kind === "tradeoff"
                ? `${card.policy}, at the cost of ${card.cost}`
                : statementFor(card, flipped)
            }
          >
            <View style={styles.cardArt}>
              <PaperDots />
              <PageScene time={flipped ? "dusk" : "day"} />
              {previous && previous !== "skip" ? (
                <View style={styles.answered}>
                  <Icon name="check" size={14} strokeWidth={3} />
                  <Text style={styles.answeredText}>
                    You said: {previous === "agree" ? labels.agree : labels.disagree}
                  </Text>
                </View>
              ) : null}
            </View>
            {card.kind === "tradeoff" ? (
              <View style={styles.cardText}>
                <Kicker>The goal</Kicker>
                <Text style={styles.tradeoffText}>{card.policy}</Text>
                <View style={styles.costRow}>
                  <View style={styles.costLine} />
                  <Text style={styles.costLabel}>at the cost of</Text>
                  <View style={styles.costLine} />
                </View>
                <Text style={styles.tradeoffText}>{card.cost}</Text>
              </View>
            ) : (
              <View style={styles.cardText}>
                <Text style={styles.statement}>{statementFor(card, flipped)}</Text>
              </View>
            )}
          </SwipeCard>
        </Enter>

        <View style={styles.hints} aria-hidden>
          <Text style={styles.hint}>← {labels.disagree}</Text>
          <Text style={styles.hint}>{labels.agree} →</Text>
        </View>
        {card.kind === "tradeoff" ? (
          <Text style={styles.footnote}>
            Saying &quot;not worth it&quot; doesn&apos;t mean you oppose{" "}
            {card.policy.charAt(0).toLowerCase() + card.policy.slice(1)}.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function VerdictButton({
  label,
  side,
  onPress,
}: {
  label: string;
  side: "left" | "right";
  onPress: () => void;
}) {
  // Same shape and color for both answers, so neither looks like the "right" one.
  return (
    <View style={styles.verdictSlot}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.verdict}
      >
        <View style={side === "left" ? styles.flip : undefined}>
          <Icon name="arrow" size={20} strokeWidth={2.6} />
        </View>
        <Text style={styles.verdictLabel}>{label}</Text>
      </PressableScale>
    </View>
  );
}

const DECK = orderDeck(releaseCards);

function cardCopy(card: PolicyCard) {
  const base = { icon: cardIcon(card), title: cardTitle(card) };
  if (card.kind === "tradeoff") {
    return {
      ...base,
      kicker: "A tradeoff",
      prompt: "Is this worth it to you?",
      guide:
        "Swipe right if it's worth the cost, left if it isn't. Saying no to the cost isn't saying no to the goal.",
    };
  }
  if (card.kind === "judicial_pole") {
    return {
      ...base,
      kicker: "Judicial philosophy",
      prompt: "Swipe right to agree, left to disagree.",
      guide:
        "This is about how a judge reads the law, not about a policy. Skipping leaves it blank.",
    };
  }
  return {
    ...base,
    kicker: card.anchor ? "An anchor question" : "On this ballot",
    prompt: "Swipe right to agree, left to disagree.",
    guide: "Any answer is fine. Skipping counts as no answer, never as neutral.",
  };
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingLeft: 10,
    // The ribbon hangs from the top edge, over the gilded corner.
    marginTop: -14,
  },
  heading: { gap: 7, marginBottom: 4 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingTitle: {
    flex: 1,
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 29,
    lineHeight: 33,
  },
  indent: { marginLeft: 44 },
  headingSub: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
  headingKicker: { fontFamily: fonts.bold, color: colors.line, letterSpacing: 0.6 },
  cardSlot: { marginTop: 16 },
  cardArt: { backgroundColor: colors.page, borderBottomWidth: 2, borderBottomColor: colors.line },
  answered: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.line,
  },
  answeredText: { fontFamily: fonts.bold, color: colors.line, fontSize: 13 },
  cardText: { backgroundColor: colors.card, padding: 16, minHeight: 120 },
  statement: { fontFamily: fonts.display, color: colors.ink, fontSize: 23, lineHeight: 30 },
  tradeoffText: { fontFamily: fonts.display, color: colors.ink, fontSize: 21, lineHeight: 27 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  costLine: { flex: 1, height: 1.5, backgroundColor: colors.lineSoft },
  costLabel: { fontFamily: fonts.displayItalic, color: colors.line, fontSize: 16 },
  hints: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  hint: { fontFamily: fonts.bold, color: colors.inkSoft, fontSize: 14 },
  footnote: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  bubbleSlot: { alignSelf: "flex-end", maxWidth: 280, marginBottom: 8 },
  verdicts: { flexDirection: "row", gap: 12 },
  verdictSlot: { flex: 1 },
  verdict: {
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.gold,
    boxShadow: shadows.button,
  },
  verdictLabel: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19, marginTop: -2 },
  flip: { transform: [{ scaleX: -1 }] },
});
