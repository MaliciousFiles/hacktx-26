// Ballot lookup (Invariant 5: address is processed on-device; only a ballot-style ID is requested).
import { useState } from "react";
import { TextInput } from "react-native";
import { router } from "expo-router";
import { ballotStyles, release } from "../mockup/data";
import { useApp } from "../mockup/state";
import { Btn, Card, colors, Muted, P, Row, Screen } from "../mockup/ui";

export default function Lookup() {
  const { state, dispatch } = useApp();
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<"address" | "manual">("address");
  const [status, setStatus] = useState<"idle" | "resolved" | "ambiguous">("idle");
  const [manual, setManual] = useState(ballotStyles[0].id);

  // Mock of BallotProvider.lookup running locally. A "?" in the address simulates an ambiguous point.
  function lookUp() {
    if (address.includes("?")) return setStatus("ambiguous");
    dispatch({ type: "setBallotStyle", id: release.ballot.ballotStyleId });
    setStatus("resolved");
  }

  function confirmManual() {
    dispatch({ type: "setBallotStyle", id: manual });
    setStatus("resolved");
  }

  return (
    <Screen
      title="Find your ballot"
      sub="Travis County · November 3, 2026 · early voting Oct 19–30"
    >
      <Row>
        <Btn
          role="tab"
          label="By address"
          selected={mode === "address"}
          onPress={() => setMode("address")}
        />
        <Btn
          role="tab"
          label="Pick ballot style"
          selected={mode === "manual"}
          onPress={() => setMode("manual")}
        />
      </Row>

      {mode === "address" ? (
        <Card>
          <P>Home address</P>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="123 Example St, Austin TX"
            accessibilityLabel="Home address"
            autoComplete="street-address"
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              padding: 10,
              marginVertical: 8,
              fontSize: 15,
            }}
          />
          <Muted small>
            Matched against district maps stored on this phone. Nothing is sent. (Mock: type a "?"
            to simulate an ambiguous result.)
          </Muted>
          <Row>
            <Btn
              kind="primary"
              label="Look up on device"
              disabled={!address.trim()}
              onPress={lookUp}
            />
          </Row>
        </Card>
      ) : (
        <Card>
          <P>Official ballot style</P>
          {ballotStyles.map((b) => (
            <Row key={b.id}>
              <Btn
                kind="option"
                role="radio"
                label={b.label}
                selected={manual === b.id}
                onPress={() => setManual(b.id)}
              />
            </Row>
          ))}
          <Muted small>Find your style on your sample ballot from VoteTravis.</Muted>
          <Row>
            <Btn kind="primary" label="Use this style" onPress={confirmManual} />
          </Row>
        </Card>
      )}

      {status === "ambiguous" && (
        <Card tone="warn">
          <P>That address sits on a boundary we can't resolve confidently. We won't guess.</P>
          <Btn
            kind="link"
            label="Choose your ballot style instead"
            onPress={() => setMode("manual")}
          />
        </Card>
      )}

      {status === "resolved" && state.ballotStyleId && (
        <Card tone="ok">
          <P>
            Ballot style {state.ballotStyleId} · {release.ballot.contestIds.length} contests · data
            release {release.release.id}
          </P>
          {state.ballotStyleId !== release.ballot.ballotStyleId && (
            <Muted small>Mock: only style 001 has fixture data; showing it anyway.</Muted>
          )}
          <Muted small>Request sent: GET /ballot?ballotStyleId=…&releaseId=… (no address).</Muted>
          <Row>
            <Btn
              kind="primary"
              label="Start exploring"
              onPress={() => router.push("/deck/policy")}
            />
            <Btn label="Skip to my ballot" onPress={() => router.push("/ballot")} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
