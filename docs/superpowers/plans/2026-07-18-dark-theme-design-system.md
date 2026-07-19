# Dark Theme Design System — Implementation Plan

**Goal:** Apply the dark-first design system from `docs/superpowers/specs/2026-07-18-dark-theme-design-system.md` across every PWA screen and the one Recharts chart, via a single CSS token file + a shared chart-theme module.
**Tech stack:** React 19 + Vite, plain inline styles (no CSS framework), Recharts 3.9.0.
**Spec:** `docs/superpowers/specs/2026-07-18-dark-theme-design-system.md`
**Execution:** Directly in this session, phase by phase — no subagent dispatch.

## Global constraints

- No hardcoded hex outside `pwa/src/styles/tokens.css` and `pwa/src/styles/chartTheme.js`.
- Two font weights only: 400 / 500. Sentence case everywhere, no ALL CAPS.
- Chart series colors are assigned per-metric in `chartTheme.js` and imported everywhere that metric appears — never redefined locally.

## Phase 1 — Tokens + chart theme module

**Files:** create `pwa/src/styles/tokens.css`, `pwa/src/styles/chartTheme.js`

- [x] `tokens.css`: `:root` custom properties for all surfaces/text/accent/alert/state-pairs/chart-series exactly as specified in the brief, plus RHR recolored to the HRV purple per spec decision #4.
- [x] `chartTheme.js`: exports `SERIES_COLORS` (metric name → `var(--series-*)` string) and a `chartTheme` object (grid stroke, axis tick/label color, tooltip background/border/text) built from the same tokens — for Recharts props.

**Done when:** file contents shown to the user for review (per their explicit request) — **stop here for approval before Phase 2.**

## Phase 2 — Global chrome

**Files:** `pwa/src/main.jsx`, `pwa/src/App.jsx`, `pwa/src/pages/Login.jsx`

- [x] `main.jsx` imports `./styles/tokens.css`.
- [x] `App.jsx` header/buttons/page background use tokens (`--surface-page`, `--text-primary`, `--accent` for primary actions).
- [x] `Login.jsx` form uses tokens.

**Done when:** `npm run dev` in `pwa/`, load the app in the browser — page background is true dark, header/buttons themed, no default white flashes.

## Phase 3 — Dashboard (core loop)

**Files:** `pwa/src/pages/Dashboard.jsx`

- [x] Today's balance becomes the prominent hero element: a tinted good/warn/over badge driven by the new `deficitState()` (Phase 6), replacing the plain `<strong>{balance}</strong>` row.
- [x] Stats list, calibration text, meals list restyled with tokens (`--text-secondary`/`--text-muted` for secondary rows, `--surface-card` for grouping).
- [x] Low-log warning (`⚠️ not reliable`) uses `--state-warn-fg`, not raw text.

**Done when:** dev server shows the deficit badge as the visually dominant element on Dashboard, color changes correctly across good/warn/over as test balances are simulated.

## Phase 4 — Weight chart

**Files:** `pwa/src/components/WeightTrendChart.jsx`

- [x] `CartesianGrid` (currently absent — add one) stroke `var(--border)`, axis ticks `var(--text-muted)`, `Tooltip` themed via `chartTheme` (dark background, no default white box).
- [x] Scatter/rolling-average line recolored to the `weight` series token; goal `ReferenceLine` recolored to `--accent` per spec decision #3.
- [x] `ResponsiveContainer`/chart background transparent (inherits `--surface-card` from parent).

**Done when:** chart renders on dark background with muted gridlines, themed tooltip, no default Recharts white showing anywhere.

## Phase 5 — Forms

**Files:** `pwa/src/pages/Settings.jsx`, `pwa/src/components/MealForm.jsx`, `pwa/src/components/PhotoMealForm.jsx`, `pwa/src/components/WeightForm.jsx`

- [x] Inputs/selects/buttons themed (`--surface-raised` fields, `--border` borders, `--text-primary` values, `--accent` for the submit/save action).
- [x] Status text (`crimson`/`green` literals) replaced with `--state-over-fg` (error) / `--state-good-fg` (saved) on tinted backgrounds, not raw color on page background.

**Done when:** Settings/meal/weight forms render dark, legible, sentence-case labels, save/error states use the tinted state pairs.

## Phase 6 — `deficitState()` + test

**Files:** `pwa/src/lib/balance.js`, `pwa/src/lib/balance.test.js`

- [x] Add `deficitState(balance, goalType, goalAmount)` per spec decision #1.
- [x] Vitest cases: good/warn/over for each of the three `goal_type` values.

**Done when:** `npm test` passes including new cases.

## Phase 7 — Verify

- [x] `npm test` (all Vitest suites green).
- [x] Manual pass in the browser at mobile viewport width: Login → Dashboard → Settings, confirm deficit badge glanceability, chart theming, no leftover hardcoded hex (`grep -rn '#[0-9a-fA-F]\{3,6\}\|crimson\|"green"' pwa/src` returns nothing outside `tokens.css`/`chartTheme.js`).
