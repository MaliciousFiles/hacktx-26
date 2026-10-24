// Onboarding + ballot lookup (PLAN.md §1, Invariant 5: address is processed on-device only).
import { useState } from "react";
import { Page, Section } from "../components";
import { ballotStyles, release } from "../data";
import { useApp } from "../state";

export function Welcome() {
  const { go } = useApp();
  return (
    <Page
      title="Look at the plans before the party"
      sub="A guided walk through every contest on your real ballot."
    >
      <ol className="steps">
        <li>
          <b>Find your ballot.</b> Your address is matched on this device; we only ever see an
          official ballot-style ID.
        </li>
        <li>
          <b>Explore what matters to you.</b> Pick between two sides of an issue, weigh tradeoffs,
          ⭐ what matters. Skip anything.
        </li>
        <li>
          <b>Walk your ballot.</b> For each contest: what the office can do, sourced evidence,
          plans, money, and what's missing. Candidates are masked.
        </li>
        <li>
          <b>Unmask.</b> See names and parties after you've looked at the evidence.
        </li>
      </ol>
      <Section title="Before you start">
        <ul className="plain small">
          <li>We don't endorse anyone. Alignment is a navigation aid, not an answer.</li>
          <li>Your choices, swipes and picks never leave this device.</li>
          <li>
            Masking is a speed bump, not anonymity: quotes can be searched. It's there to keep you
            from reading party first.
          </li>
        </ul>
      </Section>
      <button className="primary" onClick={() => go({ name: "lookup" })}>
        Get started
      </button>
    </Page>
  );
}

export function Lookup() {
  const { state, go, dispatch } = useApp();
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<"address" | "manual">("address");
  const [status, setStatus] = useState<"idle" | "resolved" | "ambiguous">("idle");
  const [manual, setManual] = useState(ballotStyles[0].id);

  // Mock of BallotProvider.lookup: runs locally. "?" in the address simulates an ambiguous point.
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
    <Page title="Find your ballot" sub="Travis County · November 3, 2026 · early voting Oct 19–30">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "address"} onClick={() => setMode("address")}>
          By address
        </button>
        <button role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")}>
          Pick ballot style
        </button>
      </div>

      {mode === "address" ? (
        <div className="card">
          <label>
            Home address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Example St, Austin TX"
            />
          </label>
          <p className="small muted">
            Matched against district maps stored on this device. Nothing is sent. (Mock: type a "?"
            to simulate an ambiguous result.)
          </p>
          <button className="primary" disabled={!address.trim()} onClick={lookUp}>
            Look up on device
          </button>
        </div>
      ) : (
        <div className="card">
          <label>
            Official ballot style
            <select value={manual} onChange={(e) => setManual(e.target.value)}>
              {ballotStyles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">Find your style on your sample ballot from VoteTravis.</p>
          <button className="primary" onClick={confirmManual}>
            Use this style
          </button>
        </div>
      )}

      {status === "ambiguous" && (
        <div className="card warn">
          That address sits on a boundary we can't resolve confidently. We won't guess —{" "}
          <button className="link" onClick={() => setMode("manual")}>
            choose your ballot style
          </button>{" "}
          instead.
        </div>
      )}

      {status === "resolved" && state.ballotStyleId && (
        <div className="card ok">
          <p>
            Ballot style <code>{state.ballotStyleId}</code> · {release.ballot.contestIds.length}{" "}
            contests · data release <code>{release.release.id}</code>
          </p>
          {state.ballotStyleId !== release.ballot.ballotStyleId && (
            <p className="small warn-text">
              Mock: only style 001 has fixture data; showing it anyway.
            </p>
          )}
          <p className="small muted">
            Request sent: GET /ballot?ballotStyleId=…&releaseId=… (no address).
          </p>
          <button className="primary" onClick={() => go({ name: "deck", deck: "policy" })}>
            Start exploring
          </button>{" "}
          <button onClick={() => go({ name: "ballot" })}>Skip to my ballot</button>
        </div>
      )}
    </Page>
  );
}
