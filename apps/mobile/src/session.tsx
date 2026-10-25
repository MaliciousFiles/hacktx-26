import type { ID, Mask, MaskSession, Swipe } from "@ftb/types";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { demoBallot } from "@/fixtures/travisDemo";
import { randomBit, randomId, shuffle } from "@/random";

const CAST: Mask[] = [
  { character: "The Lantern Keeper", title: "Carries the light ahead", imageUrl: "" },
  { character: "The Bridge Wren", title: "Mends what the road split", imageUrl: "" },
  { character: "The Orchard Warden", title: "Counts what the harvest owes", imageUrl: "" },
  { character: "The North Starling", title: "Keeps one heading", imageUrl: "" },
  { character: "The Clockmaker", title: "Asks what the hour costs", imageUrl: "" },
  { character: "The River Guide", title: "Knows the shallow crossing", imageUrl: "" },
];

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
  begin: () => boolean;
  reset: () => void;
  answer: (swipe: Swipe) => void;
  toggleStar: (cardId: ID) => void;
  starred: (cardId: ID) => boolean;
  setDeckIndex: (index: number) => void;
  revealContest: (contestId: ID) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
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
      setDeckIndex,
      starred,
      begin: () => {
        try {
          const cast = shuffle(CAST);
          const map: Record<ID, Mask> = {};
          demoBallot.candidates.forEach((candidate, index) => {
            const mask = cast[index];
            if (mask) map[candidate.id] = mask;
          });
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
      revealContest: (contestId) => {
        const contest = demoBallot.contests.find((item) => item.id === contestId);
        if (contest && masks) {
          setOpenedMasks((current) => {
            const next = { ...current };
            for (const id of contest.candidateIds) {
              const mask = masks.map[id];
              if (mask) next[id] = mask;
            }
            return next;
          });
          const remaining = Object.fromEntries(
            Object.entries(masks.map).filter(([id]) => !contest.candidateIds.includes(id)),
          );
          setMasks({ ...masks, map: remaining });
        }
        setRevealed((current) => ({ ...current, [contestId]: true }));
      },
    };
  }, [
    deckIndex,
    flips,
    maskError,
    masks,
    openedMasks,
    order,
    pendingStars,
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
