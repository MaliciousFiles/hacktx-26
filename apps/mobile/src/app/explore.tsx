import type { JudicialCard, PoleCard, PolicyCard, Swipe } from "@ftb/types";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import {
  Body,
  ChoiceButton,
  Kicker,
  Note,
  PrimaryButton,
  Progress,
  SampleMark,
  Screen,
  StarButton,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import { demoBallot, issueById } from "@/fixtures/travisDemo";
import { JUDICIAL_LABEL } from "@/labels";
import { choiceText } from "@/matching";
import { useSession } from "@/session";
import { colors, serif } from "@/theme";

export default function Explore() {
  const session = useSession();
  const router = useRouter();
  if (!session.started) return <Redirect href="/" />;

  const cards = demoBallot.cards;
  const card = cards[session.deckIndex];
  if (!card) {
    return <DeckDone />;
  }

  const swipe = session.swipes.find((item) => item.cardId === card.id);
  const flipped = session.flips[card.id] === true;
  const answer = (next: Swipe) => {
    session.answer(next);
    session.setDeckIndex(session.deckIndex + 1);
  };
  const starred = session.starred(card.id);

  return (
    <Screen>
      <TopBar
        onBack={() => {
          if (session.deckIndex === 0) router.back();
          else session.setDeckIndex(session.deckIndex - 1);
        }}
        action={<TextButton label="Ballot" onPress={() => router.navigate("/ballot")} />}
      />
      <SampleMark />
      <Progress index={session.deckIndex} total={cards.length} />
      <StarButton on={starred} onPress={() => session.toggleStar(card.id)} />
      <CardCopy card={card} />
      <View style={styles.choices}>
        {card.kind === "tradeoff" ? (
          <TradeoffButtons
            card={card}
            flipped={flipped}
            swipe={swipe}
            starred={starred}
            onAnswer={answer}
          />
        ) : (
          <PoleButtons
            card={card}
            flipped={flipped}
            swipe={swipe}
            starred={starred}
            onAnswer={answer}
          />
        )}
        <TextButton
          label="Skip"
          onPress={() => {
            if (card.kind === "tradeoff") {
              answer({ kind: "tradeoff", cardId: card.id, chosen: "skip", starred });
            } else if (card.kind === "judicial_pole") {
              answer({ kind: "judicial_pole", cardId: card.id, chosen: "skip", starred });
            } else {
              answer({ kind: "pole", cardId: card.id, chosen: "skip", starred });
            }
          }}
        />
      </View>
    </Screen>
  );
}

function CardCopy({ card }: { card: PolicyCard }) {
  if (card.kind === "tradeoff") {
    return (
      <>
        <Kicker>A tradeoff</Kicker>
        <Title>Is this worth the cost?</Title>
        <Text style={styles.policy}>{card.policy}</Text>
        <Text style={styles.costLabel}>at the cost of</Text>
        <Text style={styles.policy}>{card.cost}</Text>
        <Note>Declining does not mean you oppose the goal. It means this cost is too high.</Note>
      </>
    );
  }
  if (card.kind === "judicial_pole") {
    return (
      <>
        <Kicker>Judicial philosophy</Kicker>
        <Title>{JUDICIAL_LABEL[card.dimension]}</Title>
        <Body>This is about how a judge reads the law, not about a policy.</Body>
        <Note>Either side may be shown first. Skipping leaves it blank.</Note>
      </>
    );
  }
  return (
    <>
      <Kicker>{card.anchor ? "An anchor question" : "On this ballot"}</Kicker>
      <Title>{issueById(card.issueId)?.label ?? "A choice"}</Title>
      <Body>Two ends of one question. Either side may be shown first.</Body>
      <Note>Skipping leaves this blank. It is not a neutral position.</Note>
    </>
  );
}

function PoleButtons({
  card,
  flipped,
  swipe,
  starred,
  onAnswer,
}: {
  card: PoleCard | JudicialCard;
  flipped: boolean;
  swipe: Swipe | undefined;
  starred: boolean;
  onAnswer: (swipe: Swipe) => void;
}) {
  const sides: Array<"a" | "b"> = flipped ? ["b", "a"] : ["a", "b"];
  return (
    <>
      {sides.map((side) => (
        <ChoiceButton
          key={side}
          label={side === "a" ? card.poleA : card.poleB}
          selected={swipe?.kind !== "tradeoff" && swipe?.chosen === side}
          onPress={() => {
            if (card.kind === "judicial_pole") {
              onAnswer({ kind: "judicial_pole", cardId: card.id, chosen: side, starred });
            } else {
              onAnswer({ kind: "pole", cardId: card.id, chosen: side, starred });
            }
          }}
        />
      ))}
    </>
  );
}

function TradeoffButtons({
  card,
  flipped,
  swipe,
  starred,
  onAnswer,
}: {
  card: Extract<PolicyCard, { kind: "tradeoff" }>;
  flipped: boolean;
  swipe: Swipe | undefined;
  starred: boolean;
  onAnswer: (swipe: Swipe) => void;
}) {
  const options: Array<{ chosen: "accept" | "decline"; label: string }> = flipped
    ? [
        { chosen: "decline", label: "Not worth this cost" },
        { chosen: "accept", label: "Worth this cost" },
      ]
    : [
        { chosen: "accept", label: "Worth this cost" },
        { chosen: "decline", label: "Not worth this cost" },
      ];
  return (
    <>
      {options.map((option) => (
        <ChoiceButton
          key={option.chosen}
          label={option.label}
          selected={swipe?.kind === "tradeoff" && swipe.chosen === option.chosen}
          onPress={() =>
            onAnswer({ kind: "tradeoff", cardId: card.id, chosen: option.chosen, starred })
          }
        />
      ))}
    </>
  );
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
        choose for you.
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
  choices: { gap: 10, marginTop: 22 },
  policy: { fontFamily: serif, color: colors.ink, fontSize: 22, lineHeight: 30, marginTop: 8 },
  costLabel: {
    color: colors.gold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 14,
  },
  summary: { color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 14 },
});
