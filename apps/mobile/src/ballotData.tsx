import type { Api, CandidateIdentity, Contest } from "@ftb/types";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { demoBallot, demoIdentities } from "@/fixtures/travisDemo";
import { createApiClient } from "@/lib/apiClient";
import { validateBallot, validateReveal } from "@/lib/releaseValidation";

type BallotData = Api["GET /ballot"]["res"];
function useDataState() {
  const [data, setData] = useState<BallotData>(demoBallot);
  const [sample, setSample] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [identities, setIdentities] = useState<CandidateIdentity[]>([]);
  const [generation, setGeneration] = useState(0);
  const client = (url: string) =>
    createApiClient(url, async (request) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        const body: unknown = await response.json();
        return { ok: response.ok, status: response.status, json: async () => body };
      } finally {
        clearTimeout(timeout);
      }
    });
  const api = {
    data,
    sample,
    loading,
    error,
    generation,
    async connect(url: string, style: string, release: string) {
      if (loading) return;
      setLoading(true);
      setError(null);
      try {
        const parsed = new URL(url.trim());
        if (!["https:", "http:"].includes(parsed.protocol))
          throw new Error("Use an HTTP or HTTPS API address.");
        const next = await client(url.trim()).ballot(style.trim(), release.trim());
        validateBallot(next, style.trim(), release.trim());
        setData(next);
        setBaseUrl(url.trim());
        setSample(false);
        setIdentities([]);
        setGeneration((value) => value + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load this ballot. Try again.");
      } finally {
        setLoading(false);
      }
    },
    useSample() {
      setData(demoBallot);
      setSample(true);
      setIdentities([]);
      setError(null);
      setGeneration((value) => value + 1);
    },
    async loadIdentities(contestId: string) {
      const contest = data.contests.find((item) => item.id === contestId);
      if (!contest) throw new Error("Contest is not in this release.");
      const result = sample
        ? {
            releaseId: data.release.id,
            contestId,
            identities: demoIdentities.filter((identity) =>
              contest.candidateIds.includes(identity.id),
            ),
          }
        : await client(baseUrl).reveal(contestId, data.release.id);
      validateReveal(result, contest, data.release.id);
      setIdentities((current) => [
        ...current.filter((item) => !contest.candidateIds.includes(item.id)),
        ...result.identities,
      ]);
    },
    contestById: (id: string) => data.contests.find((contest) => contest.id === id),
    identityFor: (id: string) => identities.find((identity) => identity.id === id),
    orderedProfiles: (contest: Contest, order: readonly string[] | undefined) =>
      (order?.length ? order : contest.candidateIds).flatMap((id) => {
        const profile = data.candidates.find((candidate) => candidate.id === id);
        return profile ? [profile] : [];
      }),
  };
  // With all three EXPO_PUBLIC_* IDs set, load that frozen release on launch. A failure leaves
  // the sample in place and the message shows in "Connect a published ballot".
  const auto = useRef(false);
  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_API_URL?.trim();
    const style = process.env.EXPO_PUBLIC_BALLOT_STYLE_ID?.trim();
    const release = process.env.EXPO_PUBLIC_RELEASE_ID?.trim();
    if (auto.current || !url || !style || !release) return;
    auto.current = true;
    void api.connect(url, style, release);
  });
  return api;
}
const DataContext = createContext<ReturnType<typeof useDataState> | null>(null);
export function BallotDataProvider({ children }: { children: ReactNode }) {
  const value = useDataState();
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
export function useBallotData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("Missing BallotDataProvider");
  return value;
}
