// Per-type contest bodies: candidate race, proposition, judicial (PLAN.md §2).
import { View } from "react-native";
import { router } from "expo-router";
import type {
  Bucket,
  CandidateProfile,
  Contest,
  CredibilityFlagType,
  FundingMap,
  JudicialDim,
  MatchResult,
  MoneyRange,
  PromiseStatus,
} from "@ftb/types";
import {
  computeContestMatch,
  computeDarkShareInterval,
  computeJudicialComparison,
  computeMeasureConnections,
} from "@ftb/types/scoring";
import { candidatesFor, displayName, issueLabel, release } from "./data";
import { useApp } from "./state";
import {
  Bad,
  Btn,
  Card,
  Collapsible,
  Eyebrow,
  EvidenceTag,
  H3,
  H4,
  KV,
  Meter,
  Muted,
  P,
  Quote,
  Section,
  Sentences,
  SlotView,
} from "./ui";

// ── Candidate race ───────────────────────────────────────────────────────────

const bucketText: Record<Bucket, string> = {
  happily_ever_after: "Very close to you",
  good_company: "Fairly close to you",
  different_paths: "Some real differences",
  worlds_apart: "Far from you",
  clouded: "Unclear — not enough evidence to compare",
};

export function CandidateRaceView({ contest }: { contest: Contest }) {
  const { state, userVector } = useApp();
  const profiles = candidatesFor(contest);
  const match = computeContestMatch(userVector, contest, profiles);
  const ordered = state.order[contest.id].map((cid) => profiles.find((p) => p.id === cid)!);

  return (
    <Section
      title="The candidates"
      note="Random order, random masks. Compare the evidence and make your own call."
    >
      {match.noStrongMatch && match.results.some((r) => r.matchClarity > 0) && (
        <Muted small>No candidate here is a close match on the issues we could compare.</Muted>
      )}
      {ordered.map((p) => (
        <CandidateCard key={p.id} p={p} match={match.results.find((r) => r.candidateId === p.id)} />
      ))}
    </Section>
  );
}

const flagText: Record<CredibilityFlagType, string> = {
  beyond_power: "🚩 Promise is beyond this office's power",
  needs_others: "⚠️ Needs other officials to act",
  no_funding: "💸 No funding source stated",
  funded: "✅ Funding or tradeoff named",
};

const promiseText: Record<PromiseStatus, string> = {
  kept: "✅ Kept",
  fought_for: "🛠️ Fought for",
  broken: "❌ Broken (human-reviewed)",
  no_action: "⏸️ No documented action",
  outside_power: "🚫 Outside their power",
};

const tierText = ["Limited detail", "Some detail", "Detailed"];

