// How it works: release info, sources, rules (Invariants 19, 21).
import { release } from "../mockup/data";
import { KV, Muted, P, Screen, Section } from "../mockup/ui";

export default function HowItWorks() {
  const r = release.release;
  return (
    <Screen title="How it works" sub="Sources, methods and limits.">
      <Section title="This data release">
        <KV
          rows={[
            ["Release", r.id],
            ["As of", r.asOfDate],
            ["Manifest hash", r.manifestHash],
            ...Object.entries({ ...r.configVersions, ...r.modelVersions }),
          ]}
        />
      </Section>
      <Section title="Where evidence comes from">
        <P>• Official records: votes, bills, orders, opinions, meeting minutes.</P>
        <P>• Candidate questionnaires, debates, campaign sites, social posts.</P>
        <P>• News from a published outlet allowlist. Syndicated copies count once.</P>
        <P>• Money: FEC, TEC, Austin City Clerk, ad libraries. Ranges stay ranges.</P>
        <P>• Fact-checks from IFCN signatories only, shown individually.</P>
      </Section>
      <Section title="Rules we hold ourselves to">
        <P>• Every generated sentence cites a source, or it's dropped.</P>
        <P>
          • Quotes are exact. No AI runs while you use the app; everything comes from a frozen
          release.
        </P>
        <P>• Party never enters matching. Matching runs on your phone.</P>
        <P>• Every candidate in a contest gets the same searches, caps and review.</P>
        <P>• Thin evidence means we show objective info and step back.</P>
        <P>• Alignment is never a recommendation. Judges are never scored on policy.</P>
      </Section>
      <Section title="Why plan specificity is shown">
        <Muted>
          Placeholder: historical follow-through rates appear here only if the preregistered
          analysis passes its gates. Otherwise this explains the metric without a numerical claim.
        </Muted>
      </Section>
    </Screen>
  );
}
