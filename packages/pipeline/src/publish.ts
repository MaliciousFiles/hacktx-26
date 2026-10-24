// publish.ts — Stage 7: Assemble, validate, hash, and publish data releases (PLAN.md §4, §7).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Release,
  Ballot,
  Contest,
  CandidateProfile,
  PolicyCard,
  SourceCitation,
  CandidateIdentity,
} from "@ftb/types";
import { validatePublication, identityLeakGate, type LeakGateBlocklist } from "./validate.js";

export interface PublishPayload {
  release: Release;
  ballot: Ballot;
  contests: Contest[];
  candidates: CandidateProfile[];
  cards: PolicyCard[];
  citations: SourceCitation[];
}

export interface PublishOptions {
  outDir: string;
  blocklist: LeakGateBlocklist;
}

export interface PublishResult {
  success: boolean;
  manifestHash: string;
  releaseFilePath: string;
  errors: string[];
  leaks: string[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const sorted = Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${sorted.join(",")}}`;
}

/**
 * Validate, hash, and publish a release.
 */
export function publishRelease(
  payload: PublishPayload,
  options: PublishOptions,
): PublishResult {
  // 1. Validate publication integrity (citations and references)
  const pubValidation = validatePublication(
    payload.release,
    payload.candidates,
    payload.contests,
    payload.citations,
  );

  if (!pubValidation.valid) {
    return {
      success: false,
      manifestHash: "",
      releaseFilePath: "",
      errors: pubValidation.errors,
      leaks: [],
    };
  }

  // 2. Serialize full response to run identity leak gate
  const serialized = JSON.stringify(payload, null, 2);
  const leakResult = identityLeakGate(serialized, options.blocklist);

  if (!leakResult.clean) {
    return {
      success: false,
      manifestHash: "",
      releaseFilePath: "",
      errors: ["Identity leak detected in publish payload."],
      leaks: leakResult.leaks,
    };
  }

  // 3. Compute manifestHash over canonical JSON
  const manifestHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
  payload.release.manifestHash = manifestHash;

  // 4. Write release to disk
  const distDir = join(options.outDir, "releases");
  mkdirSync(distDir, { recursive: true });

  const releaseFilePath = join(distDir, `${payload.release.id}.json`);
  writeFileSync(releaseFilePath, JSON.stringify(payload, null, 2), "utf-8");

  return {
    success: true,
    manifestHash,
    releaseFilePath,
    errors: [],
    leaks: [],
  };
}

/**
 * Simple diff report between two releases.
 */
export function generateReleaseDiff(prevPath: string, currPath: string): string {
  if (!existsSync(prevPath) || !existsSync(currPath)) {
    return "Previous or current release file not found.";
  }

  const prev = JSON.parse(readFileSync(prevPath, "utf-8")) as PublishPayload;
  const curr = JSON.parse(readFileSync(currPath, "utf-8")) as PublishPayload;

  const lines: string[] = [
    `# Release Diff: ${prev.release.id} -> ${curr.release.id}`,
    `- Previous manifest: ${prev.release.manifestHash}`,
    `- Current manifest: ${curr.release.manifestHash}`,
    `- Contests: ${prev.contests.length} -> ${curr.contests.length}`,
    `- Candidates: ${prev.candidates.length} -> ${curr.candidates.length}`,
    `- Cards: ${prev.cards.length} -> ${curr.cards.length}`,
  ];

  return lines.join("\n");
}
