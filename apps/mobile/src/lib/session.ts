// The one local session per ballot (APP_BUILD.md §1.4). It never leaves the phone (Inv. 5).
// Pure reducer: persistence and randomness live in src/session.tsx.
import type { CandidateIdentity, ID, Swipe } from "@ftb/types";
import type { ContestPick } from "./picks";

export type Phase = "onboarding" | "explore" | "walkthrough" | "revealed";

export interface LocalSession {
  version: 1;
  phase: Phase;
  releaseId: string | null;
  ballotStyleId: string | null;
  /** Crypto-shuffled candidate order per contest, drawn once (Inv. 15). */
  order: Record<ID, ID[]>;
  /** Which pole shows first per card, drawn once. */
  flips: Record<ID, boolean>;
  /** Last write per cardId wins. */
  swipes: Swipe[];
  /** Stars set on a card before it was answered. */
  pendingStars: ID[];
  deckIndex: number;
  picks: Record<ID, ContestPick>;
  visited: Record<ID, true>;
  /** Guess the party (U2): candidateId → guessed party or "unknown". Deleted with the session. */
  guesses: Record<ID, string>;
  /** Filled by /reveal for every contest at once; null until the Unmasking. */
  revealed: Record<ID, CandidateIdentity[]> | null;
  analyticsOptIn: boolean;
}

export const EMPTY_SESSION: LocalSession = {
  version: 1,
  phase: "onboarding",
  releaseId: null,
  ballotStyleId: null,
  order: {},
  flips: {},
  swipes: [],
  pendingStars: [],
  deckIndex: 0,
  picks: {},
  visited: {},
  guesses: {},
  revealed: null,
  analyticsOptIn: false,
};

export type SessionAction =
  | { type: "hydrate"; session: LocalSession }
  | {
      type: "begin";
      releaseId: string;
      ballotStyleId: string;
      order: Record<ID, ID[]>;
      flips: Record<ID, boolean>;
    }
  | { type: "answer"; swipe: Swipe }
  | { type: "toggleStar"; cardId: ID }
  | { type: "setDeckIndex"; index: number }
  | { type: "finishExplore" }
  | { type: "backToExplore" }
  | { type: "visit"; contestId: ID }
  | { type: "pick"; contestId: ID; pick: ContestPick | null }
  | { type: "guess"; candidateId: ID; party: string | null }
  | { type: "reveal"; identities: Record<ID, CandidateIdentity[]> }
  | { type: "clearPicks" }
  | { type: "setAnalytics"; on: boolean }
  | { type: "reset" };

export function sessionReducer(state: LocalSession, action: SessionAction): LocalSession {
  switch (action.type) {
    case "hydrate":
      return action.session;
    case "begin":
      return {
        ...EMPTY_SESSION,
        analyticsOptIn: state.analyticsOptIn,
        phase: "explore",
        releaseId: action.releaseId,
        ballotStyleId: action.ballotStyleId,
        order: action.order,
        flips: action.flips,
      };
    case "answer": {
      const pending = state.pendingStars.includes(action.swipe.cardId);
      const swipe = pending ? { ...action.swipe, starred: true } : action.swipe;
      return {
        ...state,
        swipes: [...state.swipes.filter((item) => item.cardId !== swipe.cardId), swipe],
        pendingStars: state.pendingStars.filter((id) => id !== swipe.cardId),
      };
    }
    case "toggleStar": {
      const existing = state.swipes.find((swipe) => swipe.cardId === action.cardId);
      if (!existing) {
        const pending = state.pendingStars.includes(action.cardId);
        return {
          ...state,
          pendingStars: pending
            ? state.pendingStars.filter((id) => id !== action.cardId)
            : [...state.pendingStars, action.cardId],
        };
      }
      return {
        ...state,
        swipes: state.swipes.map((swipe) =>
          swipe.cardId === action.cardId ? { ...swipe, starred: !swipe.starred } : swipe,
        ),
      };
    }
    case "setDeckIndex":
      return { ...state, deckIndex: Math.max(0, action.index) };
    case "finishExplore":
      return state.phase === "explore" ? { ...state, phase: "walkthrough" } : state;
    case "backToExplore":
      return state.phase === "walkthrough" ? { ...state, phase: "explore" } : state;
    case "visit":
      if (state.visited[action.contestId]) return state;
      return { ...state, visited: { ...state.visited, [action.contestId]: true } };
    case "pick": {
      // Picks are frozen once the masks are off: the reveal can't be used to change them.
      if (state.phase === "revealed") return state;
      const picks = { ...state.picks };
      if (action.pick) picks[action.contestId] = action.pick;
      else delete picks[action.contestId];
      return { ...state, picks };
    }
    case "guess": {
      if (state.phase === "revealed") return state;
      const guesses = { ...state.guesses };
      if (action.party) guesses[action.candidateId] = action.party;
      else delete guesses[action.candidateId];
      return { ...state, guesses };
    }
    case "reveal":
      return { ...state, phase: "revealed", revealed: action.identities };
    case "clearPicks":
      return { ...state, picks: {} };
    case "setAnalytics":
      return { ...state, analyticsOptIn: action.on };
    case "reset":
      return EMPTY_SESSION;
  }
}

/** Accepts only a stored session this version understands; anything else starts fresh. */
export function parseSession(raw: string | null): LocalSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalSession>;
    if (value?.version !== 1 || typeof value.phase !== "string") return null;
    return { ...EMPTY_SESSION, ...value } as LocalSession;
  } catch {
    return null;
  }
}

export function starredCard(state: LocalSession, cardId: ID): boolean {
  const swipe = state.swipes.find((item) => item.cardId === cardId);
  return swipe ? swipe.starred : state.pendingStars.includes(cardId);
}
