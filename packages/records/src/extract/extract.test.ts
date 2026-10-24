import { describe, expect, it, vi } from "vitest";
import { extractVotes, LlmSpanExtractor, rulesExtractVotes } from "./index";

const minutes = `
Meeting of April 2, 2025
Consent agenda item 3 was considered.
Rivera - Yes
Lee - No
Yeas: Pat Smith, Alex Rivera
Nays: Sam Lee
`;

describe("rules-first minutes extraction", () => {
  it("extracts named row votes with exact spans", () => {
    const batch = rulesExtractVotes({
      schemaId: "minutes-votes",
      sourceText: minutes,
      instruction: "votes",
      memberLabels: ["Alex Rivera", "Rivera"],
    });
    expect(batch.votes.some((vote) => vote.member.value === "Rivera" && vote.vote.value === "Yes")).toBe(true);
    const hit = batch.votes.find((vote) => vote.member.value === "Rivera")!;
    expect(minutes.slice(hit.member.start, hit.member.end)).toBe("Rivera");
    expect(minutes.slice(hit.vote.start, hit.vote.end)).toBe("Yes");
  });

  it("does not invent unanimously-carried votes without a name", () => {
    const text = "Motion carried unanimously.\n";
    expect(rulesExtractVotes({
      schemaId: "minutes-votes",
      sourceText: text,
      instruction: "votes",
      memberLabels: ["Rivera"],
    }).votes).toEqual([]);
  });
});

describe("LLM fallback", () => {
  it("uses rules when they hit and never calls the model", async () => {
    const extract = vi.fn();
    const result = await extractVotes(
      { schemaId: "minutes-votes", sourceText: minutes, instruction: "votes", memberLabels: ["Rivera"] },
      { id: "mock", extract },
    );
    expect(result.method).toBe("rules");
    expect(extract).not.toHaveBeenCalled();
  });

  it("rejects LLM spans that do not match the source exactly", async () => {
    const extractor = new LlmSpanExtractor({
      baseUrl: "https://llm.test",
      model: "tiny",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          votes: [{
            member: { value: "Rivera", start: 0, end: 6 },
            vote: { value: "Yes", start: 0, end: 3 },
            motion: { value: "nope", start: 0, end: 4 },
          }],
        }) } }],
      }))),
    });
    await expect(extractor.extract({
      schemaId: "minutes-votes",
      sourceText: minutes,
      instruction: "votes",
      memberLabels: ["Rivera"],
    })).rejects.toThrow(/does not exactly equal/);
  });

  it("accepts grounded LLM output when rules miss", async () => {
    const text = "On 2025-04-02 the board heard Item 9. Member Casey Quinn voted Aye on the budget amendment.";
    const memberStart = text.indexOf("Casey Quinn");
    const voteStart = text.indexOf("Aye");
    const motionStart = text.indexOf("budget amendment");
    const extractor = new LlmSpanExtractor({
      baseUrl: "https://llm.test",
      model: "tiny",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          votes: [{
            member: { value: "Casey Quinn", start: memberStart, end: memberStart + "Casey Quinn".length },
            vote: { value: "Aye", start: voteStart, end: voteStart + 3 },
            motion: { value: "budget amendment", start: motionStart, end: motionStart + "budget amendment".length },
          }],
        }) } }],
      }))),
    });
    const result = await extractVotes(
      { schemaId: "minutes-votes", sourceText: text, instruction: "votes", memberLabels: ["Casey Quinn"] },
      extractor,
    );
    expect(result.method).toBe("llm");
    expect(result.batch.votes).toHaveLength(1);
  });
});
