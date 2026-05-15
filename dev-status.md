# CoAIch Dev Status

Originally exported from `coaich-memory` for project `coaich`, then manually refreshed against the current repo state.

## Export Summary

- Base memory export date: 2026-05-11
- Manual refresh date: 2026-05-13
- Project: `coaich`
- Base memory entries: 6
- Current branch state: V2 in progress, deployed to Vercel from `v1-redesign` (Production)

## Current Snapshot

### What is actively true now

V1 is complete and live in production. The strongest product signals in the current tree are:

1. V1 is shipped: `v1-redesign` is the Production branch on Vercel at `coaich.vercel.app`.
2. Claude is wired end-to-end. Production routes through the Vercel serverless function `api/anthropic.ts` using `ANTHROPIC_API_KEY`. Local dev routes through the Vite proxy in `vite.config.ts` using `VITE_ANTHROPIC_API_KEY`.
3. The app is an installable PWA on mobile and desktop.
4. Core screens have been visually rebuilt toward the premium `design-reference/*` direction while preserving existing training logic.
5. EN/RU UI localization is complete across the full main journey via `src/i18n/translations.ts` and `src/hooks/useTranslation.ts`.
6. A full UI audit pass landed: critical issues on `Review`, `History`, `Import`, `EditWorkout`, and the overlay headers were fixed, and tap targets/trash affordances were enlarged to ~44px.
7. `BottomNav` is a floating glass pill, and the global background is the restored premium purple gradient.
8. Workout duration tracking is PWA-safe: durations are computed from start/finish timestamps rather than `setInterval`.

### Active work themes

- Maintaining V1 quality on production traffic against `coaich.vercel.app` while collecting feedback.
- Keeping the workout loop coherent under edits: `Today -> Logger -> Rating -> Review -> saved targets -> next workout`.
- Closing residual UI/UX gaps surfaced by the audit (consistency in overlay headers, button styles, tap targets, padding).
- Finishing localization edge cases (alerts, confirms, aria-labels, dynamic toasts) so no English copy leaks in RU mode.
- Cleaning up provider/docs drift where older Gemini/template references still exist while Anthropic remains the live code path.
- Scoping v2 candidates without expanding v1 surface area (see "Known limitations" below).

### Recent change sequence (2026-05-13)

V1 release and deployment:

1. `v1-redesign` is now the Production branch on Vercel; the app is live at `coaich.vercel.app`.
2. Claude API calls in production go through the Vercel serverless function `api/anthropic.ts`, which reads `ANTHROPIC_API_KEY` from environment.
3. Local development still uses the Vite proxy in `vite.config.ts` with `VITE_ANTHROPIC_API_KEY` from `.env`.
4. The app is configured as a PWA and is installable on mobile and desktop.

Full UI audit fixes:

5. `Review`: a back button was added to the sticky header (matches the footer back action), the mock English exercise data (`Lat Pulldown / Barbell Row / Bicep Curl`) was removed, loading/empty states replaced the fallback, and the misleading `Сохранить` footer label was changed to `Готово` / `Done` via a new `done` translation key.
6. `History`: root scroll padding was raised to `pb-24` so the last card clears the floating bottom nav; the delete confirm dialog now picks the prompt copy from the active profile language (`Delete workout?` / `Удалить тренировку?`).
7. `Import`: `todayDateInputValue()` now returns a local `YYYY-MM-DD` instead of a UTC slice; all toasts, confirms, placeholders, program-card labels, imported-workout subtitle, and the saved session name are localized; saved imported sessions use `Пуш (импорт)` / `Push (imported)` style names by language.
8. `EditWorkout`: every `window.confirm` / `window.alert` and every input placeholder + aria-label now goes through the translation system; new keys include `removeExerciseFromWorkoutConfirm`, `addAtLeastOneExercise`, `exerciseNeedsAtLeastOneSet`, `couldNotSaveChanges`, `discardChangesConfirm`, `weightPlaceholderInput`, `repsPlaceholderInput`, `secPlaceholderInput`, and aria-label keys.
9. Overlay header titles were unified to `text-lg font-bold` across `Logger`, `Rating`, `Review`, `EditWorkout`, and `Import`.
10. Trash tap targets in `Logger` (per-exercise) and `History` were enlarged from `p-1` to `p-2.5` so the hit area reaches ~44px.
11. `Logger` now scrolls to the top on mount via `useEffect(() => { window.scrollTo(0, 0); }, [])`, so opening a workout always lands at the header.
12. Deload threshold now scales with training frequency in `checkDeloadNeeded` (`src/services/progressionEngine.ts`): if average sessions per week over the last 4 weeks is `< 3`, the consecutive-week threshold is raised from `4 → 8` (natural) and `6 → 10` (on cycle); the Dexie lookup window was widened to 10 weeks accordingly.
13. Onboarding benchmark lifts are now seeded into `db.exerciseTargets` at the end of onboarding via `seedInitialTargetsFromProfile()` (called from `src/screens/Onboarding/index.tsx` right after `db.profile.put(finalProfile)`); each present, positive 10RM (`benchPress10RM`, `squat10RM`, `deadlift10RM`) writes `{ weight, reps: 10, sets: 3, source: 'progression_engine' }` for `barbell-bench-press` / `back-squat` / `deadlift`.