function CandidateCard({ p, match }: { p: CandidateProfile; match?: MatchResult }) {
  const { state } = useApp();
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <H3>{displayName(state, p.contestId, p.id)}</H3>
        <EvidenceTag state={p.evidenceState} />
      </View>
      <Muted small>
        {p.incumbent ? "Incumbent" : "Challenger"} ·{" "}
        {p.recordInOffice === "none"
          ? "No record in office"
          : `Has a ${p.recordInOffice}-level record`}
      </Muted>
      {p.recordInOffice === "none" && (
        <Muted small>Based on what they say, not what they've done.</Muted>
      )}

      {p.coverage === "objective_only" ? (
        <Card tone="warn">
          <P>
            Objective info only. We couldn't find enough sourced evidence to analyze this
            candidate's positions. That's not a judgment about them: look them up after unmasking,
            or check their questionnaire responses.
          </P>
        </Card>
      ) : (
        <>
          <H4>Platform highlights</H4>
          <Sentences items={p.platformHighlights} empty="No highlights passed citation checks." />

          <H4>Evidence by issue</H4>
          {p.evidence.length === 0 ? (
            <Muted small>None.</Muted>
          ) : (
            p.evidence.map((e) => (
              <View key={e.id} style={{ marginBottom: 8 }}>
                <Eyebrow>
                  {issueLabel(e.issueId)} · {e.kind === "action" ? "Action" : "Words"} ·{" "}
                  {e.sourceType.replace("_", " ")} · {e.date}
                </Eyebrow>
                <Quote>{e.redacted ? `[redacted] ${e.excerpt}` : `“${e.excerpt}”`}</Quote>
              </View>
            ))
          )}

          <H4>Plan explorer</H4>
          {p.plans.length === 0 ? (
            <Muted small>No plans documented.</Muted>
          ) : (
            p.plans.map((plan) => (
              <View key={plan.id}>
                <P style={{ fontWeight: "600" }}>{issueLabel(plan.issueId)}</P>
                <KV
                  rows={[
                    ["Goal", <SlotView slot={plan.goal} />],
                    ["Mechanism", <SlotView slot={plan.mechanism} />],
                    ["Cost", <SlotView slot={plan.cost} />],
                    ["Funding", <SlotView slot={plan.funding} />],
                    ["Timeline", <SlotView slot={plan.timeline} />],
                    ["Who acts", <SlotView slot={plan.whoActs} />],
                  ]}
                />
              </View>
            ))
          )}
          <Meter
            value={p.specificity.score}
            label={`Plan specificity: ${tierText[p.specificity.tier]}`}
          />
          <Muted small>How much plan detail is documented, not whether it's true or doable.</Muted>

          <H4>Credibility checks</H4>
          {p.credibility.flags.length === 0 ? (
            <Muted small>No flags.</Muted>
          ) : (
            p.credibility.flags.map((f, i) => (
              <P key={i}>
                {flagText[f.type]} ({issueLabel(f.issueId)})
              </P>
            ))
          )}

          <H4>Says vs. does</H4>
          {p.saysVsDoes.length === 0 ? (
            <Muted small>Not enough evidence on both sides to compare.</Muted>
          ) : (
            <KV
              rows={p.saysVsDoes.map((x) => [
                issueLabel(x.issueId),
                `says ${x.says?.toFixed(2) ?? "—"} · does ${x.does?.toFixed(2) ?? "—"} · gap ${x.gap.toFixed(2)}`,
              ])}
            />
          )}

          <H4>Promises (prior office)</H4>
          {p.promiseKept.length === 0 ? (
            <Muted small>None tracked.</Muted>
          ) : (
            p.promiseKept.map((pr, i) => (
              <View key={i}>
                <P>{promiseText[pr.status]}</P>
                <Sentences items={pr.promise} />
              </View>
            ))
          )}

          <H4>Fact-checks</H4>
          {p.truthfulness.factChecks.length === 0 ? (
            <Muted small>No IFCN fact-checks found. Coverage is uneven across candidates.</Muted>
          ) : (
            p.truthfulness.factChecks.map((f, i) => (
              <View key={i}>
                <P>
                  {f.outlet}: {f.rating}
                </P>
                <Sentences items={f.claim} />
              </View>
            ))
          )}

          {p.bipartisanship && (
            <>
              <H4>
                {p.bipartisanship.label === "bipartisanship"
                  ? "Bipartisanship"
                  : "Coalition breadth"}
              </H4>
              {p.bipartisanship.composite !== undefined ? (
                <Meter value={p.bipartisanship.composite} label="Composite" />
              ) : (
                <Muted small>Not available.</Muted>
              )}
            </>
          )}

          <H4>Follow the money</H4>
          <MoneyView funding={p.funding} />
        </>
      )}

      <Collapsible title="Alignment with your choices (secondary)">
        {match ? <AlignmentView m={match} /> : <Muted small>Not computed.</Muted>}
      </Collapsible>
    </Card>
  );
}

function AlignmentView({ m }: { m: MatchResult }) {
  const bucket: Bucket = m.matchClarity === 0 ? "clouded" : m.bucket;
  return (
    <View>
      <P style={{ fontWeight: "600" }}>{bucketText[bucket]}</P>
      <Muted small>
        Issues compared: {m.issuesCompared} (need ≥3 for a clear read) · agreements{" "}
        {m.agreements.length} · disagreements {m.disagreements.length}
      </Muted>
      <Meter value={m.matchClarity} label="Match clarity" />
      <Muted small>This is a navigation aid, not a recommendation.</Muted>
    </View>
  );
}

const fmt = (r: MoneyRange) =>
  r.min === r.max
    ? `$${r.min.toLocaleString()}`
    : `$${r.min.toLocaleString()}–$${r.max.toLocaleString()}`;

function MoneyView({ funding }: { funding?: FundingMap }) {
  if (!funding)
    return <Muted small>No filings in this release. Missing filings are not the same as $0.</Muted>;
  const dark = computeDarkShareInterval(funding);
  return (
    <KV
      rows={[
        ["Direct receipts", fmt(funding.direct)],
        ["Small unitemized (not dark)", fmt(funding.traced.receipts.unitemizedSmall)],
        ["Outside spending", fmt(funding.outside)],
        [
          "Dark share of outside",
          dark
            ? `${Math.round(dark.min * 100)}%${dark.max !== undefined ? `–${Math.round(dark.max * 100)}%` : "+"}`
            : "n/a",
        ],
        ...funding.topIndustries.map((t): [string, string] => [
          `${t.industry} (inferred)`,
          fmt(t.amount),
        ]),
      ]}
    />
  );
}

// ── Measure ──────────────────────────────────────────────────────────────────

