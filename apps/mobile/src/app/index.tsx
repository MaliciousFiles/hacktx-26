import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import {
  Body,
  Kicker,
  Note,
  Ornament,
  Panel,
  PrimaryButton,
  SampleMark,
  Screen,
  TextButton,
  Title,
} from "@/components/ui";
import { formatIsoDate } from "@/format";
import { demoBallot } from "@/fixtures/travisDemo";
import { useSession } from "@/session";
import { colors, fonts } from "@/theme";

export default function Onboarding() {
  const router = useRouter();
  const session = useSession();
  const [missing, setMissing] = useState(false);
  const { release, ballot } = demoBallot;

  const begin = () => {
    if (!session.started) {
      const ready = session.begin();
      if (!ready) return;
    }
    router.navigate("/explore");
  };

  return (
    <Screen
      footer={
        <>
          <PrimaryButton
            label={session.started ? "Continue the sample" : "Begin with this style"}
            onPress={begin}
          />
          {session.started ? (
            <TextButton
              label="Start over"
              onPress={() => {
                session.reset();
                setMissing(false);
              }}
            />
          ) : null}
        </>
      }
    >
      <SampleMark />
      <Kicker>Fairy Tale Ballot</Kicker>
      <Title>Pick the plan before the party.</Title>
      <Body>
        Travis County, November 3, 2026. You will see evidence and choices first. Names come after
        you ask for them.
      </Body>
      <Ornament />
      <Panel>
        <Text style={styles.guideName}>Fairy Godmother</Text>
        <Text style={styles.guideLine}>
          I will keep the names in my pocket until you have read the evidence.
        </Text>
      </Panel>
      <Text style={styles.styleLabel}>Ballot style on this phone</Text>
      <Panel>
        <Text style={styles.styleTitle}>Sample style A</Text>
        <Text style={styles.styleBody}>
          Three contests: a council seat, a court, and a bond proposition. Confirm a real style on
          your official ballot. This build only includes the sample.
        </Text>
        <Note>{ballot.ballotStyleId}</Note>
      </Panel>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMissing((value) => !value)}
        style={styles.missing}
      >
        <Text style={styles.missingLabel}>My ballot style is not listed</Text>
      </Pressable>
      {missing ? (
        <Note>
          This build will not guess a style from your address. If the official style is missing,
          stop and confirm it. The sample is only for previewing the app.
        </Note>
      ) : null}
      {session.maskError ? <Note>{session.maskError}</Note> : null}
      <Note>
        Release {release.id} · as of {formatIsoDate(release.asOfDate)}. Nothing about an address
        leaves the phone. This sample never asks for one.
      </Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  guideName: { fontFamily: fonts.smallCaps, color: colors.line, fontSize: 17, marginBottom: 4 },
  guideLine: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  styleLabel: {
    marginTop: 22,
    fontFamily: fonts.bold,
    color: colors.line,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  styleTitle: { fontFamily: fonts.display, color: colors.heading, fontSize: 24, marginBottom: 6 },
  styleBody: { fontFamily: fonts.body, color: colors.ink, fontSize: 16, lineHeight: 23 },
  missing: { marginTop: 16 },
  missingLabel: { fontFamily: fonts.bold, color: colors.line, fontSize: 16 },
});
