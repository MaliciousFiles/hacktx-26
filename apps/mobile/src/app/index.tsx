// Onboarding (PLAN.md §1).
import { router } from "expo-router";
import { Btn, Card, P, Screen, Section } from "../mockup/ui";

const steps: [string, string][] = [
  [
    "Find your ballot.",
    "Your address is matched on this phone; we only ever see an official ballot-style ID.",
  ],
  [
    "Explore what matters to you.",
    "Pick between two sides of an issue, weigh tradeoffs, ⭐ what matters. Skip anything.",
  ],
  [
    "Walk your ballot.",
    "For each contest: what the office can do, sourced evidence, plans, money, and what's missing. Candidates are masked.",
  ],
  ["Unmask.", "See names and parties after you've looked at the evidence."],
];

export default function Welcome() {
  return (
    <Screen
      title="Look at the plans before the party"
      sub="A guided walk through every contest on your real ballot."
    >
      {steps.map(([head, body], i) => (
        <Card key={i}>
          <P>
            <P style={{ fontWeight: "600" }}>
              {i + 1}. {head}
            </P>{" "}
            {body}
          </P>
        </Card>
      ))}
      <Section title="Before you start">
        <P>• We don't endorse anyone. Alignment is a navigation aid, not an answer.</P>
        <P>• Your choices, swipes and picks never leave this phone.</P>
        <P>
          • Masking is a speed bump, not anonymity: quotes can be searched. It's there so you don't
          read party first.
        </P>
      </Section>
      <Section title="Get going">
        <Btn kind="primary" label="Get started" onPress={() => router.push("/lookup")} />
      </Section>
    </Screen>
  );
}
