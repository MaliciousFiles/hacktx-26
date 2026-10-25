import type { PolicyCard, Swipe } from "@ftb/types";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, PageScene, PaperDots, type IconName } from "@/components/art";
import { Enter, Flourish, PressableScale, StampIn } from "@/components/motion";
import {
  Body,
  GuideBubble,
  GuideTile,
  IconBox,
  Kicker,
  Ornament,
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
import { issueById } from "@/fixtures/travisDemo";
import { useBallotData } from "@/ballotData";
import { JUDICIAL_LABEL } from "@/labels";
import { choiceText } from "@/matching";
import { useSession } from "@/session";
import { colors, fonts, shadows } from "@/theme";

type Option = { key: string; label: string; swipe: Swipe; selected: boolean };

export default function Explore() {
  const { data: demoBallot } = useBallotData();
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
  // The guide greets you on arrival, then steps aside so later pages have room.
  const next = () => {
    setGuide(false);
    session.setDeckIndex(session.deckIndex + 1);
  };
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
      key={card.id}
      header={
        <View pointerEvents="box-none" style={styles.header}>
          <Ribbon label="Open the ballot" onPress={() => router.navigate("/ballot")} />
          <Progress index={session.deckIndex} total={cards.length} />
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
              <Text style={styles.swapText}>Option order{"\n"}is randomized.</Text>
            </View>
            <PrimaryButton label="Next question" arrow disabled={!answered} onPress={next} />
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
        <SampleMark />
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
          accessibilityLabel="Choose an answer"
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
  let options: Option[];
  if (card.kind === "tradeoff") {
    const chosen = swipe?.kind === "tradeoff" ? swipe.chosen : undefined;
    options = [
      {
        key: "accept",
        label: "Worth this cost",
        swipe: { kind: "tradeoff", cardId: card.id, chosen: "accept", starred },
        selected: chosen === "accept",
      },
      {
        key: "decline",
        label: "Not worth this cost",
        swipe: { kind: "tradeoff", cardId: card.id, chosen: "decline", starred },
        selected: chosen === "decline",
      },
    ];
  } else {
    const chosen = swipe?.kind !== "tradeoff" ? swipe?.chosen : undefined;
    options = (["a", "b"] as const).map((side) => ({
      key: side,
      label: side === "a" ? card.poleA : card.poleB,
      swipe:
        card.kind === "judicial_pole"
          ? { kind: "judicial_pole", cardId: card.id, chosen: side, starred }
          : { kind: "pole", cardId: card.id, chosen: side, starred },
      selected: chosen === side,
    }));
  }
  return flipped ? options.reverse() : options;
}

const ISSUE_ICONS: Record<string, IconName> = {
  housing: "house",
  mobility: "bus",
  fiscal: "coins",
};

function cardIcon(card: PolicyCard): IconName {
  if (card.kind === "tradeoff") return "scale";
  if (card.kind === "judicial_pole") return "gavel";
  return ISSUE_ICONS[card.issueId.split(".")[0] ?? ""] ?? "sparkle";
}

function cardTitle(card: PolicyCard): string {
  if (card.kind === "tradeoff") return "Is this worth the cost?";
  if (card.kind === "judicial_pole") return JUDICIAL_LABEL[card.dimension];
  return issueById(card.issueId)?.label ?? "A choice";
}

function cardCopy(card: PolicyCard) {
  const base = { icon: cardIcon(card), title: cardTitle(card) };
  if (card.kind === "tradeoff") {
    return {
      ...base,
      kicker: "A tradeoff",
      prompt: "Is the goal worth the stated cost?",
      guide: "Declining does not mean you oppose the goal. It means this cost is too high.",
    };
  }
  if (card.kind === "judicial_pole") {
    return {
      ...base,
      kicker: "Judicial philosophy",
      prompt: "Choose the approach closest to your view.",
      guide:
        "This asks how you think judges should interpret the law. It is separate from your policy views. You can skip if you are unsure.",
    };
  }
  return {
    ...base,
    kicker: card.anchor ? "Your priorities" : "On this ballot",
    prompt: "Choose the option closest to your view.",
    guide:
      "Choose what you prefer, or skip if neither option fits. A skipped question is not treated as a neutral position.",
  };
}

function DeckDone() {
  const { data: demoBallot } = useBallotData();
  const session = useSession();
  const router = useRouter();
  const lastCard = () => session.setDeckIndex(Math.max(demoBallot.cards.length - 1, 0));
  return (
    <Screen
      header={<TopBar onBack={lastCard} backLabel="Last card" />}
      footer={
        <>
          <PrimaryButton
            label="Explore my ballot"
            arrow
            onPress={() => router.navigate("/ballot")}
          />
          <TextButton label="Review the last card" icon="back" onPress={lastCard} />
        </>
      }
    >
      <SampleMark />
      <Kicker>Questions complete</Kicker>
      <Title>Now compare the evidence.</Title>
      <Body>
        Review your answers below, then open a contest to compare candidates’ plans and records.
        Your answers help you explore differences; they do not decide your vote.
      </Body>
      <Ornament />
      <View style={styles.summary}>
        {demoBallot.cards.map((card, index) => {
          const swipe = session.swipes.find((item) => item.cardId === card.id);
          const skipped = swipe == null || swipe.chosen === "skip";
          return (
            <Enter key={card.id} delay={120 + index * 80}>
              <View style={[styles.summaryRow, index > 0 && styles.summaryDivider]}>
                <IconBox icon={cardIcon(card)} />
                <View style={styles.summaryText}>
                  <Text style={styles.summaryTitle}>{cardTitle(card)}</Text>
                  <Text style={[styles.summaryChoice, skipped && styles.summarySkipped]}>
                    {choiceText(card, swipe)}
                  </Text>
                </View>
                {swipe?.starred ? (
                  <Icon name="star" size={20} strokeWidth={1.7} fill={colors.goldDeep} />
                ) : null}
              </View>
            </Enter>
          );
        })}
      </View>
    </Screen>
  );
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
  summary: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2,
    borderRadius: 10,
    boxShadow: shadows.paper,
    paddingHorizontal: 14,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  summaryDivider: { borderTopWidth: 1.5, borderTopColor: colors.lineSoft, borderStyle: "dashed" },
  summaryText: { flex: 1, gap: 2 },
  summaryTitle: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 18 },
  summaryChoice: { fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 20 },
  summarySkipped: { color: colors.inkSoft, fontFamily: fonts.displayItalic },
});
