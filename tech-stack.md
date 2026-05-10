# CoAIch — Tech Stack & Architecture

---

## Stack

### Frontend

- React + Vite

- TypeScript

- TailwindCSS

- Mobile-first, 390px width

- Dark theme

### Storage

- Dexie (IndexedDB) — local-first, offline-friendly

- No backend, no auth in v1

### AI

- Anthropic Claude API (claude-sonnet-4-20250514)

- max_tokens: 1000 per request

- Used for: workout Review, Coach AI recommendation on Today screen

---

## Architecture Style

- Local-first — all data lives on device

- Offline-friendly — app works without internet (except AI features)

- Deterministic core — progression logic is rule-based, not AI

- LLM layer — AI only for explanation and natural language output

---

## Folder Structure

```

src/

├── components/

│   ├── ui/              # reusable UI components (Button, Card, Badge, etc.)

│   ├── layout/          # BottomNav, PageHeader

│   └── screens/         # one folder per screen

│       ├── Today/

│       ├── Logger/

│       ├── Rating/

│       ├── Review/

│       ├── Progress/

│       ├── History/

│       ├── Settings/

│       └── Onboarding/

├── services/

│   ├── db.ts            # Dexie database setup

│   ├── progressionEngine.ts  # deterministic progression logic

│   ├── aiService.ts     # Claude API calls

│   └── coachService.ts  # Coach AI logic (today recommendation)

├── hooks/               # custom React hooks

├── types/               # TypeScript interfaces

├── utils/               # helpers (volume calc, 1RM formula, etc.)

└── constants/

    ├── exercises.ts     # exercise library seed data

    └── progression.ts   # MEV/MAV/MRV values per muscle group

```

---

## Design System

```css

--bg: #0A0A0A

--surface: #141414

--card: #1C1C1C

--border: #2A2A2A

--text-primary: #FFFFFF

--text-secondary: #6B7280

--accent: #8B5CF6

--success: #22C55E

--warning: #F59E0B

```

---

## Navigation

4 tabs (bottom floating pill nav, no labels):

1. Today — home icon

2. Progress — chart icon

3. History — clock icon

4. Settings — gear icon

Logger, Rating, Review — fullscreen modes, no bottom nav visible.

---

## Screen Flow

```

Onboarding (first launch only)

↓

Today

↓ (Start Workout)

Logger (fullscreen)

↓ (Finish)

Rating (fullscreen)

↓ (Get AI Review)

Review (fullscreen)

↓ (targets saved to DB)

Today (next day)

```

---

## AI Integration

### Claude API call pattern

```javascript

const response = await fetch("[https://api.anthropic.com/v1/messages](https://api.anthropic.com/v1/messages)", {

  method: "POST",

  headers: { "Content-Type": "application/json" },

  body: JSON.stringify({

    model: "claude-sonnet-4-20250514",

    max_tokens: 1000,

    messages: [{ role: "user", content: prompt }]

  })

});

```

### When AI is called

1. After Rating screen — generates workout Review

2. On Today screen — generates next workout recommendation (Coach AI)

### AI is NOT called for

- Progression targets (deterministic engine handles this)

- Exercise selection from library

- Volume calculations

---

## Known Issues to Fix

- **Barbell weight** — weight input = total weight on the bar as entered by user. System does NOT add or subtract barbell weight (20kg). User is responsible for what they enter. No auto-calculation. Decide UX approach before implementing logger.

- Never use localStorage — use Dexie only

- All progression logic is deterministic first, AI explains second

- AI targets from Review are saved to DB and loaded automatically in next workout

- Exercise names stay in English throughout

- No backend, no sync, no auth in v1