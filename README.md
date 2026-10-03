# SchoolMind — AI School Assistant

**v1.2 — SnapHomework AI Vision**

SchoolMind is one school operating system with **two workspaces** — Student and
Teacher — built on **one shared school data model**. Switching mode changes the
navigation, the dashboard and the available tools, but never the identity, the
design system, the data, the theme, the language or the application state.

Demo school: *Math Academy Private School*, Toshkent.
Demo student: **Azizbek Karimov, 9-A**. Demo teacher: **Nilufar Rashidova, matematika**.

---

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5180>).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (also serves the AskMySchool API) |
| `npm run build` | Typecheck (`tsc -b`) then production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only |

No accounts. The demo session lives in one versioned `localStorage` key
(`schoolmind.v1`). AskMySchool adds a small server-side API for AI; see below.

### AI setup (optional)

```bash
cp .env.example .env     # then paste a Gemini key into GEMINI_API_KEY
```

Without a key the app runs fine: every schedule, homework, test and
announcement question is answered from SchoolMind's own data with no
network at all. Only AI explanations and live web search are disabled,
and the UI says so instead of pretending.

---

## The v1.0 demo flow

1. Open SchoolMind — **Student Mode** is active.
2. **Bosh sahifa** shows today's lessons, homework, upcoming tests and announcements.
3. Open **Uyga vazifa**, tick a homework item complete.
4. Return to **Bosh sahifa** — the metrics and priorities have already updated.
5. Switch to **Teacher Mode** — the workspace changes without a page reload.
6. Open **Topshiriqlar → Topshiriq yaratish**.
7. Create: class `9-A`, subject `Matematika`, title `Algebra mashqlari`, an upcoming deadline.
8. Switch back to **Student Mode → Uyga vazifa**.
9. The new assignment is there, badged **YANGI**.
10. Refresh the page — mode, theme, language, completions and the new assignment all survive.

---

## Architecture

```
src/
  app/          routing, navigation config, application shell
  components/
    brand/      SchoolMind logo mark
    layout/     sidebar, topbar, mode switch, mobile navigation
    school/     domain rows: homework, lesson, announcement, detail drawer
    ui/         design-system primitives (button, panel, field, overlay, …)
  data/         types, demo dataset, pure lookups/queries
  features/
    student/    Home, My Day, Schedule, Homework
      ask/      AskMySchool page and answer-block renderers
      snap/     SnapHomework workspace and analysis renderers
    teacher/    Overview, Classes, Assignments, Students
    shared/     planned-capability pages, 404
  i18n/         uz (source of truth), ru (typed against uz), translator
  lib/          dates, labels, class-name helper, AI extension point
    ask/        router, school engine, context builder, API client, hook
    snap/       image intake, maths normaliser, API client, hook
  state/        reducer store, persistence, derived selectors, toasts
  styles/       design tokens + Tailwind layers

server/         Node only — never imported by src/
  env.mjs       reads GEMINI_API_KEY; the one place a secret exists
  gemini.mjs    Gemini provider, with and without grounded search
  askHandler.mjs  POST /api/ask, GET /api/ask/status
  snapHandler.mjs POST /api/snap, POST /api/snap/followup
  http.mjs      shared request/response helpers
  vitePlugin.mjs  mounts the API in dev and preview
```

### One data model, two views

A teacher creates an `Assignment`; a student sees `HomeworkItem`, which is a
derived view over the same record plus completion state. There is no second
dataset for the second mode. `src/state/selectors.ts` is where every screen's
data is derived from `seedAssignments + createdAssignments`.

### Design system

Colour, elevation and spacing live as CSS custom properties in
`src/styles/tokens.css` and are exposed to Tailwind as semantic names
(`bg-surface`, `text-ink-muted`, `border-line`, `bg-accent-soft`). Light and
dark are designed separately — dark uses layered surfaces, not inverted light.

The accent family shifts between workspaces (teal for Student, indigo for
Teacher) via `data-mode` on `<html>`, while everything else stays identical, so
the two modes read as rooms in one product.

Subjects carry a hue; chips derive their whole palette from it, so adding a
subject needs one number rather than a new colour set.

### Dates

Nothing is pinned to a historical date. The dataset is expressed as offsets from
"today" (`isoFromToday`), so the schedule, deadlines and announcements are
always relevant when the demo is presented. Uzbek dates are formatted from our
own month/weekday tables, because browser `uz-UZ` Intl data renders as
`M10 2, Fri`.

### i18n

`src/i18n/uz.ts` is the source of truth; `ru.ts` is typed as `Dictionary`, so a
missing Russian key is a compile error. Components call `t('nav.homework')` —
there are no inline `locale === 'ru' ? …` conditionals anywhere. Demo content
carries both languages via `LocalizedText`.

