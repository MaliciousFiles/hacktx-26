// "Fact or Fairy Tale?": a swipe game of odd, true-or-false civic trivia. Nothing here touches
// the player's ballot, picks or answers, and no card is about a candidate or a policy opinion.
export type CardIcon =
  | "house"
  | "scroll"
  | "gavel"
  | "scale"
  | "star"
  | "book"
  | "coins"
  | "calendar"
  | "check"
  | "mask"
  | "info"
  | "sparkle";

export type FactCard = {
  id: string;
  claim: string;
  /** True: a real fact. False: a fairy tale. */
  fact: boolean;
  /** One short, friendly line shown after the swipe. */
  why: string;
  icon: CardIcon;
};

export const CARDS_PER_DAY = 8;

export const FACT_BANK: FactCard[] = [
  // ---- Facts: Austin, Travis County and Texas ----
  {
    id: "t-bats",
    fact: true,
    icon: "star",
    claim: "Under a downtown Austin bridge lives the largest urban bat colony on Earth.",
    why: "Up to 1.5 million Mexican free-tailed bats roost under the Congress Avenue Bridge each summer.",
  },
  {
    id: "t-xit",
    fact: true,
    icon: "coins",
    claim: "Texas paid for its Capitol with three million acres of Panhandle land.",
    why: "Texas paid in land, not cash. The acres became the giant XIT Ranch.",
  },
  {
    id: "t-capitol",
    fact: true,
    icon: "house",
    claim: "The Texas Capitol is taller than the U.S. Capitol.",
    why: "The star on top stands 302.64 feet up, about 14.6 feet higher than the Capitol in Washington.",
  },
  {
    id: "t-sos",
    fact: true,
    icon: "scroll",
    claim: "In 1992, Austin voters passed their own law to protect Barton Springs.",
    why: "The Save Our Springs ordinance won 64% of the vote on August 8, 1992, and it is still on the books.",
  },
  {
    id: "t-atlarge",
    fact: true,
    icon: "mask",
    claim: "Until 2014, every Austin City Council member was elected citywide.",
    why: "Austin elected its mayor and six council members citywide until voters approved ten districts in 2012. Six earlier tries since 1973 had failed.",
  },
  {
    id: "t-1872",
    fact: true,
    icon: "calendar",
    claim: "Texas voters once had to vote to decide whether Austin stays the capital.",
    why: "In 1872, Austin beat Houston and Waco in a statewide election to keep the job.",
  },
  {
    id: "t-archives",
    fact: true,
    icon: "scroll",
    claim: "Austinites once stopped Sam Houston from hauling the state’s records out of town.",
    why: "In 1842, residents blocked armed men sent to seize the land records. It is now called the Archives War.",
  },
  {
    id: "t-waterloo",
    fact: true,
    icon: "star",
    claim: "Austin started out as a tiny village called Waterloo.",
    why: "The Republic of Texas bought the hamlet in 1839 and renamed it for Stephen F. Austin.",
  },
  {
    id: "t-cemetery",
    fact: true,
    icon: "mask",
    claim:
      "Stephen F. Austin, the city’s namesake, is buried at the Texas State Cemetery in Austin.",
    why: "He died in 1836 and was reburied in Austin in 1910.",
  },
  {
    id: "t-mansion",
    fact: true,
    icon: "house",
    claim: "Austin’s Governor’s Mansion is the oldest governor’s mansion west of the Mississippi.",
    why: "Texas governors have lived there since 1856. It was fully restored after an arson fire in 2008.",
  },
  {
    id: "t-terms",
    fact: true,
    icon: "scale",
    claim: "Austin City Council members are limited to two terms.",
    why: "Voters set two four-year terms in 2012, though a petition can put a third term on the ballot.",
  },
  {
    id: "t-november",
    fact: true,
    icon: "calendar",
    claim: "Austin used to hold its city elections in May.",
    why: "Voters moved them to November of even-numbered years, starting in 2014, so they share the ballot with bigger races.",
  },
  {
    id: "t-salamander",
    fact: true,
    icon: "sparkle",
    claim: "Barton Springs Pool is home to an endangered salamander found nowhere else.",
    why: "The Barton Springs salamander lives only in these springs, which stay cool all year.",
  },
  {
    id: "t-townlake",
    fact: true,
    icon: "star",
    claim: "Lady Bird Lake used to be called Town Lake.",
    why: "Austin’s council renamed it in July 2007, the same month Lady Bird Johnson died.",
  },
  {
    id: "t-travis",
    fact: true,
    icon: "scroll",
    claim: "Travis County is named for the commander of the Alamo.",
    why: "William Barret Travis led the defenders in 1836. He was never a governor.",
  },
  {
    id: "t-corridors",
    fact: true,
    icon: "house",
    claim: "Austin has rules that protect views of the Texas Capitol from tall buildings.",
    why: "The Capitol View Corridors, first enacted in 1983, limit building heights along certain sightlines to the dome.",
  },
  {
    id: "t-pecan",
    fact: true,
    icon: "info",
    claim: "Austin’s famous Sixth Street used to be called Pecan Street.",
    why: "The old name lives on in the Pecan Street Owners Association, which looks after the historic district.",
  },
  {
    id: "t-counties",
    fact: true,
    icon: "star",
    claim: "Travis is just one of 254 Texas counties, more than any other state.",
    why: "Georgia is next with 159.",
  },
  {
    id: "t-party",
    fact: true,
    icon: "mask",
    claim: "In Texas, you don’t register to vote with a political party.",
    why: "Texas has no party registration, so your registration never shows a party.",
  },
  {
    id: "t-preregister",
    fact: true,
    icon: "check",
    claim: "In Texas you can register to vote at 17 years and 10 months old.",
    why: "You just have to turn 18 by Election Day to cast a ballot.",
  },
  {
    id: "t-session",
    fact: true,
    icon: "book",
    claim:
      "The Texas Legislature, based in Austin, holds its regular session only in odd-numbered years.",
    why: "It meets for up to 140 days, every other year.",
  },
  {
    id: "t-judges",
    fact: true,
    icon: "gavel",
    claim: "Texas voters elect many of their judges at the ballot box.",
    why: "That is why court races show up on your Travis County ballot.",
  },
  {
    id: "t-tuesday",
    fact: true,
    icon: "calendar",
    claim: "Federal Election Day always lands on a Tuesday.",
    why: "It is the Tuesday after the first Monday in November, set in 1845.",
  },
  // ---- Fairy tales ----
  {
    id: "f-lake",
    fact: false,
    icon: "star",
    claim: "Lady Bird Lake is a natural lake carved out by the Colorado River.",
    why: "Fairy tale! It is a reservoir, created when Longhorn Dam was finished in 1960.",
  },
  {
    id: "f-bats-capitol",
    fact: false,
    icon: "star",
    claim: "Austin’s famous bats roost inside the Texas Capitol dome.",
    why: "Fairy tale! They live under the Congress Avenue Bridge, a few blocks away.",
  },
  {
    id: "f-capital",
    fact: false,
    icon: "calendar",
    claim: "Austin has been the Texas capital without a break since 1839.",
    why: "Fairy tale! The government moved to Houston and Washington-on-the-Brazos from 1842 to 1845.",
  },
  {
    id: "f-namesake",
    fact: false,
    icon: "mask",
    claim: "Austin is named after the first governor of Texas.",
    why: "Fairy tale! It honors Stephen F. Austin, the ‘Father of Texas,’ who was never governor.",
  },
  {
    id: "f-heated",
    fact: false,
    icon: "sparkle",
    claim: "Barton Springs Pool is heated in the winter.",
    why: "Fairy tale! It is fed by cool underground springs, so it stays chilly year-round.",
  },
  {
    id: "f-paint",
    fact: false,
    icon: "house",
    claim: "The Texas Capitol is pink because it is painted that color.",
    why: "Fairy tale! It is built from Sunset Red granite quarried near Marble Falls.",
  },
  {
    id: "f-cityhall",
    fact: false,
    icon: "house",
    claim: "Austin’s City Council meets inside the Texas Capitol.",
    why: "Fairy tale! The council meets at Austin City Hall.",
  },
  {
    id: "f-mayor",
    fact: false,
    icon: "mask",
    claim: "Austin’s mayor is picked by the City Council.",
    why: "Fairy tale! Austin voters have elected the mayor directly since the early 1970s.",
  },
  {
    id: "f-travis",
    fact: false,
    icon: "scroll",
    claim: "Travis County is named after a Texas governor.",
    why: "Fairy tale! It honors William B. Travis, the Alamo’s commander, who was never governor.",
  },
  {
    id: "f-mansion",
    fact: false,
    icon: "house",
    claim: "Austin’s Governor’s Mansion burned down in 2008 and was never rebuilt.",
    why: "Fairy tale! It was badly damaged by arson, then fully restored.",
  },
  {
    id: "f-governor",
    fact: false,
    icon: "star",
    claim: "Texas elects its governor to a single six-year term.",
    why: "Fairy tale! Texas governors serve four-year terms, with no limit on how many.",
  },
  {
    id: "f-senate",
    fact: false,
    icon: "scroll",
    claim: "U.S. senators serve four-year terms.",
    why: "Fairy tale! Senators serve six years. Representatives serve two.",
  },
  {
    id: "f-holiday",
    fact: false,
    icon: "calendar",
    claim: "Election Day is a federal holiday.",
    why: "Fairy tale! Some workplaces and schools close, but it is not a federal holiday.",
  },
  {
    id: "f-sticker",
    fact: false,
    icon: "sparkle",
    claim: "‘I Voted’ stickers are required by federal law.",
    why: "Fairy tale! The stickers are a friendly tradition, not a law.",
  },
  {
    id: "f-popular",
    fact: false,
    icon: "scale",
    claim: "The U.S. president is chosen by one nationwide popular vote.",
    why: "Fairy tale! The Electoral College decides it, state by state.",
  },
  {
    id: "f-property",
    fact: false,
    icon: "coins",
    claim: "You must own property to vote in Texas.",
    why: "Fairy tale! Owning property has nothing to do with voting rights.",
  },
  {
    id: "f-counties",
    fact: false,
    icon: "star",
    claim: "Texas has about 100 counties.",
    why: "Fairy tale! It has 254, the most of any state.",
  },
  {
    id: "f-senate31",
    fact: false,
    icon: "book",
    claim: "The Texas Senate has 150 members.",
    why: "Fairy tale! It has 31. The Texas House has 150.",
  },
  {
    id: "f-annual",
    fact: false,
    icon: "book",
    claim: "The Texas Legislature holds a regular session every year.",
    why: "Fairy tale! Regular sessions come every other year.",
  },
];

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A tiny seeded generator so everyone gets the same cards on the same UTC day. */
function seeded(day: string): () => number {
  let seed = [...day].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 7);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Half facts, half fairy tales, in a shuffled order. Same for everyone on the same day. */
