// Small presentational building blocks shared across mockup screens.
import { useState, type ReactNode } from "react";
import type { CitedSentence, EvidenceRef, EvidenceState, Slot } from "@ftb/types";
import { citationFor, release } from "./data";
import { useApp } from "./state";

export function Page({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <main className="page">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
      {children}
    </main>
  );
}

export function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      {children}
    </section>
  );
}

export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="collapsible">
      <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

/** One generated sentence plus its citations. Pre-reveal there is no source URL. */
export function Cited({ s }: { s: CitedSentence }) {
  return (
    <span className="cited">
      {s.text}
      {s.citations.map((ref, i) => (
        <CiteChip key={i} r={ref} n={i + 1} />
      ))}
    </span>
  );
}

function CiteChip({ r, n }: { r: EvidenceRef; n: number }) {
  const cite = citationFor(r);
  const title =
    r.kind === "candidate"
      ? `Evidence ${r.id} (candidate record, link held until reveal)`
      : `${cite?.outlet ?? "Source"} · ${cite?.sourceId ?? r.id} · excerpt: ${cite?.excerpt ?? "—"}`;
  return (
    <sup className="cite" title={title}>
      [{n}]
    </sup>
  );
}

export function Sentences({ items, empty }: { items: CitedSentence[]; empty?: string }) {
  if (items.length === 0) return <p className="muted">{empty ?? "None found."}</p>;
  return (
    <ul className="plain">
      {items.map((s, i) => (
        <li key={i}>
          <Cited s={s} />
        </li>
      ))}
    </ul>
  );
}

export function SlotView({ slot }: { slot: Slot }) {
  if (slot.state === "not_stated") return <span className="bad">Not stated</span>;
  if (slot.state === "not_applicable")
    return (
      <span className="muted">
        Not applicable — <Cited s={slot.reason} />
      </span>
    );
  return (
    <>
      {slot.sentences.map((s, i) => (
        <Cited key={i} s={s} />
      ))}
    </>
  );
}

const evidenceText: Record<EvidenceState, string> = {
  sufficient: "Sufficient evidence",
  thin: "Thin evidence",
  none: "No evidence",
};

export function EvidenceTag({ state }: { state: EvidenceState }) {
  return <span className={`tag tag-${state}`}>{evidenceText[state]}</span>;
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter" aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <div className="meter-label small">
        {label} <span className="muted">{Math.round(value * 100)}%</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function Nav() {
  const { state, go, dispatch } = useApp();
  const started = state.screen.name !== "welcome";
  return (
    <header className="nav">
      <button className="brand link" onClick={() => go({ name: "welcome" })}>
        Ballot mockup
      </button>
      {started && (
        <nav>
          {state.history.length > 0 && (
            <button className="link" onClick={() => dispatch({ type: "back" })}>
              ← Back
            </button>
          )}
          {state.ballotStyleId && (
            <button className="link" onClick={() => go({ name: "ballot" })}>
              My ballot
            </button>
          )}
          <button className="link" onClick={() => go({ name: "daily" })}>
            Daily
          </button>
          <button className="link" onClick={() => go({ name: "how" })}>
            How it works
          </button>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { go } = useApp();
  return (
    <footer className="footer small muted">
      Nonpartisan: we do not endorse candidates or measures. Data release{" "}
      <code>{release.release.id}</code> as of {release.release.asOfDate}.{" "}
      <button className="link" onClick={() => go({ name: "report" })}>
        Report an error
      </button>
      <br />
      MOCKUP — fixture data, not real candidate analysis.
    </footer>
  );
}
