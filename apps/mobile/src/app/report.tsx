// Correction path (Invariant 21). Candidates and voters use the same form; no swipes or picks attached.
import { useState } from "react";
import { TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { contestById, release } from "../mockup/data";
import { Btn, Card, colors, Muted, P, Row, Screen } from "../mockup/ui";

const input = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  padding: 10,
  marginVertical: 8,
  fontSize: 15,
} as const;

export default function Report() {
  const { contestId } = useLocalSearchParams<{ contestId?: string }>();
  const contest = contestId ? contestById(contestId) : undefined;
  const [sent, setSent] = useState(false);

  if (sent)
    return (
      <Screen title="Thanks">
        <P>
          A reviewer checks every report against evidence. Corrections ship as a new data release
          with a public change note.
        </P>
        <Row>
          <Btn kind="primary" label="Done" onPress={() => router.back()} />
        </Row>
      </Screen>
    );

  return (
    <Screen
      title="Report an error"
      sub="Candidates and voters use the same form and review process."
    >
      <Card>
        <Muted small>
          Release {release.release.id}
          {contest ? ` · ${contest.title}` : ""}
        </Muted>
        <P>What's wrong?</P>
        <TextInput
          multiline
          numberOfLines={4}
          style={[input, { minHeight: 90 }]}
          accessibilityLabel="What's wrong"
        />
        <P>Link to evidence (optional)</P>
        <TextInput
          placeholder="https://…"
          style={input}
          autoCapitalize="none"
          accessibilityLabel="Evidence link"
        />
        <Muted small>Your swipes and picks are not included.</Muted>
        <Row>
          <Btn kind="primary" label="Send report" onPress={() => setSent(true)} />
        </Row>
      </Card>
    </Screen>
  );
}
