import type { PolicyCard, Swipe } from "@ftb/types";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, PageScene, PaperDots } from "@/components/art";
import { Enter, Flourish, PressableScale, StampIn } from "@/components/motion";
import {
  Banner,
  GuideBubble,
  GuideTile,
  IconBox,
  Kicker,
  PrimaryButton,
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
import { choiceLabel, displayChoices, orderDeck, swipeFor } from "@/lib/deck";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

type Option = { key: string; label: string; swipe: Swipe; selected: boolean };

export default function Explore() {
  const session = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState(true);
  const gate = usePhaseGate(["explore", "walkthrough"]);
  if (gate) return gate;

  const cards = DECK;
  const deckIndex = Math.min(session.state.deckIndex, cards.length - 1);
  const card = cards[deckIndex];
  if (!card) return null;

  const swipe = session.state.swipes.find((item) => item.cardId === card.id);
  const flipped = session.state.flips[card.id] === true;
  const starred = session.starred(card.id);
  const options = optionsFor(card, swipe, starred, flipped);
  const answered = swipe != null && swipe.chosen !== "skip";
  const copy = cardCopy(card);
  // The guide greets you on arrival, then steps aside so later pages have room.
  const next = () => {
    setGuide(false);
    if (deckIndex >= cards.length - 1) router.push("/priorities");
    else session.setDeckIndex(deckIndex + 1);
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
          <View style={styles.turnRow}>
            <View style={styles.swapNote}>
              <Icon name="swap" size={18} />
              <Text style={styles.swapText}>Pages swap sides{"\n"}at random.</Text>
            </View>
            <PrimaryButton
              label={deckIndex >= cards.length - 1 ? "Finish" : "Turn the page"}
              arrow
              disabled={!answered}
              onPress={next}
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

        {card.kind === "tradeoff" ? (
          <Enter delay={80} style={styles.tradeoff}>
            <PaperDots color="rgba(196,110,88,0.10)" />
            <Kicker>The goal</Kicker>
            <Text style={styles.tradeoffText}>{card.policy}</Text>
            <View style={styles.costRow}>
              <View style={styles.costLine} />
              <Text style={styles.costLabel}>at the cost of</Text>
              <View style={styles.costLine} />
            </View>
            <Text style={styles.tradeoffText}>{card.cost}</Text>
          </Enter>
        ) : null}

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Choose a page"
          style={styles.pages}
        >
          {options.map((option, index) => (
            <View key={option.key}>
              {index === 1 ? (
                <Enter kind="pop" delay={420} style={styles.orSeal}>
                  <Text style={styles.orText}>or</Text>
                </Enter>
              ) : null}
              <Enter kind="deal" delay={100 + index * 140}>
                <PageChoice
                  option={option}
                  time={index === 0 ? "day" : "dusk"}
                  tradeoff={card.kind === "tradeoff"}
                  dimmed={answered && !option.selected}
                  onPress={() => session.answer(option.swipe)}
                />
              </Enter>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function PageChoice({
  option,
  time,
  tradeoff,
  dimmed,
  onPress,
}: {
  option: Option;
  time: "day" | "dusk";
  tradeoff: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Flourish kind="hop" trigger={option.selected}>
      <PressableScale
        accessibilityRole="radio"
        accessibilityState={{ checked: option.selected }}
        accessibilityLabel={option.label}
        onPress={onPress}
        depth={0.98}
        style={[styles.page, option.selected && styles.pageChosen, dimmed && styles.pageDimmed]}
      >
        <View style={[styles.pageArt, time === "dusk" && styles.pageArtDusk]}>
          <PaperDots />
          <PageScene time={time} />
          {option.selected ? (
            <StampIn style={styles.stamp}>
              <Icon name="check" size={14} strokeWidth={3} />
              <Text style={styles.stampText}>chosen</Text>
            </StampIn>
          ) : null}
        </View>
        <View style={styles.pageText}>
          <Text style={tradeoff ? styles.pageTitle : styles.pageBody}>{option.label}</Text>
        </View>
      </PressableScale>
    </Flourish>
  );
}

function optionsFor(
  card: PolicyCard,
  swipe: Swipe | undefined,
  starred: boolean,
  flipped: boolean,
): Option[] {
  // Screen order comes from the persisted flip; the recorded choice always names the data pole.
  return displayChoices(card, flipped).map((choice) => ({
    key: choice,
    label: choiceLabel(card, choice),
    swipe: swipeFor(card, choice, starred),
    selected: swipe?.chosen === choice,
  }));
}

const DECK = orderDeck(releaseCards);

function cardCopy(card: PolicyCard) {
  const base = { icon: cardIcon(card), title: cardTitle(card) };
  if (card.kind === "tradeoff") {
    return {
      ...base,
      kicker: "A tradeoff",
      prompt: "Is this worth it to you?",
      guide: "Declining does not mean you oppose the goal. It means this cost is too high.",
    };
  }
  if (card.kind === "judicial_pole") {
    return {
      ...base,
      kicker: "Judicial philosophy",
      prompt: "Tap the page that sounds more like you.",
      guide:
        "This is about how a judge reads the law, not about a policy. Skipping leaves it blank.",
    };
  }
  return {
    ...base,
    kicker: card.anchor ? "An anchor question" : "On this ballot",
    prompt: "Tap the page that sounds more like you.",
    guide: "Any pick is fine here. Skipping counts as no answer, never as neutral.",
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
  tradeoff: {
    overflow: "hidden",
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    padding: 14,
    marginTop: 16,
  },
  tradeoffText: { fontFamily: fonts.display, color: colors.ink, fontSize: 20, lineHeight: 26 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 },
  costLine: { flex: 1, height: 1.5, backgroundColor: colors.lineSoft },
  costLabel: { fontFamily: fonts.displayItalic, color: colors.line, fontSize: 16 },
  pages: { marginTop: 18, paddingHorizontal: 2, paddingBottom: 8 },
  page: {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.page,
    boxShadow: shadows.paper,
  },
  pageChosen: { boxShadow: shadows.chosen },
  pageDimmed: { opacity: 0.62, boxShadow: "none" },
  pageArt: { backgroundColor: colors.page, borderBottomWidth: 2, borderBottomColor: colors.line },
  pageArtDusk: { backgroundColor: "#EBC2B4" },
  stamp: {
    position: "absolute",
    top: 10,
    right: 10,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: 15,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.line,
    boxShadow: shadows.paper,
  },
  stampText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 16, marginTop: -2 },
  pageText: {
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  pageTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 20, lineHeight: 24 },
  pageBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 22 },
  orSeal: {
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    marginVertical: -12,
    zIndex: 2,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: colors.line,
    boxShadow: `0 0 0 4px ${colors.bg}, 0 2px 0 4px ${colors.bevel}`,
    alignItems: "center",
    justifyContent: "center",
  },
  orText: { fontFamily: fonts.display, color: colors.line, fontSize: 18, marginTop: -3 },
  bubbleSlot: { alignSelf: "flex-end", maxWidth: 280, marginBottom: 8 },
  turnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  swapNote: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  swapText: { fontFamily: fonts.body, color: colors.ink, fontSize: 14, lineHeight: 18 },
});
