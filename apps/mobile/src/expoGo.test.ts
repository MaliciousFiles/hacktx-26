// Guards the one-command Expo Go workflow (`pnpm mobile`). See apps/mobile/README.md.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mobileDir = join(__dirname, "..");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const mobilePkg = readJson(join(mobileDir, "package.json"));
const rootPkg = readJson(join(mobileDir, "../../package.json"));

// Native modules that ship inside Expo Go for the current SDK. A dependency with native
// code that is NOT in Expo Go crashes the app on launch there. Before adding a name here,
// confirm on the module's docs page (https://docs.expo.dev/versions/latest/) that it
// says "Included in Expo Go". If it isn't, the team must move to a development build.
const EXPO_GO_NATIVE = new Set([
  "expo",
  "expo-constants",
  "expo-crypto",
  "expo-file-system",
  "expo-font",
  "expo-linking",
  "expo-router",
  "expo-secure-store",
  "expo-sharing",
  "expo-status-bar",
  "expo-web-browser",
  "react-native",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-svg",
  "react-native-view-shot",
]);

const NATIVE_MARKERS = [
  "expo-module.config.json",
  "ios",
  "android",
  "apple",
  "react-native.config.js",
];

function hasNativeCode(dep: string): boolean {
  const dir = join(mobileDir, "node_modules", dep);
  return NATIVE_MARKERS.some((marker) => existsSync(join(dir, marker)));
}

describe("Expo Go workflow", () => {
  it("root `pnpm mobile` starts the app in Expo Go", () => {
    expect(rootPkg.scripts.mobile).toBe("pnpm -F @ftb/mobile go");
  });

  it.each(["mobile", "start", "dev", "go", "go:tunnel", "go:clear", "ios", "android"])(
    "`%s` passes --go",
    (script) => {
      expect(mobilePkg.scripts[script]).toMatch(/^expo start --go\b/);
    },
  );

  // With expo-dev-client installed, `expo start` serves a dev-build QR code
  // (exp+fairy-tale-ballot://) and a "choose an app" page; Expo Go can't open the former and
  // the tunnel 504s on the latter.
  it("does not depend on expo-dev-client", () => {
    const all = { ...mobilePkg.dependencies, ...mobilePkg.devDependencies };
    expect(all).not.toHaveProperty("expo-dev-client");
  });

  it("every native dependency is bundled in Expo Go", () => {
    const deps = Object.keys(mobilePkg.dependencies ?? {});
    const unsupported = deps.filter((dep) => hasNativeCode(dep) && !EXPO_GO_NATIVE.has(dep));
    expect(unsupported, "native deps not on the Expo Go allowlist").toEqual([]);
  });
});
