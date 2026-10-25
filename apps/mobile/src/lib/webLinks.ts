export type ShareCounts = { questions: number; contests: number; sample: boolean };

/** Only explicit counts enter the fragment. Never serialize a session or answers. */
export function webLink(base: string | undefined, page: "daily" | "invite", counts?: ShareCounts): string {
  if (!base) throw new Error("Set EXPO_PUBLIC_WEB_URL to the deployed Wishing Well website, then restart Expo.");
  const url = new URL(base);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("The website needs an HTTP or HTTPS address without credentials.");
  url.search = "";
  url.hash = page;
  if (page === "invite" && counts) {
    const clean = (value: number) => String(Number.isFinite(value) ? Math.max(0, Math.min(999, Math.floor(value))) : 0);
    url.hash = `invite?${new URLSearchParams({ questions: clean(counts.questions), contests: clean(counts.contests), sample: counts.sample ? "1" : "0" })}`;
  }
  return url.toString();
}
