// Daily challenge prototype: "Quote Match" on non-ballot data so it can't spoil the player's own ballot.
import { useState } from "react";
import { Share } from "react-native";
import { Btn, Card, Quote, Row, Screen, Section, P } from "../mockup/ui";

const quotes = [
  { quote: "We will fix every pothole within 48 hours.", platform: "Roads first" },
  {
    quote: "Every neighborhood deserves a library within walking distance.",
    platform: "Libraries for all",
  },
  { quote: "No new taxes until the audit is done.", platform: "Audit first" },
];
const platforms = ["Audit first", "Roads first", "Libraries for all"];

export default function Daily() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const done = Object.keys(answers).length === quotes.length;
  const grid = quotes.map((q, i) => (answers[i] === q.platform ? "🟩" : "🟥")).join("");

  return (
    <Screen
      title="Quote Match"
      sub="Match each quote to its platform. Uses past or out-of-state races, never yours."
    >
      {quotes.map((q, i) => (
        <Card key={i}>
          <Quote>“{q.quote}”</Quote>
          <Row>
            {platforms.map((p) => (
              <Btn
                key={p}
                role="radio"
                label={p}
                selected={answers[i] === p}
                disabled={done}
                onPress={() => setAnswers({ ...answers, [i]: p })}
              />
            ))}
          </Row>
        </Card>
      ))}
      {done && (
        <Section title="Result">
          <P style={{ fontSize: 28 }}>{grid}</P>
          <Row>
            <Btn
              label="Share result"
              onPress={() => Share.share({ message: `Quote Match ${grid}` })}
            />
          </Row>
        </Section>
      )}
    </Screen>
  );
}
