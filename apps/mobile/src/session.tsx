// SessionProvider: the reducer in lib/session.ts plus persistence, randomness and masks.
// Nothing here talks to the network except `reveal`, which goes through data/reveal.ts.
import type { CandidateIdentity, ID, Mask, Swipe } from "@ftb/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ballot, cards, contests, release } from "@/data/release";
import { revealAll } from "@/data/reveal";
import {
  deleteEverything as wipeStorage,
  loadMasks,
  loadSession,
  saveMasks,
  saveSession,
  type StoredMasks,
} from "@/data/storage";
import { dealMasks, packMasks, unpackMasks } from "@/lib/masks";
import type { ContestPick } from "@/lib/picks";
import { EMPTY_SESSION, sessionReducer, starredCard, type LocalSession } from "@/lib/session";
import { randomBit, randomId, shuffle } from "@/random";

const MASK_TTL_MS = 24 * 60 * 60 * 1000;

type SessionValue = {
  /** False until the stored session has been read. */
  ready: boolean;
  state: LocalSession;
  /** candidateId → mask. Empty after the Unmasking. */
  masks: Record<ID, Mask>;
  /** True when the 24h mask session expired and new masks were dealt (picks are kept). */
  masksRefreshed: boolean;
  begin: (ballotStyleId: string) => boolean;
  answer: (swipe: Swipe) => void;
  toggleStar: (cardId: ID) => void;
  starred: (cardId: ID) => boolean;
  setDeckIndex: (index: number) => void;
  finishExplore: () => void;
  backToExplore: () => void;
  visit: (contestId: ID) => void;
  pick: (contestId: ID, pick: ContestPick | null) => void;
  guess: (candidateId: ID, party: string | null) => void;
  reveal: () => Promise<void>;
  clearPicks: () => void;
  setAnalytics: (on: boolean) => void;
  startOver: () => void;
  deleteEverything: () => Promise<void>;
  /** The mask title before the Unmasking, the real name after. */
  nameFor: (candidateId: ID) => string;
  identityFor: (candidateId: ID) => CandidateIdentity | undefined;
};

const SessionContext = createContext<SessionValue | null>(null);

function freshMasks(): StoredMasks {
  const now = Date.now();
  return {
    id: `mask-${randomId()}`,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MASK_TTL_MS).toISOString(),
    map: packMasks(dealMasks(contests, shuffle)),
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, EMPTY_SESSION);
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<StoredMasks | null>(null);
  const [masksRefreshed, setMasksRefreshed] = useState(false);
  const hydrated = useRef(false);

  // Read the stored session and masks once.
  useEffect(() => {
    let live = true;
    (async () => {
      const session = loadSession();
      let masks = await loadMasks();
      // A session from another release can't be trusted against this data: start fresh.
      const usable = session && (session.releaseId === null || session.releaseId === release.id);
      if (usable && session.phase !== "onboarding" && session.phase !== "revealed") {
        const expired = !masks || Date.parse(masks.expiresAt) < Date.now();
        if (expired) {
          masks = freshMasks();
          await saveMasks(masks);
          if (live) setMasksRefreshed(true);
        }
      }
      if (!live) return;
      if (usable) dispatch({ type: "hydrate", session });
      setStored(usable ? masks : null);
      hydrated.current = true;
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  // Write through on every change after hydration.
  useEffect(() => {
    if (hydrated.current) void saveSession(state);
  }, [state]);

  const masks = useMemo(() => (stored ? unpackMasks(stored.map) : {}), [stored]);

  const identities = useMemo(() => {
    const map = new Map<ID, CandidateIdentity>();
    for (const list of Object.values(state.revealed ?? {})) {
      for (const identity of list) map.set(identity.id, identity);
    }
    return map;
  }, [state.revealed]);

  const begin = useCallback((ballotStyleId: string) => {
    try {
      const next = freshMasks();
      const flips: Record<ID, boolean> = {};
      for (const card of cards) flips[card.id] = randomBit();
      const order: Record<ID, ID[]> = {};
      for (const contest of contests) order[contest.id] = shuffle(contest.candidateIds);
      dispatch({ type: "begin", releaseId: ballot.releaseId, ballotStyleId, order, flips });
      setStored(next);
      setMasksRefreshed(false);
      void saveMasks(next);
      return true;
    } catch {
      return false;
    }
  }, []);

  const reveal = useCallback(async () => {
    if (!state.releaseId) throw new Error("No ballot is loaded.");
    // Masks stay on until every contest comes back and checks out.
    const result = await revealAll(contests, state.releaseId);
    dispatch({ type: "reveal", identities: result });
    setStored(null);
    await saveMasks(null);
  }, [state.releaseId]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      state,
      masks,
      masksRefreshed,
      begin,
      answer: (swipe) => dispatch({ type: "answer", swipe }),
      toggleStar: (cardId) => dispatch({ type: "toggleStar", cardId }),
      starred: (cardId) => starredCard(state, cardId),
      setDeckIndex: (index) => dispatch({ type: "setDeckIndex", index }),
      finishExplore: () => dispatch({ type: "finishExplore" }),
      backToExplore: () => dispatch({ type: "backToExplore" }),
      visit: (contestId) => dispatch({ type: "visit", contestId }),
      pick: (contestId, pick) => dispatch({ type: "pick", contestId, pick }),
      guess: (candidateId, party) => dispatch({ type: "guess", candidateId, party }),
      reveal,
      clearPicks: () => dispatch({ type: "clearPicks" }),
      setAnalytics: (on) => dispatch({ type: "setAnalytics", on }),
      startOver: () => {
        dispatch({ type: "reset" });
        setStored(null);
        setMasksRefreshed(false);
        void saveMasks(null);
      },
      deleteEverything: async () => {
        dispatch({ type: "reset" });
        setStored(null);
        setMasksRefreshed(false);
        await wipeStorage();
      },
      nameFor: (candidateId) =>
        identities.get(candidateId)?.name ?? masks[candidateId]?.character ?? "Masked candidate",
      identityFor: (candidateId) => identities.get(candidateId),
    }),
    [begin, identities, masks, masksRefreshed, ready, reveal, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