export function MeasureView({ contest }: { contest: Contest }) {
  const { userVector } = useApp();
  const m = contest.measure!;
  const connections = computeMeasureConnections(
    userVector,
    contest.id,
    m.issueVector,
    release.cards,
    [m.ballotText.citation],
  );
  return (
    <>
      <Section title="Official ballot text" note="Verbatim from the official ballot.">
        <Quote>{m.ballotText.text}</Quote>
      </Section>
      <Section title="What your vote does">
        <Card>
          <H3>A YES vote</H3>
          <SlotView slot={m.yesMeans} />
        </Card>
        <Card>
          <H3>A NO vote</H3>
          <SlotView slot={m.noMeans} />
        </Card>
      </Section>
      <Section title="Cost">
        {m.fiscal ? (
          <KV
            rows={[
              [
                "Principal",
                m.fiscal.principal !== undefined ? (
                  `$${m.fiscal.principal.toLocaleString()}`
                ) : (
                  <Bad>Unknown</Bad>
                ),
              ],
              [
                "Interest",
                m.fiscal.interest !== undefined ? (
                  `$${m.fiscal.interest.toLocaleString()}`
                ) : (
                  <Bad>Unknown</Bad>
                ),
              ],
              [
                "Tax impact",
                m.fiscal.taxImpact ? <Sentences items={m.fiscal.taxImpact} /> : <Bad>Unknown</Bad>,
              ],
            ]}
          />
        ) : (
          <Bad>No verified fiscal figures.</Bad>
        )}
      </Section>
      <Section title="Who's funding each side">
        <Card>
          <H3>YES campaign</H3>
          <MoneyView funding={m.funding?.yes} />
        </Card>
        <Card>
          <H3>NO campaign</H3>
          <MoneyView funding={m.funding?.no} />
        </Card>
      </Section>
      <Collapsible title="How this connects to your choices (max 2, never a recommendation)">
        {connections.length === 0 ? (
          <Muted small>No connections passed our checks for this measure.</Muted>
        ) : (
          connections.map((c) => (
            <P key={c.cardId}>
              {issueLabel(c.issueId)}: you leaned {c.userPosition.toFixed(2)}, the measure's effect
              is {c.measureEffect.toFixed(2)}.
            </P>
          ))
        )}
      </Collapsible>
    </>
  );
}

// ── Judicial ─────────────────────────────────────────────────────────────────

const dims: JudicialDim[] = [
  "text_vs_purpose",
  "restraint_vs_review",
  "precedent",
  "procedural_strictness",
];

export function JudicialView({ contest }: { contest: Contest }) {
  const { state, userVector } = useApp();
  const profiles = candidatesFor(contest);
  const comparison = computeJudicialComparison(userVector, contest.id, profiles);
  const ordered = state.order[contest.id].map((cid) => profiles.find((p) => p.id === cid)!);
  const didDeck = release.cards.some((c) => c.deck === "judicial" && state.swipes[c.id]);

  return (
    <Section
      title="The candidates"
      note="Judges are compared on judicial philosophy and qualifications, never on policy."
    >
      {!didDeck && (
        <Card tone="warn">
          <P>You haven't done the judicial deck yet.</P>
          <Btn kind="link" label="Do it now" onPress={() => router.push("/deck/judicial")} />
        </Card>
      )}
      {ordered.map((p) => {
        const res = comparison.results.find((r) => r.candidateId === p.id);
        const jp = p.judicialProfile;
        return (
          <Card key={p.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <H3>{displayName(state, contest.id, p.id)}</H3>
              <EvidenceTag state={p.evidenceState} />
            </View>
            <KV
              rows={[
                ["Status", p.incumbent ? "Incumbent" : "Challenger"],
                [
                  "Experience",
                  jp?.experienceYears !== undefined ? `${jp.experienceYears} years` : "Unknown",
                ],
                [
                  "Board certified",
                  jp?.boardCertified === undefined ? "Unknown" : jp.boardCertified ? "Yes" : "No",
                ],
                [
                  "Austin Bar poll",
                  jp?.barPoll ? JSON.stringify(jp.barPoll.summary) : "Not available",
                ],
                [
                  "Court stats",
                  jp?.courtStats ? `Clearance ${jp.courtStats.clearanceRate}` : "Not available",
                ],
              ]}
            />
            <H4>Philosophy evidence</H4>
            <KV
              rows={dims.map((d) => {
                const st = jp?.philosophy[d];
                const prox = res?.dimensions[d];
                return [
                  issueLabel(`judicial.${d}`),
                  st
                    ? `leans ${st.position.toFixed(2)} (strength ${Math.round(st.evidenceStrength * 100)}%)${
                        prox ? ` · ${Math.round(prox.proximity * 100)}% close to you` : ""
                      }`
                    : "No evidence",
                ];
              })}
            />
          </Card>
        );
      })}
    </Section>
  );
}
