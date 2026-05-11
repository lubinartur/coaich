# CoAIch Dev Status

Exported from `coaich-memory` for project `coaich`.

## Export Summary

- Export date: 2026-05-11
- Project: `coaich`
- Total memory entries: 6
- Active: 6
- Done: 0
- Blocked: 0
- Deprecated: 0

## Active Context

### Current active work snapshot

Current branch shows a broad UI/product polish pass across the main user journey. Strongest signal: `design-reference/*` is an untracked standalone Vite prototype mirroring the same screens, while main app files are modified across `src/App.tsx`, `src/index.css`, `src/screens/Today`, `Logger`, `Rating`, `Review`, `History`, `Progress`, `Settings`, `Onboarding`, and `EditWorkout`.

Active tasks likely include:

1. Porting premium `design-reference` UI into the real app while preserving logic.
2. Tightening naming/progression display consistency via new helpers `toDisplayName` and `progressionDisplayLabels`.
3. Improving post-workout/history flows including import/edit/review refresh behavior.
4. Cleaning up provider/docs drift between Anthropic in app code and Gemini/AI Studio remnants in docs/template files.

## Architecture

### App architecture overview

CoAIch is a mobile-first, local-first React SPA without a router. `src/App.tsx` acts as a state machine that switches between 4 bottom-nav tabs (`today`, `progress`, `history`, `settings`) and fullscreen workout overlays (`logger`, `rating`, `review`, `import`, `editWorkout`).

Core product loop:

`onboarding -> today recommendation -> logger -> rating -> review -> saved targets -> next workout`

Persistence is in Dexie/IndexedDB via `src/services/db.ts`; deterministic training logic lives in `src/services/progressionEngine.ts` and `src/services/coachService.ts`; AI is layered on top for explanation and review text in `src/services/aiService.ts`.

### Component and screen structure

Shared UI is intentionally small:

- Layout primitives in `src/components/layout`: `BottomNav`, `PageHeader`
- Reusable UI in `src/components/ui`: `Button`, `Card`, `Badge`

Most product logic lives in screen-level modules under `src/screens/*`:

- `Onboarding`
- `Today`
- `Logger`
- `Rating`
- `Review`
- `History`
- `EditWorkout`
- `Progress`
- `Settings`
- `Import`

Structural pattern: `fat screens + service helpers`. Screens orchestrate UI and Dexie reads/writes, while services handle persistence, progression rules, PR detection, coach recommendations, and analytics.

## Tech Stack and Decisions

### Tech stack and runtime choices

Main app stack:

- React 19
- TypeScript
- Vite 6
- Tailwind CSS v4
- `motion`
- `lucide-react`
- Dexie

Storage is browser-local and offline-friendly; there is no real backend dependency in core app behavior.

Important architecture decision: progression/recommendation logic is deterministic first, AI second.

Current runtime AI provider in code is Anthropic Claude via `src/services/aiService.ts` and `src/services/coachService.ts`, using a Vite proxy and `VITE_ANTHROPIC_API_KEY`.

Memory note: some docs/template remnants still mention Gemini/AI Studio and `express`, so Anthropic should be treated as current truth and Gemini/template files as legacy drift or migration residue.

## Design Rules

### UI design system and design rules

Design language is mobile-first and centered on a 390px phone shell.

Base tokens in `src/index.css`:

- Background: `#0A0A0A`
- Surface: `#141414`
- Card: `#1C1C1C`
- Border: `#2A2A2A`
- Text primary: `#FFFFFF`
- Text secondary: `#6B7280`
- Accent: `#8B5CF6`
- Success: `#22C55E`
- Warning: `#F59E0B`

Recurring UI rules:

- Floating pill bottom nav
- Fullscreen workout flows hide nav
- Large rounded corners
- Glass / blur accents
- Uppercase micro-labels
- Bold display typography
- Monospace text for numeric/meta data
- Dark premium surfaces with subtle borders and glow

Utility conventions affecting UI consistency:

- Normalize exercise/workout labels through `src/utils/toDisplayName.ts`
- Simplify progression copy for display through `src/utils/progressionDisplayLabels.ts`

## Product Direction

### Product direction and implementation boundary

`coaich-concept.md` defines the current product boundary clearly:

- Keep the existing training logic and local-first architecture
- Rewrite the UI and strings around the core loop
- Treat `Review` as the highest-value user screen
- Preserve the closed loop: `workout -> review -> targets saved -> next workout loads targets automatically`

Near-term roadmap focus is workout experience quality, not sync/auth/cloud/social/nutrition.

When making future changes, preserve these non-negotiables:

- Deterministic progression
- Local Dexie storage
- Automatic target carry-over between workouts

## Memory Inventory

1. `#1` `[architecture]` App architecture overview
2. `#2` `[roadmap]` Product direction and implementation boundary
3. `#3` `[architecture]` Component and screen structure
4. `#4` `[decisions]` Tech stack and runtime choices
5. `#5` `[design-rules]` UI design system and design rules
6. `#6` `[active-context]` Current active work snapshot

## Notes

- This export reflects the current contents of `coaich-memory` for project `coaich`.
- There were no `done`, `blocked`, or `deprecated` entries at export time.
