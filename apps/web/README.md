# Wishing Well web

Responsive invitation/share-card site and a playable daily **Match the Quote** game.

```sh
pnpm -F @ftb/web dev --host 0.0.0.0
pnpm -F @ftb/web build
```

Deploy `apps/web/dist` to a static HTTPS host (Vercel, Netlify, Cloudflare Pages, etc.).
Hash routes work without rewrite rules:

- `/#invite`: illustrated invitation; image generated locally with Canvas.
- `/#invite?questions=8&contests=2&sample=1`: optional progress counts, carried only
  in the fragment (not sent to the server). No names, answers, or picks.
- `/#daily`: three fictional quote/plan matching rounds, explanations, daily result
  sharing, and local progress. Same UTC-day selection for everyone. The prototype
  rotates nine hand-authored examples; it never consumes live ballot data.

**Sharing:** supported browsers send the PNG directly through the native share
sheet. Other browsers share/copy the invitation URL. Download is optional, never
required. Some messaging apps omit text when attaching images; the copy-link
control remains available. Personalized previews are not server-rendered; social
crawlers see the generic logo and invitation metadata.

## Connect the mobile demo

Set this in `apps/mobile/.env.local`, then restart Metro:

```sh
EXPO_PUBLIC_WEB_URL=https://your-deployed-site.example
```

For local phone testing use the laptop's LAN address and Vite port instead, e.g.
`http://192.168.1.20:5173`. A local address is not a public invitation link. Expo's
Metro tunnel does not tunnel Vite; deploy the site to send links outside your LAN.

Optional `apps/web/.env.local`:

```sh
VITE_APP_URL=exp://your-working-expo-go-link
```

This adds an **Open Wishing Well** button. Without it, visitors can play the game
and create/share invitations; the page explicitly says the ballot walkthrough is
an Expo Go demo. No store installation or deployed ballot walkthrough is claimed.

Web Share and Clipboard generally require HTTPS (or localhost). Neither app
uploads card images or game answers. Local storage failure does not block play.
