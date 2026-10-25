export type Round = { id: string; topic: string; quote: string; plans: string[]; answer: number; explanation: string };

// Authored fictional examples. Never uses a player's ballot, candidates, or answers.
const BANK: Round[] = [
  { id: "bus", topic: "Getting around", quote: "We would use parking-fee revenue to run buses every ten minutes on the busiest routes.", plans: ["Fund more frequent buses with parking fees.", "Reduce parking fees and keep current bus schedules.", "Build new cycle lanes using a construction bond."], answer: 0, explanation: "The quote names both a service change (ten-minute buses) and a funding source (parking fees). That matches the first plan, regardless of whether you agree with it." },
  { id: "homes", topic: "A place to live", quote: "Let homeowners add a small second home on their lot without changing the main house.", plans: ["Build publicly owned apartments on city land.", "Allow accessory homes on existing residential lots.", "Limit new construction to downtown high-rises."], answer: 1, explanation: "A second home on an existing lot is an accessory home. The quote does not describe public construction or a downtown-only policy." },
  { id: "water", topic: "Every drop counts", quote: "Our first priority is replacing leaking mains, paid for through a five-year increase in water rates.", plans: ["Lower water bills by postponing maintenance.", "Offer rebates for household rainwater tanks.", "Repair water pipes using a phased rate increase."], answer: 2, explanation: "The proposal links pipe repairs to higher water rates over five years. Naming the cost helps readers evaluate the tradeoff; it does not prove the plan will succeed." },
  { id: "library", topic: "Open doors", quote: "Keep branch libraries open on Sundays by moving staff hours from quieter weekday mornings.", plans: ["Shift existing staff schedules to add Sunday hours.", "Hire additional librarians using a new levy.", "Replace weekend library hours with an online service."], answer: 0, explanation: "The quote reallocates existing staff time. It does not promise new hires or extra funding. A useful follow-up is which weekday services would lose hours." },
  { id: "parks", topic: "Room to play", quote: "Before adding another park, we should repair the playgrounds and paths we already have.", plans: ["Acquire land for three new parks.", "Prioritize maintenance of existing parks.", "Replace playgrounds with parking spaces."], answer: 1, explanation: "The speaker prioritizes maintenance over expansion. Funding and a completion timeline are not stated, so neither should be assumed." },
  { id: "energy", topic: "Powering the town", quote: "Install solar panels on municipal buildings through a loan repaid from the electricity savings.", plans: ["Offer residents a rebate for private solar panels.", "Buy all municipal electricity from a new gas plant.", "Finance public-building solar with a savings-backed loan."], answer: 2, explanation: "The quote identifies the buildings, technology, and financing mechanism. Whether the savings can repay the loan would still need evidence." },
  { id: "streets", topic: "Safer crossings", quote: "Use the existing street-safety budget to install raised crossings outside elementary schools this summer.", plans: ["Add school crossings using an existing safety budget.", "Widen highways using a new bond.", "Reduce school-zone restrictions."], answer: 0, explanation: "The quote states an action, funding source and timeline. Those details help you ask specific follow-up questions rather than relying on a slogan." },
  { id: "waste", topic: "Less to landfill", quote: "Start a food-scrap pickup trial in two neighborhoods, then publish the costs before expanding.", plans: ["Mandate citywide compost pickup immediately.", "Test compost pickup locally before deciding on expansion.", "Stop residential recycling collections."], answer: 1, explanation: "This is a limited trial with a later decision. It would be misleading to describe it as an immediate citywide commitment." },
  { id: "budget", topic: "Following the money", quote: "Publish every department’s spending each month in a searchable public dashboard.", plans: ["Cut every department’s spending by the same percentage.", "Publish only an annual summary of total spending.", "Provide detailed monthly public spending reports."], answer: 2, explanation: "The promise concerns transparency and reporting frequency. It says nothing about cutting spending or balancing the budget." },
];

export function utcDay(now = new Date()): string { return now.toISOString().slice(0, 10); }

export function dailyRounds(day: string): Round[] {
  let seed = [...day].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 7);
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const shuffled = [...BANK];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = next() % (i + 1); [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]; }
  return shuffled.slice(0, 3).map((round) => {
    const indices = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = next() % (i + 1); [indices[i], indices[j]] = [indices[j]!, indices[i]!]; }
    return { ...round, plans: indices.map((index) => round.plans[index]!), answer: indices.indexOf(round.answer), explanation: round.explanation.replace("the first plan", "the matching plan") };
  });
}

export function readProgress(raw: string | null): number[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(parsed) && parsed.length <= 3 && parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 2) ? parsed : [];
  } catch { return []; }
}

export function resultGrid(rounds: Round[], answers: number[]): string {
  return rounds.map((round, index) => answers[index] == null ? "⬜" : answers[index] === round.answer ? "🟩" : "🟨").join("");
}
