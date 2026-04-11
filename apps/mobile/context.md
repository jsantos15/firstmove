# apps/mobile — Context

## Platform & Stack
- **Framework:** Expo SDK 54 + React Native 0.81
- **Language:** TypeScript (strict mode)
- **Navigation:** React Navigation v7 (native stack)
- **State:** Zustand (local/UI state) + TanStack Query (server state)
- **Chess board:** Custom SVG component — `react-native-svg`
- **Chess logic:** `chess.js` — import from `@firstmove/core`, never directly
- **Auth & DB:** `@firstmove/supabase` — never import `@supabase/supabase-js` directly
- **Local cache:** `expo-sqlite` — caches user progress and openings for offline use
- **Secure storage:** `expo-secure-store` — stores auth tokens securely on device

## Folder Structure
```
apps/mobile/
├── app/                  → Expo Router screens (if using file-based routing)
│   or
├── screens/              → Screen components (if using React Navigation manually)
│   ├── HomeScreen.tsx
│   ├── LibraryScreen.tsx
│   ├── PracticeScreen.tsx
│   └── ProfileScreen.tsx
├── components/
│   ├── board/            → ChessBoard SVG component, MoveList, ArrowOverlay
│   ├── openings/         → OpeningCard, ECOBadge, DifficultyBadge
│   └── ui/               → Generic UI (Button, Card, Screen, etc.)
├── hooks/                → Custom hooks (useOpenings, usePracticeSession, etc.)
├── stores/               → Zustand stores
├── lib/                  → Utilities, constants
├── navigation/           → Navigation configuration (if not using file-based routing)
└── context.md            → This file
```

## Naming Conventions
- **Screens:** PascalCase suffixed with `Screen` — `HomeScreen.tsx`, `LibraryScreen.tsx`
- **Components:** PascalCase — `ChessBoard.tsx`, `OpeningCard.tsx`
- **Hooks:** camelCase prefixed with `use` — `useOpenings.ts`, `usePracticeSession.ts`
- **Stores:** camelCase suffixed with `Store` — `boardStore.ts`

## Key Rules
- Never import from `@supabase/supabase-js` directly — always use `@firstmove/supabase`
- Never import from `chess.js` directly — always use `@firstmove/core`
- All server data goes through TanStack Query hooks
- Zustand for local/UI state only
- Offline-first: all critical data must be readable from expo-sqlite cache when offline
- Never store auth tokens in AsyncStorage — always use expo-secure-store
- Never hardcode environment values — use `app.config.ts` extra field + `process.env.EXPO_PUBLIC_*`
- Test on a real device via Expo Go during development — do not rely on emulator only
