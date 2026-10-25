# @ftb/mobile

Expo SDK 58 app (Expo Router, routes in `src/app/`).

## Run it on your phone (Expo Go)

One command, from the repo root:

```sh
pnpm mobile
```

Scan the QR code with the iPhone Camera app (Android: scan it in Expo Go). The app opens in
**Expo Go**. Install Expo Go from the App Store or Play Store first. It must support SDK 58.

This works on a fresh clone or right after switching branches. `pnpm-workspace.yaml` sets
`verifyDepsBeforeRun: install`, so pnpm installs missing or stale dependencies before it runs
the script.

| Command              | When                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm mobile`        | Default. Phone and laptop on the same Wi-Fi                                                                                                                                    |
| `pnpm mobile:tunnel` | The phone can't reach the laptop, e.g. the QR opens but loading times out. Campus and hackathon Wi-Fi usually block device-to-device traffic. Slower, but works on any network |
| `pnpm mobile:clear`  | Weird bundler errors after a branch switch or dependency change (clears the Metro cache)                                                                                       |

Press `r` in the terminal to reload, `j` for the debugger, and `Ctrl+C` to stop.

## Why `--go` matters

`expo-dev-client` is installed for the optional native dev build. With it installed, a bare
`expo start` serves a **development-build** QR code (`exp+fairy-tale-ballot://…`). Expo Go
can't open that code. Every start script passes `--go`, so the QR code is a plain `exp://` URL.
If a terminal ever says "Using development build", press `s` to switch to Expo Go.

`src/expoGo.test.ts` (run by `pnpm test`) enforces this setup:

- `pnpm mobile` and every start script use `--go`.
- Every dependency with native code is on the Expo Go allowlist. A native library that isn't
  in Expo Go crashes the app on launch there, so CI fails before anyone hits the crash.

## Adding a dependency

```sh
cd apps/mobile && npx expo install <package>   # never pnpm add: expo install picks SDK-matched versions
```

- If the test fails with "native deps not on the Expo Go allowlist", look the package up at
  https://docs.expo.dev/versions/latest/. If its page says "Included in Expo Go", add it to
  `EXPO_GO_NATIVE` in `src/expoGo.test.ts`. If not, don't add it without team agreement. It
  would end the Expo Go workflow, and everyone would need a development build (below).
- If `pnpm install` refuses a just-published package, that's pnpm's `minimumReleaseAge`
  supply-chain check. Add the exact `name@version` to `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml`.

## Development build (optional, not needed for Expo Go)

Use this only for native code that Expo Go doesn't ship. It needs Xcode or Android Studio,
or an EAS cloud build:

```sh
pnpm -F @ftb/mobile ios          # expo run:ios: local native build + install on simulator/device
pnpm -F @ftb/mobile dev-client   # Metro for an already-installed dev build
npx eas-cli@latest build --profile development
```

`ios/` and `android/` are generated (gitignored). Never edit them by hand.
