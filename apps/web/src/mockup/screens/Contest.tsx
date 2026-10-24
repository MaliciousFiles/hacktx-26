// Contest walkthrough: evidence first, alignment collapsed and secondary (Invariant 22).
import type {
  Bucket,
  CandidateProfile,
  Contest,
  ContextClaim,
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
import {
  Cited,
  Collapsible,
  EvidenceTag,
  Meter,
  Page,
  Section,
  Sentences,
  SlotView,
} from "../components";
import { candidatesFor, contestById, displayName, issueLabel, release } from "../data";
import { useApp, type Pick } from "../state";

export function ContestScreen({ id }: { id: string }) {
  const contest = contestById(id);
  const { go, state } = useApp();
  const idx = release.ballot.contestIds.indexOf(id);
  const next = release.ballot.contestIds[idx + 1];

  return (
    <Page title={contest.title} sub={`Contest ${idx + 1} of ${release.ballot.contestIds.length}`}>
      <Section title={contest.measure ? "About this measure" : "What this office can do"}>
        <Sentences items={contest.officeDescription} />
        {contest.unopposed && <p className="tag">Unopposed</p>}
      </Section>

      {contest.measure ? (
        <MeasureView contest={contest} />
      ) : contest.officeKind === "judicial" ? (
        <JudicialView contest={contest} />
      ) : (
        <CandidateRaceView contest={contest} />
      )}

      <ContextBriefView contest={contest} />

      <PickBox contest={contest} />

      <div className="row">
        {state.revealed[id] ? (
          <span className="small muted">This contest is unmasked.</span>
        ) : (
          <button onClick={() => go({ name: "report", contestId: id })}>
            Report an error here
          </button>
        )}
        {next ? (
          <button className="primary" onClick={() => go({ name: "contest", id: next })}>
            Next contest →
          </button>
        ) : (
          <button className="primary" onClick={() => go({ name: "ballot" })}>
            Back to ballot
          </button>
        )}
      </div>
    </Page>
  );
}

// ── Context brief (§2 "Every contest") ───────────────────────────────────────

function ContextBriefView({ contest }: { contest: Contest }) {
  const b = contest.context;
  const group = (title: string, claims: ContextClaim[], empty: string) => (
    <div className="brief-col">
      <h3>{title}</h3>
      {claims.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        claims.map((c, i) => (
          <p key={i}>
            {c.attributedTo && <b>{c.attributedTo}: </b>}
            {c.sentences.map((s, j) => (
              <Cited key={j} s={s} />
            ))}
          </p>
        ))
      )}
    </div>
  );
  return (
    <Section
      title="Context brief"
      note="Each side has the same cap. A missing side is shown as missing, never padded."
    >
      <div className="brief">
        {group("✅ Documented", b.confirmed, "Nothing independently documented.")}
        {group("❓ Disputed / unknown", b.disputed, "Nothing flagged as disputed.")}
        {group("🗣️ Supporters say", b.supporters, "No supporter arguments found.")}
        {group("🗣️ Opponents say", b.opponents, "No opponent arguments found.")}
      </div>
      {b.notes.map((n, i) => (
        <p key={i} className="small muted">
          Note:{" "}
          {n.kind === "verified" ? (
            <Cited s={n.sentence} />
          ) : n.code === "data_unavailable" ? (
            "Some data for this contest was unavailable in this release."
          ) : (
            "No organized opposition was found."
          )}
        </p>
      ))}
    </Section>
  );
}

// ── Candidate race ───────────────────────────────────────────────────────────

const bucketText: Record<Bucket, string> = {
  happily_ever_after: "Very close to you",
  good_company: "Fairly close to you",
  different_paths: "Some real differences",
  worlds_apart: "Far from you",
  clouded: "Unclear — not enough evidence to compare",
};