### State

One `useReducer` store (`src/state/store.tsx`) holds mode, theme, locale,
homework completion, teacher-created assignments and session activity. All
`localStorage` access is confined to `src/state/storage.ts` behind a versioned
key. No external state library.

---

## AskMySchool (v1.1)

`/student/ask` is a universal question interface, not a chatbot. Every
question is routed before it is answered:

```
question -> router -> SCHOOL_DATA | AI_KNOWLEDGE | WEB_SEARCH | HYBRID
                   -> structured blocks + honest source badges
```

The router is deterministic and built on two independent signals — is a
SchoolMind *record* being asked about, and does the answer depend on
*current external* information. A subject name alone is only a weak
signal, which is what keeps "explain algebra" (knowledge) apart from
"algebra homework" (records). Only when neither signal fires does the
server spend one small model call deciding whether the question needs
fresh information.

**School facts never come from the model.** `src/lib/ask/schoolEngine.ts`
resolves them from the shared dataset over (topic x day x subject x
ordinal), so wording can vary freely. Those answers need no network, so
they work with no API key configured.

Follow-ups carry a small focus object (subject, date, lesson,
assignment), so "Qaysi xonada?" and "Qachongacha?" resolve against the
previous answer instead of starting over.

### Where the key lives

The browser never sees it. `server/env.mjs` reads `GEMINI_API_KEY` in the
Node process; `server/vitePlugin.mjs` mounts `/api/ask` into Vite's dev
*and* preview servers. Nothing under `src/` imports anything under
`server/`, and the SDK is absent from the client bundle.

### Live web search

Grounded Google Search uses the official `@google/genai` SDK —
`tools: [{ googleSearch: {} }]` — and citations are read back out of the
provider's own `groundingMetadata`. There is no hand-written list of
websites and no fabricated URL anywhere: if the provider returns no
grounding evidence, the answer says so and the Web badge is withheld.

Search is not split into a separate `webSearchProvider` module, because
this provider grounds and generates in one call; splitting it would mean
inventing a seam the API does not have. The boundary that matters —
"generate with search" vs "generate without" — is one flag on
`server/gemini.mjs`.

### Honesty rules

- `SchoolMind` badge only when school records were used.
- `Web` badge only when search actually returned grounding evidence.
- Search failure degrades to a plain AI answer **and says so**.
- Missing records are reported as missing, never filled in.

## SnapHomework (v1.2)

`/student/snap` is a vision tutor: photograph a task, understand it.
It is deliberately not an answer machine — a **help level** decides how
much is revealed, and the server enforces it rather than trusting the
model to hold back:

| Level | What comes back |
| --- | --- |
| Ishora / Подсказка | 1–3 progressive hints. No steps, no answer. |
| Tushuntir / Объяснить | Concept and solution steps, **answer withheld**. |
| Yechib koʻrsat / Показать решение | Full worked solution and the answer. |

The photo is downscaled and re-encoded in the browser (max 1400px,
JPEG), posted to `/api/snap`, and processed inside that request. It is
never written to disk, never logged and never persisted.

The reply is a **provider-validated JSON object**, not prose, so the
client renders typed sections instead of parsing markdown. The model
must first declare `readable` and `isSchoolTask`; when either is false
every teaching field is blanked server-side, so a blurry photo or a
holiday snap cannot become an invented exercise.

Follow-ups reuse the AskMySchool router: ask "find me a reliable source
online" and the same grounded-search path runs, with the same real
citations. There is no second web provider.

Maths is rendered without a formula engine — the model is told to write
plain Unicode, and `src/lib/snap/mathText.ts` is the safety net that
converts stray LaTeX rather than adding ~270 kB of KaTeX.

### Shared AI core

```
server/gemini.mjs          one provider, one model setting
  generate()               text, optionally grounded in Google Search
  generateStructured()     vision + schema-validated output
  ├── AskMySchool   -> /api/ask
  └── SnapHomework  -> /api/snap, /api/snap/followup
```

## Not in v1.2

`AI Tutor`, `ClassPulse` and `Teacher AI` are reachable and
honestly labelled with their target version. They describe what they will do and
**never fake a model response**. `src/lib/ai/provider.ts` fixes the shape of the
future integration boundary and ships a provider that advertises no
capabilities — no model calls, no credentials.

Roadmap: v1.3 AI Planner · v1.4 AI Tutor ·
v1.5 Quiz / Learning Loop · v1.6 Teacher expansion · v1.7 ClassPulse ·
v1.8 School Intelligence.

---

## Screenshots

`docs/screenshots/` — Student Home, Student Homework, Teacher Overview,
Teacher Assignments, and Student Home on mobile.