Earlier in this cycle (2026-05-12):

12. `Logger` Russian set naming was corrected from `ПОДХОД` to `СЕТ`, preserving numbered rows like `СЕТ 1`.
13. `Logger` exercise delete affordance was made permanently red to match destructive-action styling.
14. `History` workout cards gained a destructive delete action that removes both `db.workoutSessions` entries and associated `db.aiReviews`.
15. `Today` expandable exercise previews were simplified so the header keeps `СЕТ`, while each row now shows only the set number.
16. `Today` removed the `ОПЕРАЦИЯ: ПУШ / ПУЛЛ / НОГИ` badge above the workout title.
17. `EditWorkout` cards were cleaned up: helper copy removed, per-row labels reduced to plain numbers, trash icon made red, and add-action buttons restyled to match `Logger`.
18. `EditWorkout` gained a date picker that updates `startedAt` and `finishedAt` while preserving the original time-of-day.
19. `Import` exercise rows no longer use the old `Included`/`Excluded` pill toggle; they now use a red `Trash2` action that removes the row from the import list directly.
20. `aiService.parseReviewResponse` was hardened to recursively unwrap doubly-stringified JSON, so the AI review renders structured content instead of a raw JSON blob.
21. Workout duration tracking was switched from an in-flight `setInterval` counter to a `startedAt`/`finishedAt` timestamp diff so backgrounded PWAs still report accurate durations.
22. The global background was restored to a saturated purple radial gradient on `body`, with `#root` and `.safe-top-shell` set to transparent so the gradient shows through.
23. `BottomNav` was converted into a glass pill: `backdrop-blur-xl bg-white/5 border border-white/10` with a soft purple outer glow.

### Known limitations (deferred to v2)

- Dumbbell weights are not auto-doubled in volume math; users enter the total they intend to lift.
- No cloud sync and no authentication; all data remains in browser-local Dexie/IndexedDB.
- A nested `coaich/` subfolder exists in the repo root as a leftover nested clone artifact; it is harmless and not deployed.

## V2 Changes

- Negative deltas in Progress — regression badges now visible on benchmark lifts (red `TrendingDown` pill when `changeTone === 'danger'`).
- Drag-to-reorder in Logger — implemented via `@dnd-kit/core`, `@dnd-kit/sortable`. Exercise list is now sortable with a `GripVertical` drag handle. Extracted into `SortableExercise.tsx`, shared types in `Logger/shared.ts`.
- Adaptive AI Coach with memory — full loop implemented:
  - New Dexie table `coachMemory` (version 4) with `CoachMemoryEntry` type in `db.ts`.
  - `generateCoachInsights()` in `aiService.ts` — fires after every Review, stores `summary` + `keyFindings` (max 10 entries, pruned automatically).
  - `coachService.ts` — `generateCoachMessage` now loads last 4 memory entries and includes `keyFindings` in the Coach prompt.
  - Wired in `Rating/index.tsx` as fire-and-forget after `db.aiReviews.add()`.
- Regenerate AI Review — a refresh button on the Review screen allows re-running the AI analysis for any past session. Replaces the existing `aiReviews` entry in Dexie and fires `generateCoachInsights` in the background.

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

Storage is fully browser-local and offline-friendly; there is no backend dependency in the core training flow. The only server-side component is a thin Vercel serverless function (`api/anthropic.ts`) that proxies Claude API calls so the API key never ships to the client.

### Important decisions

- Progression and recommendation logic are deterministic first, AI second.
- Automatic target carry-over between workouts is a core product invariant.
- Current live AI provider in code is Anthropic Claude via `src/services/aiService.ts` and `src/services/coachService.ts`.
- In production, all Anthropic requests go through `api/anthropic.ts` on Vercel using `ANTHROPIC_API_KEY`; the client never holds a key.
- In local dev, the Vite proxy in `vite.config.ts` injects `VITE_ANTHROPIC_API_KEY` for the same `/api/anthropic` path so client code is environment-agnostic.
- The app is shipped as an installable PWA; offline-friendly storage stays as Dexie/IndexedDB.
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
- `src/screens/EditWorkout/index.tsx` (primary header/actions localized)
- `src/screens/Import/index.tsx` (primary header/labels/actions localized)

