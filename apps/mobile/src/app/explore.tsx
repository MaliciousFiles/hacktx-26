import type { PolicyCard, Swipe } from "@ftb/types";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Body,
  GuideBubble,
  IconBox,
  Kicker,
  PrimaryButton,
  Progress,
  Ribbon,
  Rule,
  SampleMark,
  Screen,
  TextButton,
  Tile,
  Title,
  TopBar,
} from "@/components/ui";
import { demoBallot, issueById } from "@/fixtures/travisDemo";
import { JUDICIAL_LABEL } from "@/labels";
import { choiceText } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

type Option = { key: string; label: string; glyph: string; swipe: Swipe; selected: boolean };

export default function Explore() {
  const session = useSession();
  const router = useRouter();
  const [guide, setGuide] = useState(true);
  if (!session.started) return <Redirect href="/" />;

  const cards = demoBallot.cards;
  const card = cards[session.deckIndex];
  if (!card) {
    return <DeckDone />;
  }

  const swipe = session.swipes.find((item) => item.cardId === card.id);
  const flipped = session.flips[card.id] === true;
  const starred = session.starred(card.id);
  const options = optionsFor(card, swipe, starred, flipped);
  const answered = swipe != null && swipe.chosen !== "skip";
  const copy = cardCopy(card);
  const next = () => session.setDeckIndex(session.deckIndex + 1);
  const back = () => {
    if (session.deckIndex === 0) router.back();
    else session.setDeckIndex(session.deckIndex - 1);
  };
  const skip = () => {
    if (card.kind === "tradeoff") {
      session.answer({ kind: "tradeoff", cardId: card.id, chosen: "skip", starred });
    } else if (card.kind === "judicial_pole") {
      session.answer({ kind: "judicial_pole", cardId: card.id, chosen: "skip", starred });
    } else {
      session.answer({ kind: "pole", cardId: card.id, chosen: "skip", starred });
    }
    next();
  };

  return (
    <Screen
      footer={
        <>
          {guide ? (
            <View style={styles.bubbleSlot}>
              <GuideBubble>{copy.guide}</GuideBubble>
            </View>
          ) : null}
          <View style={styles.turnRow}>
            <View style={styles.swapNote}>
              <Text style={styles.swapGlyph}>⇄</Text>
              <Text style={styles.swapText}>Pages swap sides{"\n"}at random.</Text>
            </View>
            <PrimaryButton label="Turn the page" trailing="→" disabled={!answered} onPress={next} />
          </View>
        </>
      }
      tray={
        <>
          <Tile label="back" glyph="↶" onPress={back} accessibilityLabel="Previous card" />
          <Tile label="skip" glyph="»" onPress={skip} accessibilityLabel="Skip this card" />
          <Tile
            label="matters"
            glyph={starred ? "★" : "☆"}
            on={starred}
            onPress={() => session.toggleStar(card.id)}
            accessibilityLabel={starred ? "Marked as matters to me" : "Mark as matters to me"}
          />
          <Tile
            label="guide"
            glyph="✦"
            on={guide}
            onPress={() => setGuide((value) => !value)}
            accessibilityLabel="Ask the Fairy Godmother"
          />
        </>
      }
    >
      <View style={styles.header}>
        <Ribbon label="Open the ballot" onPress={() => router.navigate("/ballot")} />
        <Progress index={session.deckIndex} total={cards.length} />
      </View>
      <SampleMark />
      <View style={styles.heading}>
        <View style={styles.headingRow}>
          <IconBox glyph={copy.glyph} />
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
      </View>
      {card.kind === "tradeoff" ? (
        <View style={styles.tradeoff}>
          <Kicker>The goal</Kicker>
          <Text style={styles.tradeoffText}>{card.policy}</Text>
          <Text style={styles.costLabel}>at the cost of</Text>
          <Text style={styles.tradeoffText}>{card.cost}</Text>
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Choose a page" style={styles.pages}>
        {options.map((option, index) => (
          <View key={option.key}>
            {index === 1 ? (
              <View style={styles.orSeal} accessibilityElementsHidden>
                <Text style={styles.orText}>or</Text>
              </View>
            ) : null}
            <PageChoice
              option={option}
              tradeoff={card.kind === "tradeoff"}
              dimmed={answered && !option.selected}
              onPress={() => session.answer(option.swipe)}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

function PageChoice({
  option,
  tradeoff,
  dimmed,
  onPress,
}: {
  option: Option;
  tradeoff: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: option.selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.page,
        option.selected && styles.pageChosen,
        dimmed && styles.pageDimmed,
        pressed && styles.pagePressed,
      ]}
    >
      <View style={styles.pageArt}>
        <Text style={styles.pageGlyph}>{option.glyph}</Text>
        {option.selected ? (
          <View style={styles.stamp}>
            <Text style={styles.stampText}>✓ chosen</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.pageText}>
        <Text style={tradeoff ? styles.pageTitle : styles.pageBody}>{option.label}</Text>
      </View>
    </Pressable>
  );
}

function optionsFor(
  card: PolicyCard,
  swipe: Swipe | undefined,
  starred: boolean,
  flipped: boolean,
): Option[] {
  let options: Option[];
  if (card.kind === "tradeoff") {
    const chosen = swipe?.kind === "tradeoff" ? swipe.chosen : undefined;
    options = [
      {
        key: "accept",
        label: "Worth this cost",
        glyph: "❦",
        swipe: { kind: "tradeoff", cardId: card.id, chosen: "accept", starred },
        selected: chosen === "accept",
      },
      {
        key: "decline",
        label: "Not worth this cost",
        glyph: "✿",
        swipe: { kind: "tradeoff", cardId: card.id, chosen: "decline", starred },
        selected: chosen === "decline",
      },
    ];
  } else {
    const chosen = swipe?.kind !== "tradeoff" ? swipe?.chosen : undefined;
    options = (["a", "b"] as const).map((side) => ({
      key: side,
      label: side === "a" ? card.poleA : card.poleB,
      glyph: side === "a" ? "❦" : "✿",
      swipe:
        card.kind === "judicial_pole"
          ? { kind: "judicial_pole", cardId: card.id, chosen: side, starred }
          : { kind: "pole", cardId: card.id, chosen: side, starred },
      selected: chosen === side,
    }));
  }
  return flipped ? options.reverse() : options;
}

function cardCopy(card: PolicyCard) {
  if (card.kind === "tradeoff") {
    return {
      glyph: "⚖\uFE0E",
      kicker: "A tradeoff",
      title: "Is this worth the cost?",
      prompt: "Pick the page you can live with.",
      guide: "Declining does not mean you oppose the goal. It means this cost is too high.",
    };
  }
  if (card.kind === "judicial_pole") {
    return {
      glyph: "J",
      kicker: "Judicial philosophy",
      title: JUDICIAL_LABEL[card.dimension],
      prompt: "Tap the page that sounds more like you.",
      guide:
        "This is about how a judge reads the law, not about a policy. Skipping leaves it blank.",
    };
  }
  const label = issueById(card.issueId)?.label ?? "A choice";
  return {
    glyph: label.charAt(0),
    kicker: card.anchor ? "An anchor question" : "On this ballot",
    title: label,
    prompt: "Tap the page that sounds more like you.",
    guide: "No right answer here. Skipping counts as no answer, never as neutral.",
  };
}

function DeckDone() {
  const session = useSession();
  const router = useRouter();
  return (
    <Screen
      footer={
        <>
          <PrimaryButton label="Walk the ballot" onPress={() => router.navigate("/ballot")} />
          <TextButton
            label="Review the last card"
            onPress={() => session.setDeckIndex(Math.max(demoBallot.cards.length - 1, 0))}
          />
        </>
      }
    >
      <TopBar onBack={() => session.setDeckIndex(Math.max(demoBallot.cards.length - 1, 0))} />
      <SampleMark />
      <Kicker>The deck is finished</Kicker>
      <Title>The names can wait.</Title>
      <Body>
        Every contest on this sample is still ahead. The evidence comes first. A summary does not
        pick a winner.
      </Body>
      {demoBallot.cards.map((card) => {
        const swipe = session.swipes.find((item) => item.cardId === card.id);
        const title =
          card.kind === "pole"
            ? (issueById(card.issueId)?.label ?? "Choice")
            : card.kind === "tradeoff"
              ? "Tradeoff"
              : JUDICIAL_LABEL[card.dimension];
        return (
          <Text key={card.id} style={styles.summary}>
            {swipe?.starred ? "★ " : ""}
            {title}: {choiceText(card, swipe)}
          </Text>
        );
      })}
    </Screen>
  );
}


const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  heading: { gap: 7, marginBottom: 4 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingTitle: {
    flex: 1,
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 28,
    lineHeight: 31,
  },
  indent: { marginLeft: 42 },
  headingSub: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
  headingKicker: { fontFamily: fonts.bold, color: colors.line },
  tradeoff: {
    backgroundColor: colors.cream,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    padding: 14,
    marginTop: 14,
  },
  tradeoffText: { fontFamily: fonts.display, color: colors.ink, fontSize: 20, lineHeight: 26 },
  costLabel: {
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 2,
  },
  pages: { marginTop: 16, paddingHorizontal: 2, paddingBottom: 6 },
  page: {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.page,
    boxShadow: shadows.paper,
  },
  pageChosen: { boxShadow: shadows.chosen },
  pageDimmed: { opacity: 0.62, boxShadow: "none" },
  pagePressed: { transform: [{ translateY: 2 }, { scale: 0.98 }] },
  pageArt: {
    height: 54,
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
    backgroundImage: "linear-gradient(180deg, #F2CDB2 0%, #F2CDB2 70%, #E8BB9C 70%, #E8BB9C 100%)",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  pageGlyph: { fontFamily: fonts.display, color: "#C98D72", fontSize: 30 },
  stamp: {
    position: "absolute",
    top: 10,
    right: 10,
    height: 30,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 15,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.line,
    boxShadow: shadows.paper,
    justifyContent: "center",
    transform: [{ rotate: "5deg" }],
  },
  stampText: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 16 },
  pageText: { backgroundColor: colors.card, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
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
  bubbleSlot: { alignSelf: "flex-end", maxWidth: 270, marginBottom: 6 },
  turnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  swapNote: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  swapGlyph: { color: colors.line, fontSize: 16 },
  swapText: { fontFamily: fonts.body, color: colors.ink, fontSize: 14, lineHeight: 18 },
  summary: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 14,
  },
});
