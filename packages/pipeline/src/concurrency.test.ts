import { describe, it, expect } from "vitest";
import { mapConcurrent } from "./concurrency";

describe("bounded acquisition workers", () => {
  it("runs in parallel within the limit and preserves input order", async () => {
    let active = 0,
      peak = 0;
    const result = await mapConcurrent([3, 2, 1, 0], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(result).toEqual([6, 4, 2, 0]);
  });
  it("stops new work and drains in-flight work on failure", async () => {
    const started: number[] = [];
    let drained = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = mapConcurrent([0, 1, 2, 3], 2, async (value) => {
      started.push(value);
      if (value === 0) throw new Error("failure");
      await gate;
      drained = true;
      return value;
    });
    const assertion = expect(result).rejects.toThrow("failure");
    await Promise.resolve();
    expect(drained).toBe(false);
    release();
    await assertion;
    expect(drained).toBe(true);
    expect(started).toEqual([0, 1]);
  });
  it("rejects unsafe concurrency settings", async () => {
    for (const limit of [0, -1, 1.5, 17, NaN])
      await expect(mapConcurrent([], limit, async () => 0)).rejects.toThrow("Concurrency");
  });
});