Notable localization details:

- EN/RU badge labels exist for progression states: `statusRec`, `statusHold`, `statusBase`, `statusDeload`
- `Settings` language toggle persists to Dexie and reloads the app immediately
- Several footer CTA labels are intentionally short and language-specific for tight mobile layouts
- All `window.confirm` / `window.alert` flows in `EditWorkout`, `History`, and `Import` route through the translation system
- Input placeholders (`weight`, `reps`, `sec`) and destructive aria-labels are translated keys, not hardcoded English
- Saved imported session names follow the profile language: `Push (imported)` in EN, `Пуш (импорт)` in RU

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
- Expanded target rows show plain set numbers under the `СЕТ`/`SET` header instead of repeating the label on every row
- `ОПЕРАЦИЯ: ПУШ / ПУЛЛ / НОГИ` badge was removed from the workout card; only the workout name and subtitle remain
- Hides `rest recommended` badging on rest days while still showing workout content and start CTA
- Global background is the restored purple radial gradient on `body`; the screen does not paint its own dark fill

### `Logger`

- Uses badge + target line under the exercise name; redundant status text line has been removed
- Header title is `text-lg font-bold` to match the unified overlay header style
- Footer buttons are compact, equal-width, and language-aware
- Rest timer is a floating pill overlay above the footer
- Russian badge labels render in the status pills without changing badge colors/styles
- Russian singular set label uses `СЕТ`
- Scrolls to the top of the screen on mount so opening a workout always lands at the header
- Duration is computed from `startedAt`/`finishedAt` timestamps so backgrounded PWAs still report accurate durations
- Trash affordance for exercises uses `p-2.5` so the tap target reaches ~44px

### `History`

- Workout cards support destructive deletion directly from the list
- Deleting a workout also deletes associated `aiReviews` rows for the same `sessionId`
- Delete confirm prompt is localized via the active profile language (`Delete workout?` / `Удалить тренировку?`)
- Root scroll container uses `pb-24` so the last card is not occluded by the floating bottom nav
- Trash button uses `p-2.5` to keep the tap target at ~44px

### `EditWorkout`

- Header and primary CTAs are localized through `src/i18n/translations.ts`
- Header title is `text-lg font-bold` to match the unified overlay header style
- Exercise rows use compact numeric set labels instead of repeated `SET n` text
- Destructive affordances are visually clearer with a red exercise trash icon
- Add-set and add-exercise controls were restyled to visually match `Logger`
- Date picker updates `startedAt` and `finishedAt` while preserving the original time-of-day
- All `window.confirm` / `window.alert` flows, input placeholders, and aria-labels run through the translation system

### `Import`

- Main import labels and footer CTAs participate in the translation system
- Exercise rows use a red trash action instead of the older included/excluded badge toggle
- Set labels are plain numbers (matches `Logger` / `EditWorkout`)
- Date prefill uses a local `YYYY-MM-DD` so users east of UTC do not see yesterday's date
- Imported workout subtitle and saved session name use the profile language (e.g. `Push (imported)` in EN, `Пуш (импорт)` in RU)
- Toast messages (`importErrorEnterSets`, `importErrorIncludeExercise`, `importErrorSaveFailed`, `importSuccessReturning`, `importSuccessAnother`) and confirms are localized

### `Review`

- Sticky header now has a back button on the left in addition to the footer back action
- Header title sits next to the workout date with `text-lg font-bold` to match the unified overlay header style
- The mock English exercise data fallback was removed; while loading, stats and the exercise log show a spinner, and missing data falls back to em dashes + empty/not-found copy
- Footer primary action label is `Готово` / `Done` (was misleadingly `Сохранить` / `Save`); the edit action stays on the left when an edit handler is provided
- Typography is tight across AI analysis, PRs, stats, and exercise log; expanded log rows show plain set numbers
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

- `design-reference/*` is an untracked standalone Vite prototype used as a visual source/reference. It is not built or deployed and exists only on the developer's filesystem.
- A nested `coaich/` subfolder is present at the repo root as a leftover nested-clone artifact. It is harmless and ignored by deployment.
- This file now reflects both the original `coaich-memory` export and subsequent manual refreshes based on the current codebase.
