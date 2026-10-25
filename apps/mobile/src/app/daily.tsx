import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Icon } from "@/components/art";
import { Enter, PressableScale } from "@/components/motion";
import {
  Kicker,
  Note,
  Panel,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
  TopBar,
} from "@/components/ui";
import {
  CARDS_PER_DAY,
  bestStreak,
  dailyCards,
  rankTitle,
  readAnswers,
  resultGrid,
  scoreOf,
  utcDay,
  type FactCard,
} from "@/lib/dailyGame";
import { colors, fonts, shadows } from "@/theme";

const THROW = 110; // how far to drag before a swipe counts
const OFFSCREEN = 520;

/** Fact or Fairy Tale: swipe right for a fact, left for a fairy tale. Never reads the ballot. */
export default function Daily() {
  const [day, setDay] = useState(utcDay);
  useEffect(() => {
    const timer = setInterval(() => setDay(utcDay()), 30000);
    return () => clearInterval(timer);
  }, []);
  return <Game key={day} day={day} />;
}

function Game({ day }: { day: string }) {
  const router = useRouter();
  const cards = dailyCards(day);
  // SecureStore keys allow only letters, digits, ".", "-" and "_".
  const storeKey = `wishing-well-fact-v1.${day}`;
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState("");
  const [pan] = useState(() => new Animated.ValueXY());
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    SecureStore.getItemAsync(storeKey)
      .then((raw) => live && setAnswers(readAnswers(raw)))
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [storeKey]);

  const index = answers.length - (revealed ? 1 : 0);
  const done = loaded && answers.length === CARDS_PER_DAY && !revealed;
  const card = cards[index] as FactCard | undefined;
  const score = scoreOf(cards, answers);

  const commit = useRef<(guess: boolean) => void>(() => {});
  useEffect(() => {
    commit.current = (guess: boolean) => {
      if (busy.current || revealed || done || !loaded) return;
      busy.current = true;
      Animated.timing(pan, {
        toValue: { x: guess ? OFFSCREEN : -OFFSCREEN, y: 0 },
        duration: 220,
        useNativeDriver: false,
      }).start(() => {
        const next = [...answers, guess];
        setAnswers(next);
        setRevealed(true);
        busy.current = false;
        SecureStore.setItemAsync(storeKey, JSON.stringify(next)).catch(() =>
          setNote("Progress is kept for this visit only; this phone could not save it."),
        );
      });
    };
  });

  // The responder is built once; `commit.current` is read only inside its touch callbacks.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_event, g) => {
        if (g.dx > THROW) commit.current(true);
        else if (g.dx < -THROW) commit.current(false);
        else
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 6,
          }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
    }),
  );

  const next = () => {
    pan.setValue({ x: 0, y: 0 });
    setRevealed(false);
  };

  const result = `Wishing Well · Fact or Fairy Tale?\n${day} · ${score}/${CARDS_PER_DAY} · ${rankTitle(score, CARDS_PER_DAY)}\n${resultGrid(cards, answers)}\nFictional practice. Real curiosity.`;
  const share = async () => {
    try {
      await Share.share({ message: result });
    } catch {
      setNote("Sharing is not available here.");
    }
  };

  const rotate = pan.x.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: ["-9deg", "0deg", "9deg"],
  });
  const factStamp = pan.x.interpolate({
    inputRange: [0, THROW],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const taleStamp = pan.x.interpolate({
    inputRange: [-THROW, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const taleScale = pan.x.interpolate({
    inputRange: [-THROW, 0],
    outputRange: [1.25, 1],
    extrapolate: "clamp",
  });
  const factScale = pan.x.interpolate({
    inputRange: [0, THROW],
    outputRange: [1, 1.25],
    extrapolate: "clamp",
  });
  // Keep the card in the vertical middle of the screen, with room for the corner buttons.
  const { height: windowHeight } = useWindowDimensions();
  const deckHeight = Math.max(500, Math.round(windowHeight * 0.64));

  const last = answers[answers.length - 1];
  const lastCard = cards[answers.length - 1];
  const lastRight = revealed && lastCard != null && last === lastCard.fact;

  return (
    <Screen header={<TopBar onBack={() => router.navigate("/")} backLabel="Home" home={false} />}>
      <Kicker>{`The daily dip · ${day} UTC`}</Kicker>
      <Title>Fact or Fairy Tale?</Title>

      <View
        accessible
        accessibilityLabel={`${answers.length} of ${CARDS_PER_DAY} cards swiped`}
        style={styles.pips}
      >
        {cards.map((item, i) => {
          const answered = answers[i] != null;
          return (
            <View
              key={item.id}
              style={[
                styles.pip,
                answered && (answers[i] === item.fact ? styles.pipRight : styles.pipWrong),
              ]}
            />
          );
        })}
      </View>

      {!loaded ? null : done ? (
        <Enter kind="pop">
          <Panel>
            <Text style={styles.kicker}>Today’s deck, done</Text>
            <Text style={styles.rank}>{rankTitle(score, CARDS_PER_DAY)}</Text>
            <Text style={styles.grid}>{resultGrid(cards, answers)}</Text>
            <Text style={styles.copy}>
              {score} of {CARDS_PER_DAY} right · best streak {bestStreak(cards, answers)}
            </Text>
          </Panel>
          {cards.map((item, i) => (
            <View key={item.id} style={styles.review}>
              <Text style={styles.reviewMark}>{answers[i] === item.fact ? "🟩" : "🟨"}</Text>
              <View style={styles.reviewText}>
                <Text style={styles.reviewClaim}>{item.claim}</Text>
                <Text style={styles.reviewWhy}>
                  <Text style={styles.reviewVerdict}>{item.fact ? "Fact. " : "Fairy tale. "}</Text>
                  {item.why.replace(/^Fairy tale!\s*/, "")}
                </Text>
              </View>
            </View>
          ))}
          {note ? <Note>{note}</Note> : null}
          <Note>A new deck arrives at midnight UTC.</Note>
          <PrimaryButton label="Share my result" onPress={() => void share()} />
          <TextButton label="Back home" icon="back" onPress={() => router.navigate("/")} />
        </Enter>
      ) : revealed && lastCard ? (
        <Enter kind="pop">
          <View style={[styles.verdict, lastRight ? styles.verdictRight : styles.verdictWrong]}>
            <Text style={styles.verdictBig}>{lastRight ? "Spot on!" : "Not quite!"}</Text>
            <Text style={styles.verdictSub}>
              {lastCard.fact ? "That one was a Fact." : "That one was a Fairy Tale."}
            </Text>
            <Text style={styles.verdictClaim}>“{lastCard.claim}”</Text>
            <Text style={styles.verdictWhy}>{lastCard.why.replace(/^Fairy tale!\s*/, "")}</Text>
          </View>
          <PrimaryButton
            label={answers.length === CARDS_PER_DAY ? "See my result" : "Next card"}
            arrow
            onPress={next}
          />
        </Enter>
      ) : card ? (
        <View style={[styles.deck, { height: deckHeight }]}>
          <View style={styles.corners} pointerEvents="box-none">
            <CornerButton
              label="Fairy-Tale"
              side="left"
              scale={taleScale}
              onPress={() => commit.current(false)}
            />
            <CornerButton
              label="Fact"
              side="right"
              scale={factScale}
              onPress={() => commit.current(true)}
            />
          </View>
          <View style={[styles.card, styles.cardBehind]} />
          <Animated.View
            {...responder.panHandlers}
            key={card.id}
            accessible
            accessibilityLabel={`${card.claim} Swipe right for fact, left for fairy tale.`}
            style={[
              styles.card,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
            ]}
          >
            <Animated.View style={[styles.stamp, styles.stampFact, { opacity: factStamp }]}>
              <Text style={[styles.stampText, { color: colors.forest }]}>FACT</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampTale, { opacity: taleStamp }]}>
              <Text style={[styles.stampText, { color: colors.rose }]}>FAIRY-TALE</Text>
            </Animated.View>
            <View style={styles.cardIcon}>
              <Icon name={card.icon} size={30} strokeWidth={2.2} />
            </View>
            <Text style={styles.claim}>{card.claim}</Text>
            <Text style={styles.count}>
              {index + 1} of {CARDS_PER_DAY}
            </Text>
          </Animated.View>
        </View>
      ) : null}
      {note && !done ? <Note>{note}</Note> : null}
    </Screen>
  );
}

/** A round arrow in a top corner of the deck. Tapping it answers; dragging toward it grows it. */
function CornerButton({
  label,
  side,
  scale,
  onPress,
}: {
  label: string;
  side: "left" | "right";
  scale: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
}) {
  const left = side === "left";
  return (
    <Animated.View
      style={[
        styles.corner,
        left ? styles.cornerLeft : styles.cornerRight,
        { transform: [{ scale }] },
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        hitSlop={8}
        style={[styles.cornerDisc, left ? styles.cornerTale : styles.cornerFact]}
      >
        <View style={left ? { transform: [{ scaleX: -1 }] } : undefined}>
          <Icon name="arrow" size={26} strokeWidth={2.6} />
        </View>
      </PressableScale>
      <Text style={styles.cornerLabel}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pips: { flexDirection: "row", gap: 8, marginTop: 14, justifyContent: "center" },
  pip: {
    width: 22,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
  },
  pipRight: { backgroundColor: colors.forest, borderColor: colors.forest },
  pipWrong: { backgroundColor: colors.goldDeep, borderColor: colors.goldDeep },
  deck: { marginTop: 8, alignItems: "center", justifyContent: "center" },
  corners: { ...StyleSheet.absoluteFill, zIndex: 2 },
  corner: { position: "absolute", top: 0, alignItems: "center", width: 84 },
  cornerLeft: { left: 0 },
  cornerRight: { right: 0 },
  cornerDisc: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.paper,
  },
  cornerTale: { backgroundColor: colors.roseSoft },
  cornerFact: { backgroundColor: colors.forestSoft },
  cornerLabel: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17, marginTop: 6 },
  card: {
    position: "absolute",
    width: "100%",
    height: 300,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 2.5,
    borderRadius: 18,
    boxShadow: shadows.paper,
    padding: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBehind: {
    transform: [{ scale: 0.94 }, { translateY: 14 }],
    opacity: 0.7,
    backgroundColor: colors.cream,
  },
  cardIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  claim: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 27,
    lineHeight: 34,
    textAlign: "center",
    marginTop: 18,
  },
  count: {
    position: "absolute",
    bottom: 14,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 13,
  },
  stamp: {
    position: "absolute",
    top: 18,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: colors.card,
  },
  stampFact: { left: 16, borderColor: colors.forest, transform: [{ rotate: "-10deg" }] },
  stampTale: { right: 16, borderColor: colors.rose, transform: [{ rotate: "10deg" }] },
  stampText: { fontFamily: fonts.smallCaps, fontSize: 22 },
  verdict: {
    borderWidth: 2.5,
    borderRadius: 18,
    padding: 22,
    marginTop: 20,
    marginBottom: 14,
    boxShadow: shadows.paper,
  },
  verdictRight: { backgroundColor: colors.forestSoft, borderColor: colors.forest },
  verdictWrong: { backgroundColor: colors.goldSoft, borderColor: colors.goldDeep },
  verdictBig: { fontFamily: fonts.display, color: colors.heading, fontSize: 34, lineHeight: 40 },
  verdictSub: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 19, marginTop: 2 },
  verdictClaim: {
    fontFamily: fonts.displayItalic,
    color: colors.ink,
    fontSize: 19,
    lineHeight: 26,
    marginTop: 14,
  },
  verdictWhy: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  kicker: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17 },
  rank: {
    fontFamily: fonts.display,
    color: colors.heading,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 4,
  },
  grid: { fontSize: 30, letterSpacing: 3, marginTop: 10 },
  copy: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23, marginTop: 8 },
  review: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.card,
    borderColor: colors.lineSoft,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  reviewMark: { fontSize: 20 },
  reviewText: { flex: 1 },
  reviewClaim: { fontFamily: fonts.bold, color: colors.heading, fontSize: 15, lineHeight: 20 },
  reviewWhy: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  reviewVerdict: { fontFamily: fonts.bold, color: colors.line },
});
