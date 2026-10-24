// App state for the mockup. Everything here is on-device only (Invariant 5):
// swipes, picks and the mask session never leave this module.
import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { CandidateIdentity, IssueId, MaskSession, Swipe, UserVector } from "@ftb/types";
import { computeUserVector } from "@ftb/types/scoring";
import { newMaskSession, release, shuffle } from "./data";

export type Screen =
  | { name: "welcome" }
  | { name: "lookup" }
  | { name: "ballot" }
  | { name: "deck"; deck: "policy" | "judicial" }
  | { name: "contest"; id: string }
  | { name: "unmask" }
  | { name: "share" }
  | { name: "daily" }
  | { name: "how" }
  | { name: "report"; contestId?: string };

/** A candidate id, a measure side, or explicitly undecided. Stays on device. */
export type Pick = string | "yes" | "no" | "undecided";

export interface State {
  screen: Screen;
  history: Screen[];
  ballotStyleId?: string;
  swipes: Record<string, Swipe>;
  picks: Record<string, Pick>;
  visited: string[];
  masks: MaskSession;
  /** Randomized default candidate order per contest (Invariant 15). */
  order: Record<string, string[]>;
  /** Randomized pole side per card (A/B display order). */
  flipped: Record<string, boolean>;
  revealed: Record<string, CandidateIdentity[]>;
}

type Action =
  | { type: "go"; screen: Screen }
  | { type: "back" }
  | { type: "setBallotStyle"; id: string }
  | { type: "swipe"; swipe: Swipe }
  | { type: "pick"; contestId: string; pick: Pick }
  | { type: "reveal"; contestId: string; identities: CandidateIdentity[] }
  | { type: "reset" };

function initial(): State {
  const order: Record<string, string[]> = {};
  for (const c of release.contests) order[c.id] = shuffle(c.candidateIds);
  const flipped: Record<string, boolean> = {};
  for (const card of release.cards) flipped[card.id] = shuffle([true, false])[0];
  return {
    screen: { name: "welcome" },
    history: [],
    swipes: {},
    picks: {},
    visited: [],
    masks: newMaskSession(),
    order,
    flipped,
    revealed: {},
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "go": {
      const visited =
        a.screen.name === "contest" && !s.visited.includes(a.screen.id)
          ? [...s.visited, a.screen.id]
          : s.visited;
      window.scrollTo(0, 0);
      return { ...s, screen: a.screen, history: [...s.history, s.screen], visited };
    }
    case "back": {
      const prev = s.history.at(-1);
      return prev ? { ...s, screen: prev, history: s.history.slice(0, -1) } : s;
    }
    case "setBallotStyle":
      return { ...s, ballotStyleId: a.id };
    case "swipe":
      return { ...s, swipes: { ...s.swipes, [a.swipe.cardId]: a.swipe } };
    case "pick":
      return { ...s, picks: { ...s.picks, [a.contestId]: a.pick } };
    case "reveal": {
      // Masks for this contest are destroyed on reveal.
      const map = { ...s.masks.map };
      for (const ident of a.identities) delete map[ident.id];
      return {
        ...s,
        masks: { ...s.masks, map },
        revealed: { ...s.revealed, [a.contestId]: a.identities },
      };
    }
    case "reset":
      return initial();
  }
}

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  go: (screen: Screen) => void;
  userVector: UserVector;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  const userVector = useMemo(() => {
    const swipes = Object.values(state.swipes);
    // ⭐ raises salience for the issues a card touches; it never changes direction.
    const salience: Record<IssueId, number> = {};
    for (const sw of swipes) {
      if (!sw.starred) continue;
      const card = release.cards.find((c) => c.id === sw.cardId);
      if (card?.kind === "pole") for (const id of Object.keys(card.vector)) salience[id] = 2;
      if (card?.kind === "judicial_pole") salience[`judicial.${card.dimension}`] = 2;
    }
    return computeUserVector(swipes, release.cards, salience);
  }, [state.swipes]);

  const value = useMemo<Ctx>(
    () => ({ state, dispatch, go: (screen) => dispatch({ type: "go", screen }), userVector }),
    [state, userVector],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}
