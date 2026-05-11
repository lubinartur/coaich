# CoAIch Dev Status

Originally exported from `coaich-memory` for project `coaich`, then manually refreshed against the current repo state.

## Export Summary

- Base memory export date: 2026-05-11
- Manual refresh date: 2026-05-12
- Project: `coaich`
- Base memory entries: 6
- Current branch state: active UI and UX polish pass across the full training loop

## Current Snapshot

### What is actively true now

The app is in a late-stage redesign/polish phase. The strongest product signals in the current tree are:

1. Core screens have been visually rebuilt toward the premium `design-reference/*` direction while preserving existing training logic.
2. The full main journey now has EN/RU UI localization via `src/i18n/translations.ts` and `src/hooks/useTranslation.ts`.
3. `Today`, `Logger`, `Review`, `Progress`, `History`, and `Settings` have all received repeated layout and typography tuning.
4. `Settings` now includes local JSON export/import backup flows, and language switching triggers `window.location.reload()` for immediate UI refresh.
5. `BottomNav` has been converted into a floating pill nav and recent footer/button polish has been applied across `Logger` and `Review`.

### Active work themes

- Porting the premium `design-reference` visual language into production screens without changing progression logic.
- Tightening consistency in naming, progression copy, button hierarchy, footer layouts, and expandable cards.
- Finishing localization and language-specific polish, including Russian badge labels and localized short button copy.
- Keeping the workout loop coherent after edits: `Today -> Logger -> Rating -> Review -> saved targets -> next workout`.
- Cleaning up provider/docs drift where older Gemini/template references still exist while Anthropic remains the live code path.

## Architecture

### App architecture overview

CoAIch is a mobile-first, local-first React SPA without a router. `src/App.tsx` acts as the main state machine and switches between four bottom-nav tabs:

- `today`
- `progress`
- `history`
- `settings`

It also opens fullscreen workout overlays for:

- `logger`
- `rating`
- `review`
- `import`
- `editWorkout`

Core loop:

`onboarding -> today recommendation -> logger -> rating -> review -> saved targets -> next workout`

Persistence is browser-local through Dexie/IndexedDB in `src/services/db.ts`. Deterministic training logic lives in `src/services/progressionEngine.ts` and `src/services/coachService.ts`. AI is layered on top for explanations and review copy via `src/services/aiService.ts`.

### Component and screen structure

Shared UI remains intentionally small:

- Layout primitives in `src/components/layout`: `BottomNav`, `PageHeader`
- Reusable UI in `src/components/ui`: `Button`, `Card`, `Badge`

Most business logic still lives in screen modules under `src/screens/*`:

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

Structural pattern remains: `fat screens + service helpers`.

## Tech Stack and Decisions

### Main stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS v4
- `motion`
- `lucide-react`
- Dexie

Storage is fully browser-local and offline-friendly; there is no backend dependency in the core training flow.

### Important decisions

- Progression and recommendation logic are deterministic first, AI second.
- Automatic target carry-over between workouts is a core product invariant.
- Current live AI provider in code is Anthropic Claude via `src/services/aiService.ts` and `src/services/coachService.ts`.
- Some docs/template residue still references Gemini/AI Studio and older scaffolding; treat Anthropic-backed app code as the current source of truth.

## Localization Status

Localization is now implemented for the main product surfaces.

Key pieces:

- `src/i18n/translations.ts`
- `src/hooks/useTranslation.ts`

Localized screens:

- `src/screens/Today/index.tsx`
- `src/screens/Logger/index.tsx`
- `src/screens/Rating/index.tsx`
- `src/screens/Review/index.tsx`
- `src/screens/Progress/index.tsx`
- `src/screens/History/index.tsx`
- `src/screens/Settings/index.tsx`

Notable localization details:

- EN/RU badge labels exist for progression states: `statusRec`, `statusHold`, `statusBase`, `statusDeload`
- `Settings` language toggle persists to Dexie and reloads the app immediately
- Several footer CTA labels are intentionally short and language-specific for tight mobile layouts

## Design Rules

### Visual system

Design language is mobile-first and centered on a 390px phone shell.

Base tokens from `src/index.css`:

- Background: `#0A0A0A`
- Surface: `#141414`
- Card: `#1C1C1C`
- Border: `#2A2A2A`
- Text primary: `#FFFFFF`
- Text secondary: `#6B7280`
- Accent: `#8B5CF6`
- Success: `#22C55E`
- Warning: `#F59E0B`

### Current UI conventions

- Floating pill bottom nav in `src/components/layout/BottomNav.tsx`
- Fullscreen workout flows hide nav
- Large rounded corners across cards and shells
- Dark premium surfaces with subtle borders and soft glow
- Footer actions are fixed, high-priority CTAs on mobile
- Review and Logger footers favor equal-width side-by-side buttons
- Exercise rows increasingly use card-style presentation with compact badges and target lines
- Rest-day messaging should live primarily in coach copy, not duplicate badges

### Typography and formatting conventions

- Uppercase micro-labels still exist for section metadata and stat labels
- Main action buttons have been softened away from overly aggressive uppercase where needed
- Numeric/meta text often uses monospace or tabular alignment
- Workout/exercise names are normalized through `src/utils/toDisplayName.ts`
- Progression display strings are simplified through `src/utils/progressionDisplayLabels.ts`

## Screen-Level Notes

### `Today`

- Reads target recommendations from `db.exerciseTargets` first, then falls back to `previewExerciseTarget()`
- Supports expandable exercise cards with set/weight/reps preview
- Hides `operation` and `rest recommended` badges on rest days while still showing workout content and start CTA

### `Logger`

- Uses badge + target line under the exercise name; redundant status text line has been removed
- Footer buttons are compact, equal-width, and language-aware
- Rest timer is a floating pill overlay above the footer
- Russian badge labels now render in the status pills without changing badge colors/styles

### `Review`

- Header edit button was moved into the bottom footer
- Bottom footer now uses side-by-side actions: edit + save/archive path
- Typography has been tightened across AI analysis, PRs, stats, and exercise log
- Exercise log volume is always shown in kg, not tonnes

### `Settings`

- Supports local JSON export/import backup via `src/services/dataExport.ts`
- Language toggle reloads the app after persistence
- Settings sheets are localized and profile/preference values are displayed in EN/RU

## Product Direction

`coaich-concept.md` still defines the implementation boundary:

- Keep the existing training logic and local-first architecture
- Rewrite the UI and strings around the core loop
- Treat `Review` as the highest-value user screen
- Preserve the closed loop: `workout -> review -> targets saved -> next workout loads targets automatically`

Near-term focus remains workout experience quality, not sync/auth/cloud/social/nutrition.

Non-negotiables to preserve:

- Deterministic progression
- Local Dexie storage
- Automatic target carry-over between workouts

## Memory Inventory

Base `coaich-memory` inventory at last export:

1. `#1` `[architecture]` App architecture overview
2. `#2` `[roadmap]` Product direction and implementation boundary
3. `#3` `[architecture]` Component and screen structure
4. `#4` `[decisions]` Tech stack and runtime choices
5. `#5` `[design-rules]` UI design system and design rules
6. `#6` `[active-context]` Current active work snapshot

## Notes

- `design-reference/*` is still an untracked standalone Vite prototype used as a visual source/reference.
- This file now reflects both the original `coaich-memory` export and subsequent manual refreshes based on the current codebase.
