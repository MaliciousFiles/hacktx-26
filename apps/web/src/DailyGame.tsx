import { useEffect, useState } from "react";
import { dailyRounds, readProgress, resultGrid, utcDay } from "./game";

export function DailyGame() {
  const [day, setDay] = useState(utcDay);
  useEffect(() => { const timer = setInterval(() => setDay(utcDay()), 30000); return () => clearInterval(timer); }, []);
  return <Game key={day} day={day} />;
}

function Game({ day }: { day: string }) {
  const rounds = dailyRounds(day);
  const key = `wishing-well-quote-v1:${day}`;
  const [answers, setAnswers] = useState<number[]>(() => {
    try { return readProgress(localStorage.getItem(key)); } catch { return []; }
  });
  const [index, setIndex] = useState(() => Math.min(answers.length, 3));
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const done = index === 3;
  const round = rounds[index];
  const checked = answers[index] != null;
  const score = answers.filter((answer, i) => answer === rounds[i]?.answer).length;
  const url = new URL(window.location.href); url.search = ""; url.hash = "daily";
  const result = `Wishing Well · Match the Quote\n${day} · ${score}/3\n${resultGrid(rounds, answers)}\nFictional practice. Real curiosity.\n${url}`;
  const submit = () => {
    if (selected == null || checked) return;
    const next = [...answers, selected]; setAnswers(next);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { setStorageNote("Progress is kept for this visit only; this browser could not save it."); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Wishing Well daily game", text: result });
      else { await navigator.clipboard.writeText(result); setNote("Result copied. Share it with a friend—no answers included."); }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setNote("Select and copy your result below to share it.");
    }
  };

  return <section className="game-section">
    <div className="game-heading"><img src="/wishing-well-logo.png" width="90" height="90" alt="" /><p className="eyebrow">The daily dip · {day} UTC</p><h1>Match the Quote</h1><p className="intro">Three quotes. Three chances to look closer.<br />Match each quote to the plan it describes.</p><span className="badge">Fictional practice · no real candidates</span></div>
    <div className="game-progress" aria-label={`${answers.length} of 3 questions answered`}>
      {rounds.map((item, i) => <span key={item.id} className={i < answers.length ? "complete" : ""}>{i + 1}</span>)}
    </div>
    {done ? <div className="game-card result-card">
      <p className="eyebrow">Today’s practice, complete</p><h2>{score === 3 ? "A keen eye for detail." : "Every detail is worth a look."}</h2>
      <div className="result-grid" aria-label={`${score} of 3 correct`}>{resultGrid(rounds, answers)}</div><p>You matched {score} of 3 quotes. This is reading practice, not a measure of your political views.</p>
      <button onClick={() => void share()}>Share my result ↗</button>
      <p role="status" className="status">{note}</p>
      <details><summary>Copyable result</summary><textarea readOnly aria-label="Game result to copy" value={result} rows={6} onFocus={(event) => event.target.select()} /></details>
      <details><summary>Review the explanations</summary>{rounds.map((item, i) => <article key={item.id} className="review"><h3>{i + 1}. {item.topic}</h3><blockquote>“{item.quote}”</blockquote><p><strong>Matching plan:</strong> {item.plans[item.answer]}</p><p>{item.explanation}</p></article>)}</details>
      <p className="fine-print">New daily selection at midnight UTC. This prototype rotates an authored set of fictional examples.</p>
      <a className="text-link" href="#invite">Invite a friend to prepare their ballot →</a>
    </div> : round ? <div className="game-card" key={round.id}>
      <p className="eyebrow">Quote {index + 1} of 3 · {round.topic}</p>
      <blockquote className="daily-quote">“{round.quote}”</blockquote>
      <fieldset disabled={checked}><legend>Which plan does this quote describe?</legend>{round.plans.map((plan, i) => <label className={`game-option ${selected === i ? "selected" : ""} ${checked && i === round.answer ? "correct" : ""}`} key={plan}>
        <input type="radio" name={round.id} value={i} checked={(checked ? answers[index] : selected) === i} onChange={() => setSelected(i)} />
        <span className="option-letter">{String.fromCharCode(65 + i)}</span><span>{plan}</span>
        {checked && i === round.answer && <strong className="answer-tag">Match</strong>}
      </label>)}</fieldset>
      {checked ? <div className="feedback" role="status"><h3>{answers[index] === round.answer ? "That’s the match." : "Here’s the distinction."}</h3><p>{round.explanation}</p><button onClick={() => { setIndex(index + 1); setSelected(null); }}>{index === 2 ? "See my result" : "Next quote →"}</button></div> : <button className="wide" disabled={selected == null} onClick={submit}>Check my answer</button>}
    </div> : null}
    {storageNote && <p role="status" className="note">{storageNote}</p>}
    <p className="game-footnote">These examples are written for the game, not quotes from public figures. We never use your ballot or answers here. Today’s progress stays in this browser.</p>
  </section>;
}
