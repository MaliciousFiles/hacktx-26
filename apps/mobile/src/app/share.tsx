// Share card: rendered locally, sent through the OS share sheet. Counts only, no picks (Invariant 5).
import { Share as RNShare, View } from "react-native";
import { release } from "../mockup/data";
import { useApp } from "../mockup/state";
import { Btn, colors, Eyebrow, Muted, P, Row, Screen } from "../mockup/ui";

export default function Share() {
  const { state } = useApp();
  const decided = Object.values(state.picks).filter((p) => p !== "undecided").length;
  const starred = Object.values(state.swipes).filter((s) => s.starred).length;
  const summary = `I examined ${state.visited.length} of ${release.contests.length} contests on my ballot before looking at names or parties.`;

  return (
    <Screen
      title="Share card"
      sub="Made on this phone and sent through your share sheet. No upload."
    >
      <View
        style={{
          aspectRatio: 4 / 5,
          borderWidth: 2,
          borderColor: colors.text,
          borderRadius: 14,
          padding: 20,
          justifyContent: "center",
          backgroundColor: colors.surface,
          marginVertical: 12,
        }}
      >
        <Eyebrow>My ballot walkthrough · Travis County 2026</Eyebrow>
        <P style={{ fontSize: 22, fontWeight: "700", marginVertical: 10 }}>
          I examined {state.visited.length} of {release.contests.length} contests
        </P>
        <P>
          {decided} decided · {starred} issues marked important
        </P>
        <Muted small>Pick the plan before the party.</Muted>
      </View>
      <Muted small>The card shows counts only: no picks, swipes, names or parties.</Muted>
      <Row>
        {/* Mock: the real card is rendered to an image locally before sharing. */}
        <Btn kind="primary" label="Share" onPress={() => RNShare.share({ message: summary })} />
      </Row>
    </Screen>
  );
}
