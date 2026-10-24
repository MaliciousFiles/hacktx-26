// How it works + correction path (Invariants 19, 21).
import { useState } from "react";
import { Page, Section } from "../components";
import { contestById, release } from "../data";
import { useApp } from "../state";

export function HowItWorks() {
  const r = release.release;
  return (
    <Page title="How it works" sub="Sources, methods and limits.">
      <Section title="This data release">
        <table className="table small">
          <tbody>
            <tr>
              <th>Release</th>
              <td>{r.id}</td>
            </tr>
            <tr>
              <th>As of</th>
              <td>{r.asOfDate}</td>
            </tr>
            <tr>
              <th>Manifest hash</th>
              <td>
                <code>{r.manifestHash}</code>
              </td>
            </tr>
            {Object.entries({ ...r.configVersions, ...r.modelVersions }).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Where evidence comes from">
        <ul className="plain">
          <li>Official records: votes, bills, orders, opinions, meeting minutes.</li>
          <li>Candidate questionnaires, debates, campaign sites, social posts.</li>
          <li>News from a published outlet allowlist. Syndicated copies count once.</li>
          <li>Money: FEC, TEC, Austin City Clerk, ad libraries. Ranges stay ranges.</li>
          <li>Fact-checks from IFCN signatories only, shown individually.</li>
        </ul>
      </Section>
      <Section title="Rules we hold ourselves to">
        <ul className="plain">
          <li>Every generated sentence cites a source, or it's dropped.</li>
          <li>
            Quotes are exact. No AI runs while you use the app; everything is from a frozen release.
          </li>
          <li>Party never enters matching. Matching runs on your device.</li>
          <li>Every candidate in a contest gets the same searches, caps and review.</li>
          <li>Thin evidence means we show objective info and step back.</li>
          <li>Alignment is never a recommendation. Judges are never scored on policy.</li>
        </ul>
      </Section>
      <Section title="Why plan specificity is shown">
        <p className="muted">
          Placeholder: historical follow-through rates appear here only if the preregistered
          analysis passes its gates. Otherwise this explains the metric without a numerical claim.
        </p>
      </Section>
    </Page>
  );
}

export function Report({ contestId }: { contestId?: string }) {
  const { go } = useApp();
  const [sent, setSent] = useState(false);
  const contest = contestId ? contestById(contestId) : undefined;
  if (sent)
    return (
      <Page title="Thanks">
        <p>
          A reviewer checks every report against evidence. Corrections ship as a new data release
          with a public change note.
        </p>
        <button className="primary" onClick={() => go({ name: "ballot" })}>
          Back to ballot
        </button>
      </Page>
    );
  return (
    <Page title="Report an error" sub="Candidates and voters use the same form and review process.">
      <div className="card">
        <p className="small">
          Release <code>{release.release.id}</code>
          {contest && (
            <>
              {" "}
              · Contest <code>{contest.id}</code> ({contest.title})
            </>
          )}
        </p>
        <label>
          What's wrong?
          <textarea rows={4} />
        </label>
        <label>
          Link to evidence (optional)
          <input placeholder="https://…" />
        </label>
        <p className="small muted">Your swipes and picks are not included.</p>
        <button className="primary" onClick={() => setSent(true)}>
          Send report
        </button>
      </div>
    </Page>
  );
}
