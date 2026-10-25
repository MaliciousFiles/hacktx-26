import { useEffect, useState } from "react";
import { DailyGame } from "./DailyGame";
import { ShareCard } from "./ShareCard";
import { readInvite } from "./sharing";
import "./App.css";

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const change = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const daily = hash.startsWith("#daily");
  const invite = readInvite(hash);
  const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
  const safeAppUrl = appUrl && /^(https?:\/\/|exp:\/\/|exps:\/\/)/.test(appUrl) ? appUrl : undefined;

  return <>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="site-header">
      <a href="#" className="brand"><img src="/wishing-well-logo.png" alt="" width="44" height="44" />Wishing Well</a>
      <nav aria-label="Main navigation">
        <a href="#invite" aria-current={!daily ? "page" : undefined}>Invite a friend</a>
        <a href="#daily" aria-current={daily ? "page" : undefined}>Daily game</a>
      </nav>
    </header>
    <main id="content">
      {daily ? <DailyGame /> : <>
        <section className="hero">
          <p className="eyebrow">A little curiosity. A more informed ballot.</p>
          <h1>Make a wish.<br /><em>Know your choice.</em></h1>
          <p className="intro">Good decisions start with a closer look. Explore what matters to you,
            compare the evidence, then discover the names behind the plans.</p>
          <div className="actions centered">
            {safeAppUrl ? <a className="button" href={safeAppUrl}>Open Wishing Well ↗</a> : <a className="button" href="#daily">Try the daily game →</a>}
            <a className="button secondary" href="#how-it-works">How it works</a>
          </div>
        </section>
        <ShareCard key={hash} invite={invite} />
        <section className="how-section" id="how-it-works">
          <p className="eyebrow">Curiosity before conclusions</p>
          <h2>Your vote. Your judgment.</h2>
          <div className="steps">
            <article><span className="step-number">01</span><h3>Explore your priorities</h3><p>Answer questions about issues that matter to you. Skipping is always fine.</p></article>
            <article><span className="step-number">02</span><h3>Read the evidence</h3><p>Compare plans and records before names and parties. Missing evidence is labeled.</p></article>
            <article><span className="step-number">03</span><h3>Make your own choice</h3><p>Reveal the names when you are ready. We never recommend who to vote for.</p></article>
          </div>
          {!safeAppUrl && <p className="note">The ballot walkthrough is currently an Expo Go demo. This website has the share cards and daily game; ask the team for the app QR code.</p>}
        </section>
      </>}
    </main>
    <footer className="site-footer"><span>✦ Wishing Well</span><p>Nonpartisan. No candidate endorsements. Your choice stays yours.</p><a href="#daily">A little practice, every day →</a></footer>
  </>;
}
