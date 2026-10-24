function fillRandom(target: Uint32Array): void {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) {
    throw new Error("No cryptographic random source is available on this device.");
  }
  source.getRandomValues(target as Parameters<Crypto["getRandomValues"]>[0]);
}

export function randomId(): string {
  const values = new Uint32Array(2);
  fillRandom(values);
  return Array.from(values, (value) => value.toString(16)).join("");
}

export function randomBit(): boolean {
  const values = new Uint32Array(1);
  fillRandom(values);
  const value = values[0];
  if (value === undefined) return false;
  return (value & 1) === 1;
}

/** Fisher-Yates using cryptographic randomness. Masks must not use Math.random. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    fillRandom(values);
    const roll = values[0];
    if (roll === undefined) continue;
    const swapIndex = roll % (index + 1);
    const current = copy[index];
    const next = copy[swapIndex];
    if (current === undefined || next === undefined) continue;
    copy[index] = next;
    copy[swapIndex] = current;
  }
  return copy;
}
