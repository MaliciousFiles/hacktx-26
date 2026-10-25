import type { ID, Mask, MaskSession, Swipe } from "@ftb/types";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useBallotData } from "@/ballotData";
import { CAST, dealMasks } from "@/lib/masks";
import type { ContestPick } from "@/lib/picks";
import { randomBit, randomId, shuffle } from "@/random";

/** Contests bigger than the cast reuse portraits with a numeral, so a contest never repeats a mask. */
function castFor(size: number): Mask[] {
  const cast = [...CAST];
  for (let round = 2; cast.length < size; round += 1) {
    for (const mask of CAST) {
      if (cast.length >= size) break;
      cast.push({ ...mask, character: `${mask.character} ${round}` });
    }
  }
  return cast;
}

type SessionValue = {
  started: boolean;
  maskError: string | null;
  masks: MaskSession | null;
  openedMasks: Record<ID, Mask>;
  flips: Record<ID, boolean>;
  order: Record<ID, ID[]>;
  swipes: Swipe[];
  deckIndex: number;
  revealed: Record<ID, boolean>;
  /** The voter's choice per contest. Stays on this phone. */
  picks: Record<ID, ContestPick>;
  setPick: (contestId: ID, pick: ContestPick | null) => void;
  begin: () => boolean;
  reset: () => void;
  answer: (swipe: Swipe) => void;
  toggleStar: (cardId: ID) => void;
  starred: (cardId: ID) => boolean;
  setDeckIndex: (index: number) => void;
  /** The one ceremony at the end: names and parties for every contest on the ballot. */
  revealAll: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { generation } = useBallotData();
  return <SessionState key={generation}>{children}</SessionState>;
}

function SessionState({ children }: { children: ReactNode }) {
  const { data: demoBallot, loadIdentities } = useBallotData();
  const [started, setStarted] = useState(false);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [masks, setMasks] = useState<MaskSession | null>(null);
  const [openedMasks, setOpenedMasks] = useState<Record<ID, Mask>>({});
  const [flips, setFlips] = useState<Record<ID, boolean>>({});
  const [order, setOrder] = useState<Record<ID, ID[]>>({});
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [pendingStars, setPendingStars] = useState<ReadonlySet<ID>>(new Set());
  const [deckIndex, setDeckIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<ID, boolean>>({});
  const [picks, setPicks] = useState<Record<ID, ContestPick>>({});

  const value = useMemo<SessionValue>(() => {
    const starred = (cardId: ID) => {
      const swipe = swipes.find((item) => item.cardId === cardId);
      if (swipe) return swipe.starred;
      return pendingStars.has(cardId);
    };

    return {
      started,
      maskError,
      masks,
      openedMasks,
      flips,
      order,
      swipes,
      deckIndex,
      revealed,
      picks,
      setPick: (contestId, pick) =>
        setPicks((current) => {
          const next = { ...current };
          if (pick) next[contestId] = pick;
          else delete next[contestId];
          return next;
        }),
      setDeckIndex,
      starred,
      begin: () => {
        try {
          const largest = Math.max(0, ...demoBallot.contests.map((c) => c.candidateIds.length));
          const map = dealMasks(demoBallot.contests, shuffle, castFor(largest));
          const nextFlips: Record<ID, boolean> = {};
          for (const card of demoBallot.cards) nextFlips[card.id] = randomBit();
          const nextOrder: Record<ID, ID[]> = {};
          for (const contest of demoBallot.contests) {
            nextOrder[contest.id] = shuffle(contest.candidateIds);
          }
          const now = Date.now();
          setMasks({
            id: `mask-${randomId()}`,
            scope: "ballot",
            createdAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
            map,
          });
          setFlips(nextFlips);
          setOrder(nextOrder);
          setSwipes([]);
          setPendingStars(new Set());
          setDeckIndex(0);
          setRevealed({});
          setPicks({});
          setOpenedMasks({});
          setMaskError(null);
          setStarted(true);
          return true;
        } catch (error) {
          setMaskError(error instanceof Error ? error.message : "Masks could not be assigned.");
          return false;
        }
      },
      reset: () => {
        setStarted(false);
        setMaskError(null);
        setMasks(null);
        setOpenedMasks({});
        setFlips({});
        setOrder({});
        setSwipes([]);
        setPendingStars(new Set());
        setDeckIndex(0);
        setRevealed({});
        setPicks({});
      },
      answer: (swipe) => {
        setSwipes((current) => [...current.filter((item) => item.cardId !== swipe.cardId), swipe]);
        setPendingStars((current) => {
          if (!current.has(swipe.cardId)) return current;
          const next = new Set(current);
          next.delete(swipe.cardId);
          return next;
        });
      },
      toggleStar: (cardId) => {
        const existing = swipes.find((swipe) => swipe.cardId === cardId);
        if (!existing) {
          setPendingStars((current) => {
            const next = new Set(current);
            if (next.has(cardId)) next.delete(cardId);
            else next.add(cardId);
            return next;
          });
          return;
        }
        setSwipes((current) =>
          current.map((swipe) =>
            swipe.cardId === cardId ? { ...swipe, starred: !swipe.starred } : swipe,
          ),
        );
      },
      revealAll: async () => {
        // Fetch every contest first; only flip to "revealed" once all of them have loaded.
        for (const contest of demoBallot.contests) await loadIdentities(contest.id);
        if (masks) {
          setOpenedMasks((current) => ({ ...current, ...masks.map }));
          setMasks({ ...masks, map: {} });
        }
        setRevealed(Object.fromEntries(demoBallot.contests.map((contest) => [contest.id, true])));
      },
    };
  }, [
    demoBallot,
    loadIdentities,
    deckIndex,
    flips,
    maskError,
    masks,
    openedMasks,
    order,
    pendingStars,
    picks,
    revealed,
    started,
    swipes,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
