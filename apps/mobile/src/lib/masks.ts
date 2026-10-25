// Mask dealing (PLAN.md Invariant 8, VISUAL_DESIGN.md §5). Pure: randomness is injected so the
// caller supplies a crypto shuffle and tests can stub it. Candidate IDs never influence the choice.
import type { ID, Mask } from "@ftb/types";

/** Generic fantasy portraits; `imageUrl` is a bundled asset key, empty until the art lands. */
export const CAST: readonly Mask[] = [
  { character: "The Lantern Keeper", title: "Carries the light ahead", imageUrl: "" },
  { character: "The Glass Cobbler", title: "Mends what others step past", imageUrl: "" },
  { character: "The Map Mender", title: "Redraws the road home", imageUrl: "" },
  { character: "The Star Baker", title: "Rises before the sun", imageUrl: "" },
  { character: "The Lighthouse Keeper", title: "Keeps one steady beam", imageUrl: "" },
  { character: "The Paper Folder", title: "Makes much from little", imageUrl: "" },
  { character: "The Quiet Wanderer", title: "Listens at every door", imageUrl: "" },
  { character: "The Kite Rider", title: "Reads which way the wind blows", imageUrl: "" },
  { character: "The Bell Ringer", title: "Calls the hours aloud", imageUrl: "" },
  { character: "The Tea Gardener", title: "Tends what grows slowly", imageUrl: "" },
  { character: "The Moth Herald", title: "Brings word by night", imageUrl: "" },
  { character: "The River Weaver", title: "Knows the shallow crossing", imageUrl: "" },
  { character: "The Clock Tinker", title: "Asks what the hour costs", imageUrl: "" },
  { character: "The Moon Gardener", title: "Plants by the tides", imageUrl: "" },
  { character: "The Arch Builder", title: "Joins one bank to the other", imageUrl: "" },
  { character: "The Story Spinner", title: "Remembers how it began", imageUrl: "" },
];

/**
 * One mask per candidate, no repeats within a contest. Each contest gets its own shuffle of the
 * cast. Throws if a contest has more candidates than the cast has masks.
 */
export function dealMasks(
  contests: readonly { id: ID; candidateIds: readonly ID[] }[],
  shuffle: <T>(items: readonly T[]) => T[],
  cast: readonly Mask[] = CAST,
): Record<ID, Mask> {
  const map: Record<ID, Mask> = {};
  for (const contest of contests) {
    if (contest.candidateIds.length > cast.length) {
      throw new Error(`Not enough masks for ${contest.id}.`);
    }
    const dealt = shuffle(cast);
    contest.candidateIds.forEach((candidateId, index) => {
      const mask = dealt[index];
      if (mask) map[candidateId] = mask;
    });
  }
  return map;
}

/** SecureStore keeps values small, so masks are stored as candidateId → cast index. */
export function packMasks(map: Readonly<Record<ID, Mask>>, cast: readonly Mask[] = CAST) {
  const packed: Record<ID, number> = {};
  for (const [candidateId, mask] of Object.entries(map)) {
    const index = cast.findIndex((item) => item.character === mask.character);
    if (index >= 0) packed[candidateId] = index;
  }
  return packed;
}

export function unpackMasks(
  packed: Readonly<Record<ID, number>>,
  cast: readonly Mask[] = CAST,
): Record<ID, Mask> {
  const map: Record<ID, Mask> = {};
  for (const [candidateId, index] of Object.entries(packed)) {
    const mask = cast[index];
    if (mask) map[candidateId] = mask;
  }
  return map;
}
