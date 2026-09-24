# CoffeeLog

Specialty roasters, cafés and their beans on a map. v1 covers New York City, Philadelphia and Boston.

- **App:** Expo (React Native, TypeScript) + MapLibre + OpenFreeMap tiles (`apps/mobile`)
- **Data:** Firebase Firestore (free Spark plan), filled weekly by a Node pipeline on GitHub Actions (`pipeline`)
- **Shared:** types, vocabularies and filter logic (`packages/shared`)

## Quick start

```bash
npm install
npm run typecheck && npm run lint && npm test
npm run pipeline -- --dry-run --city boston
```

### Run the app (development build; Expo Go can't load the native map)

```bash
cp .env.example .env            # fill EXPO_PUBLIC_FIREBASE_* once the Firebase project exists
cd apps/mobile
npx expo run:android            # local Android build (Android Studio SDK), or:
npx eas-cli@latest build -p android --profile development
npx expo start --dev-client
```

## One-time setup (owner)

1. Create a Firebase project (Spark plan) and a Firestore database. Deploy the rules: `npx firebase-tools deploy --only firestore` (from `firebase/`).
2. Create a service account with Firestore write access and store its JSON in the GitHub secret `FIREBASE_SERVICE_ACCOUNT`.
3. Get a Gemini API key (Google AI Studio, free tier) and add the secrets `GEMINI_API_KEY` and `GEMINI_MODEL`.
4. Set `CRAWLER_CONTACT_URL` and `CONTACT_EMAIL` (repo variables), used in the crawler user-agent and on the About screen.

## Crawler

`CoffeeLogBot` reads only cafés' public pages, honours robots.txt, makes at most one request per 2 seconds per site and links back to every café. Café owners can ask to be removed through the contact address on the About screen. See [#bot](#bot).

<a id="bot"></a>

### About CoffeeLogBot

It fetches up to 6 pages per café site once a week to list the coffee beans and menu a café offers publicly. To opt out, disallow `CoffeeLogBot` in robots.txt or email the contact address.

## Data attribution

Map: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors. Places: Overture Maps Foundation (CDLA-Permissive-2.0; Foursquare data under Apache-2.0).
