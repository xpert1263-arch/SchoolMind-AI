# SchoolMind — AI School Assistant

**v1.0 — Foundation**

SchoolMind is one school operating system with **two workspaces** — Student and
Teacher — built on **one shared school data model**. Switching mode changes the
navigation, the dashboard and the available tools, but never the identity, the
design system, the data, the theme, the language or the application state.

Demo school: *41-sonli umumtaʼlim maktabi*, Toshkent.
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
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) then production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only |

No backend, no accounts, no API keys. The whole demo session lives in one
versioned `localStorage` key (`schoolmind.v1`).

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
    teacher/    Overview, Classes, Assignments, Students
    shared/     planned-capability pages, 404
  i18n/         uz (source of truth), ru (typed against uz), translator
  lib/          dates, labels, class-name helper, AI extension point
  state/        reducer store, persistence, derived selectors, toasts
  styles/       design tokens + Tailwind layers
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

## Not in v1.0

`Ask School`, `AI Tutor`, `ClassPulse` and `Teacher AI` are reachable and
honestly labelled with their target version. They describe what they will do and
**never fake a model response**. `src/lib/ai/provider.ts` fixes the shape of the
future integration boundary and ships a provider that advertises no
capabilities — no model calls, no credentials.

Roadmap: v1.1 AskMySchool · v1.2 SnapHomework · v1.3 AI Planner · v1.4 AI Tutor ·
v1.5 Quiz / Learning Loop · v1.6 Teacher expansion · v1.7 ClassPulse ·
v1.8 School Intelligence.

---

## Screenshots

`docs/screenshots/` — Student Home, Student Homework, Teacher Overview,
Teacher Assignments, and Student Home on mobile.