function CandidateRaceView({ contest }: { contest: Contest }) {
  const { state, userVector } = useApp();
  const profiles = candidatesFor(contest);
  const match = computeContestMatch(userVector, contest, profiles);
  const ordered = state.order[contest.id].map((cid) => profiles.find((p) => p.id === cid)!);

  return (
    <>
      <Section
        title="The candidates"
        note="Shown in random order with random masks. Compare the evidence and make your own call."
      >
        {match.noStrongMatch && match.results.some((r) => r.matchClarity > 0) && (
          <p className="card muted small">
            No candidate here is a close match on the issues we could compare.
          </p>
        )}
        <div className="cand-grid">
          {ordered.map((p) => (
            <CandidateCard
              key={p.id}
              p={p}
              match={match.results.find((r) => r.candidateId === p.id)}
            />
          ))}
        </div>
      </Section>
    </>
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
  const name = displayName(state, p.contestId, p.id);

  return (
    <article className="card cand">
      <header className="cand-head">
        <h3>{name}</h3>
        <EvidenceTag state={p.evidenceState} />
      </header>
      <p className="small muted">
        {p.incumbent ? "Incumbent" : "Challenger"} ·{" "}
        {p.recordInOffice === "none"
          ? "No record in office"
          : `Has a ${p.recordInOffice}-level record`}
      </p>
      {p.recordInOffice === "none" && (
        <p className="small badge">Based on what they say, not what they've done.</p>
      )}

      {p.coverage === "objective_only" ? (
        <div className="card warn small">
          <b>Objective info only.</b> We couldn't find enough sourced evidence to analyze this
          candidate's positions. That's not a judgment about them — look them up after unmasking, or
          check their questionnaire responses.
        </div>
      ) : (
        <>
          <h4>Platform highlights</h4>
          <Sentences items={p.platformHighlights} empty="No highlights passed citation checks." />

          <h4>Evidence by issue</h4>
          {p.evidence.length === 0 ? (
            <p className="muted small">None.</p>
          ) : (
            <ul className="plain evidence">
              {p.evidence.map((e) => (
                <li key={e.id}>
                  <span className="eyebrow">
                    {issueLabel(e.issueId)} · {e.kind === "action" ? "Action" : "Words"} ·{" "}
                    {e.sourceType.replace("_", " ")} · {e.date}
                  </span>
                  <blockquote>
                    {e.redacted ? "[redacted] " : "“"}
                    {e.excerpt}
                    {e.redacted ? "" : "”"}
                  </blockquote>
                </li>
              ))}
            </ul>
          )}

          <h4>Plan explorer</h4>
          {p.plans.length === 0 ? (
            <p className="muted small">No plans documented.</p>
          ) : (
            p.plans.map((plan) => (
              <table key={plan.id} className="table plan">
                <caption>{issueLabel(plan.issueId)}</caption>
                <tbody>
                  {(
                    [
                      ["Goal", plan.goal],
                      ["Mechanism", plan.mechanism],
                      ["Cost", plan.cost],
                      ["Funding", plan.funding],
                      ["Timeline", plan.timeline],
                      ["Who acts", plan.whoActs],
                    ] as const
                  ).map(([label, slot]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>
                        <SlotView slot={slot} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))
          )}

          <Meter
            value={p.specificity.score}
            label={`Plan specificity: ${tierText[p.specificity.tier]}`}
          />
          <p className="small muted">
            How much plan detail is documented — not whether it's true or doable.
          </p>

          <h4>Credibility checks</h4>
          {p.credibility.flags.length === 0 ? (
            <p className="muted small">No flags.</p>
          ) : (
            <ul className="plain">
              {p.credibility.flags.map((f, i) => (
                <li key={i}>
                  {flagText[f.type]} <span className="muted">({issueLabel(f.issueId)})</span>
                </li>
              ))}
            </ul>
          )}

          <h4>Says vs. does</h4>
          {p.saysVsDoes.length === 0 ? (
            <p className="muted small">Not enough evidence on both sides to compare.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Says</th>
                  <th>Does</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {p.saysVsDoes.map((s) => (
                  <tr key={s.issueId}>
                    <td>{issueLabel(s.issueId)}</td>
                    <td>{s.says?.toFixed(2) ?? "—"}</td>
                    <td>{s.does?.toFixed(2) ?? "—"}</td>
                    <td>{s.gap.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4>Promises (prior office)</h4>
          {p.promiseKept.length === 0 ? (
            <p className="muted small">None tracked.</p>
          ) : (
            <ul className="plain">
              {p.promiseKept.map((pr, i) => (
                <li key={i}>
                  {promiseText[pr.status]} — <Sentences items={pr.promise} />
                </li>
              ))}
            </ul>
          )}

          <h4>Fact-checks</h4>
          {p.truthfulness.factChecks.length === 0 ? (
            <p className="muted small">
              No IFCN fact-checks found. Coverage is uneven across candidates.
            </p>
          ) : (
            <ul className="plain">
              {p.truthfulness.factChecks.map((f, i) => (
                <li key={i}>
                  {f.outlet}: <b>{f.rating}</b> — <Sentences items={f.claim} />
                </li>
              ))}
            </ul>
          )}

          {p.bipartisanship && (
            <>
              <h4>
                {p.bipartisanship.label === "bipartisanship"
                  ? "Bipartisanship"
                  : "Coalition breadth"}
              </h4>
              {p.bipartisanship.composite !== undefined && (
                <Meter value={p.bipartisanship.composite} label="Composite" />
              )}
            </>
          )}

          <h4>Follow the money</h4>
          <MoneyView funding={p.funding} />
        </>
      )}

      <Collapsible title="Alignment with your choices (secondary)">
        {match ? <AlignmentView m={match} /> : <p className="muted small">Not computed.</p>}
      </Collapsible>
    </article>
  );
}

function AlignmentView({ m }: { m: MatchResult }) {
  const bucket: Bucket = m.matchClarity === 0 ? "clouded" : m.bucket;
  return (
    <div className="small">
      <p>
        <b>{bucketText[bucket]}</b>
      </p>
      <p className="muted">
        Issues compared: {m.issuesCompared} (need ≥3 for a clear read) · agreements{" "}
        {m.agreements.length} · disagreements {m.disagreements.length}
      </p>
      <Meter value={m.matchClarity} label="Match clarity" />
      <p className="muted">This is a navigation aid, not a recommendation.</p>
    </div>
  );
}

const fmt = (r: MoneyRange) =>
  r.min === r.max
    ? `$${r.min.toLocaleString()}`
    : `$${r.min.toLocaleString()}–$${r.max.toLocaleString()}`;

function MoneyView({ funding }: { funding?: FundingMap }) {
  if (!funding)
    return (
      <p className="muted small">
        No filings in this release. Missing filings are not the same as $0.
      </p>
    );
  const dark = computeDarkShareInterval(funding);
  return (
    <table className="table small">
      <tbody>
        <tr>
          <th>Direct receipts</th>
          <td>{fmt(funding.direct)}</td>
        </tr>
        <tr>
          <th>Small unitemized (not dark money)</th>
          <td>{fmt(funding.traced.receipts.unitemizedSmall)}</td>
        </tr>
        <tr>
          <th>Outside spending</th>
          <td>{fmt(funding.outside)}</td>
        </tr>
        <tr>
          <th>Dark share of outside spending</th>
          <td>
            {dark
              ? `${Math.round(dark.min * 100)}%${dark.max !== undefined ? `–${Math.round(dark.max * 100)}%` : "+"}`
              : "n/a"}
          </td>
        </tr>
        {funding.topIndustries.map((t) => (
          <tr key={t.industry}>
            <th>{t.industry} (inferred)</th>
            <td>{fmt(t.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Measure ──────────────────────────────────────────────────────────────────

function MeasureView({ contest }: { contest: Contest }) {
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
        <blockquote className="ballot-text">{m.ballotText.text}</blockquote>
      </Section>
      <Section title="What your vote does">
        <div className="brief">
          <div className="brief-col">
            <h3>A YES vote</h3>
            <SlotView slot={m.yesMeans} />
          </div>
          <div className="brief-col">
            <h3>A NO vote</h3>
            <SlotView slot={m.noMeans} />
          </div>
        </div>
      </Section>
      <Section title="Cost">
        {m.fiscal ? (
          <ul className="plain">
            {m.fiscal.principal !== undefined && (
              <li>Principal: ${m.fiscal.principal.toLocaleString()}</li>
            )}
            <li>
              Interest:{" "}
              {m.fiscal.interest !== undefined ? (
                `$${m.fiscal.interest.toLocaleString()}`
              ) : (
                <span className="bad">Unknown</span>
              )}
            </li>
            <li>
              Tax impact:{" "}
              {m.fiscal.taxImpact ? (
                <Sentences items={m.fiscal.taxImpact} />
              ) : (
                <span className="bad">Unknown</span>
              )}
            </li>
          </ul>
        ) : (
          <p className="bad">No verified fiscal figures.</p>
        )}
      </Section>
      <Section title="Who's funding each side">
        <div className="brief">
          <div className="brief-col">
            <h3>YES campaign</h3>
            <MoneyView funding={m.funding?.yes} />
          </div>
          <div className="brief-col">
            <h3>NO campaign</h3>
            <MoneyView funding={m.funding?.no} />
          </div>
        </div>
      </Section>
      <Collapsible title="How this connects to your choices (max 2, never a recommendation)">
        {connections.length === 0 ? (
          <p className="muted small">No connections passed our checks for this measure.</p>
        ) : (
          <ul className="plain small">
            {connections.map((c) => (
              <li key={c.cardId}>
                {issueLabel(c.issueId)}: you leaned {c.userPosition.toFixed(2)}, the measure's
                effect is {c.measureEffect.toFixed(2)}.
              </li>
            ))}
          </ul>
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

function JudicialView({ contest }: { contest: Contest }) {
  const { state, userVector, go } = useApp();
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
        <p className="card warn small">
          You haven't done the judicial deck yet.{" "}
          <button className="link" onClick={() => go({ name: "deck", deck: "judicial" })}>
            Do it now
          </button>
        </p>
      )}
      <div className="cand-grid">
        {ordered.map((p) => {
          const res = comparison.results.find((r) => r.candidateId === p.id);
          const jp = p.judicialProfile;
          return (
            <article key={p.id} className="card cand">
              <header className="cand-head">
                <h3>{displayName(state, contest.id, p.id)}</h3>
                <EvidenceTag state={p.evidenceState} />
              </header>
              <table className="table small">
                <tbody>
                  <tr>
                    <th>Status</th>
                    <td>{p.incumbent ? "Incumbent" : "Challenger"}</td>
                  </tr>
                  <tr>
                    <th>Years of experience</th>
                    <td>{jp?.experienceYears ?? "Unknown"}</td>
                  </tr>
                  <tr>
                    <th>Board certified</th>
                    <td>
                      {jp?.boardCertified === undefined
                        ? "Unknown"
                        : jp.boardCertified
                          ? "Yes"
                          : "No"}
                    </td>
                  </tr>
                  <tr>
                    <th>Austin Bar poll</th>
                    <td>{jp?.barPoll ? JSON.stringify(jp.barPoll.summary) : "Not available"}</td>
                  </tr>
                  <tr>
                    <th>Court stats</th>
                    <td>
                      {jp?.courtStats
                        ? `Clearance ${jp.courtStats.clearanceRate}`
                        : "Not available"}
                    </td>
                  </tr>
                </tbody>
              </table>
              <h4>Philosophy evidence</h4>
              <table className="table small">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Their lean</th>
                    <th>Closeness to you</th>
                  </tr>
                </thead>
                <tbody>
                  {dims.map((d) => {
                    const s = jp?.philosophy[d];
                    const prox = res?.dimensions[d];
                    return (
                      <tr key={d}>
                        <td>{issueLabel(`judicial.${d}`)}</td>
                        <td>
                          {s
                            ? `${s.position.toFixed(2)} (strength ${Math.round(s.evidenceStrength * 100)}%)`
                            : "No evidence"}
                        </td>
                        <td>{prox ? `${Math.round(prox.proximity * 100)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

// ── The user's own decision (on-device only) ─────────────────────────────────

function PickBox({ contest }: { contest: Contest }) {
  const { state, dispatch } = useApp();
  const current = state.picks[contest.id];
  const options: { value: Pick; label: string }[] = contest.measure
    ? [
        { value: "yes", label: "YES" },
        { value: "no", label: "NO" },
      ]
    : state.order[contest.id].map((cid) => ({
        value: cid,
        label: displayName(state, contest.id, cid),
      }));
  options.push({ value: "undecided", label: "Still deciding" });

  return (
    <Section title="Your call" note="Saved only on this device. You can change it any time.">
      <div className="row" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={current === o.value}
            className={current === o.value ? "choice on" : "choice"}
            onClick={() => dispatch({ type: "pick", contestId: contest.id, pick: o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  );
}