export function dailyCards(day: string): FactCard[] {
  const next = seeded(day);
  const half = CARDS_PER_DAY / 2;
  const facts = shuffled(
    FACT_BANK.filter((card) => card.fact),
    next,
  ).slice(0, half);
  const tales = shuffled(
    FACT_BANK.filter((card) => !card.fact),
    next,
  ).slice(0, half);
  return shuffled([...facts, ...tales], next);
}

/** Saved swipes: `true` means "Fact", `false` means "Fairy tale". Bad data starts the day over. */
export function readAnswers(raw: string | null): boolean[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(parsed) &&
      parsed.length <= CARDS_PER_DAY &&
      parsed.every((value) => typeof value === "boolean")
      ? (parsed as boolean[])
      : [];
  } catch {
    return [];
  }
}

export function scoreOf(cards: readonly FactCard[], answers: readonly boolean[]): number {
  return answers.filter((answer, i) => answer === cards[i]?.fact).length;
}

/** The share grid: green for right, yellow for wrong, white for not yet. */
export function resultGrid(cards: readonly FactCard[], answers: readonly boolean[]): string {
  return cards
    .map((card, i) => (answers[i] == null ? "⬜" : answers[i] === card.fact ? "🟩" : "🟨"))
    .join("");
}

export function rankTitle(score: number, total: number): string {
  const share = total === 0 ? 0 : score / total;
  if (share === 1) return "Royal Historian";
  if (share >= 0.75) return "Court Scholar";
  if (share >= 0.5) return "Village Storyteller";
  return "Frog in Waiting";
}

/** Longest run of right answers so far. */
export function bestStreak(cards: readonly FactCard[], answers: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  answers.forEach((answer, i) => {
    run = answer === cards[i]?.fact ? run + 1 : 0;
    best = Math.max(best, run);
  });
  return best;
}
