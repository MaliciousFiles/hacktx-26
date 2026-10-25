# @ftb/mobile

Expo SDK 58 app (Expo Router, routes in `src/app/`). It runs in **Expo Go**, with no native
build, no Xcode and no dev client.

## Run it on your phone

1. Install **Expo Go** from the App Store or Play Store. It must support SDK 58.
2. From the repo root (or `apps/mobile`):

   ```sh
   pnpm mobile          # phone and laptop on the same Wi-Fi that allows device-to-device traffic
   pnpm mobile:tunnel   # campus, hackathon or any Wi-Fi that blocks it (the usual case at UT/HackTX)
   ```

3. Scan the QR code with the iPhone Camera app (Android: scan from inside Expo Go). Or open
   Expo Go: when it's signed in to the same Expo account as `npx expo whoami`, the server is
   listed under "Development servers".

Saving a file hot-reloads the app on the phone (Fast Refresh). Press `r` in the terminal for a
full reload, `j` for the debugger, and `Ctrl+C` to stop.

Fresh clones and branch switches need no setup. `pnpm-workspace.yaml` sets
`verifyDepsBeforeRun: install`, so pnpm installs missing or stale dependencies before it runs
the script.

| Command                       | What                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `pnpm mobile`                 | Metro + QR over the local network                           |
| `pnpm mobile:tunnel`          | Metro + QR through Expo's tunnel (works on any network)     |
| `pnpm mobile:clear`           | Same as `pnpm mobile`, after clearing the Metro cache       |
| `pnpm -F @ftb/mobile ios`     | Opens the app in Expo Go on the iOS Simulator (needs Xcode) |
| `pnpm -F @ftb/mobile android` | Opens the app in Expo Go on an Android emulator             |

## Connect a published ballot

On Home, open **Connect a published ballot**. Enter the serving API URL, official
ballot-style ID, and frozen release ID supplied by the data team. Loading a ballot
starts a fresh local session. A failed request leaves the current ballot intact.
Names are fetched on reveal using the same release ID; mismatched responses are rejected.

Optional defaults in `apps/mobile/.env.local`:

```sh
EXPO_PUBLIC_API_URL=https://your-serving-api.example
EXPO_PUBLIC_BALLOT_STYLE_ID=your-style
EXPO_PUBLIC_RELEASE_ID=your-release
```

Use a URL reachable by your phone (not `localhost`). The API must expose the
existing `/ballot?ballotStyleId=…&releaseId=…` and `/reveal/:contestId?releaseId=…`
contract. No database credentials belong in the app. Sample mode remains available
offline. Answers are held in memory and reset on app reload or data-source change.

## Troubleshooting

The home screen's daily game and the reveal screen's image-card button open the
web app. Set `EXPO_PUBLIC_WEB_URL=https://your-deployed-site.example` in
`apps/mobile/.env.local` and restart Metro. See `apps/web/README.md` for deployment
and LAN testing. Share links carry only counts in the fragment; game links carry
no ballot information.

**The phone times out, but the URL loads on the Mac.** The Wi-Fi blocks phone-to-laptop
traffic. Use `pnpm mobile:tunnel`. Alternatively, run Tailscale on both devices and use
`REACT_NATIVE_PACKAGER_HOSTNAME=<mac's 100.x Tailscale IP> pnpm mobile`.

**"native component '…' is not registered" and a stack trace mentioning `FairyTaleBallot`.**
The project opened in an old native development build of the app instead of Expo Go. Delete
the "Fairy Tale Ballot" app from your phone and open the project from Expo Go.

**Odd bundler errors after a branch switch.** Run `pnpm mobile:clear`.

## Keeping it working

`src/expoGo.test.ts` (run by `pnpm test`) fails if:

- a start script stops passing `--go`, or `expo-dev-client` is added back. With
  `expo-dev-client` installed, the QR code targets a native dev build that Expo Go can't open.
- a dependency has native code that isn't on the Expo Go allowlist. Such a library crashes the
  app on launch in Expo Go.

### Adding a dependency

```sh
cd apps/mobile && npx expo install <package>   # never pnpm add: expo install picks SDK-matched versions
```

- If the test reports "native deps not on the Expo Go allowlist", look the package up at
  https://docs.expo.dev/versions/latest/. If its page says "Included in Expo Go", add it to
  `EXPO_GO_NATIVE` in `src/expoGo.test.ts`. If not, pick another library. Moving off Expo Go is
  a team decision.
- If `pnpm install` refuses a just-published package, that's pnpm's `minimumReleaseAge`
  supply-chain check. Add the exact `name@version` to `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml`.
