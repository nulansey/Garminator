# Dark Theme Design System — Design Spec

**Date:** 2026-07-18
**Status:** Approved (brainstorming), pending implementation plan
**Scope:** Apply a dark-first, OLED-optimized visual design system across the whole PWA (all screens, all charts). Visual/styling only — no data-model or business-logic changes beyond the one derived value described below.

## Problem

The PWA currently has **zero styling infrastructure**: no CSS files, no Tailwind, no design tokens. Every component (`App.jsx`, `Dashboard.jsx`, `Settings.jsx`, `MealForm.jsx`, `PhotoMealForm.jsx`, `WeightForm.jsx`, `WeightTrendChart.jsx`, `Login.jsx`) styles itself with one-off inline `style={{}}` literals — default browser light theme, ~10 scattered hex/named-color values (`#64748b`, `#16a34a`, `#cbd5e1`, `#0f172a`, `crimson`, `green`), several duplicated. This is checked several times a day on mobile and needs to be glanceable and dark-first (OLED true-dark surfaces), with the "am I in a calorie deficit today" indicator as the single most prominent element.

## Token source of truth

No Tailwind/PostCSS exists and adding a build-time CSS framework for a project with zero current CSS is unwarranted (ladder rung 5 doesn't apply — nothing installed to reuse; installing one is unjustified new tooling for what plain CSS custom properties handle). Instead:

- **`pwa/src/styles/tokens.css`** — the single source of truth. Defines every surface/text/accent/state/chart-series color as a `:root` CSS custom property, exactly as enumerated in the design brief. Imported once in `pwa/src/main.jsx`.
- Components keep the existing inline-`style` pattern (no new styling library), but every color value becomes `"var(--token-name)"` instead of a literal. CSS custom properties resolve fine as SVG presentation-attribute strings too (`fill="var(--accent)"`), so this covers Recharts props as well as plain JSX.
- **`pwa/src/styles/chartTheme.js`** — a small JS module, the single shared place chart components import series colors and shared Recharts styling (grid stroke, axis tick/label color, tooltip theming) from. Re-exports the same tokens as `var(--...)` strings so there is one definition, not two.

## Chart library

**Recharts 3.9.0** — the only chart library in the project, one usage site (`WeightTrendChart.jsx`). No multi-library conflict. Theming goes through Recharts' own props (`stroke`/`fill` on `CartesianGrid`/`XAxis`/`YAxis`/`Tooltip`/series), not CSS overrides, per Recharts' normal theming mechanism.

## Design decisions requiring judgment (not explicit in the brief)

1. **Deficit-state thresholds.** `sevenDayBalance`/today's balance in `lib/balance.js` is `burn - intake`: positive = deficit (good), negative = surplus. The user's goal (`settings.goal_type` + `goal_amount`) sets the target. New pure function `deficitState(balance, goalType, goalAmount)` in `pwa/src/lib/balance.js`:
   - `goal_type: "deficit"` (target: burn ≥ intake by `goal_amount`): `balance >= goal_amount` → good; `0 <= balance < goal_amount` → warn; `balance < 0` → over.
   - `goal_type: "maintain"` (target: balance ≈ 0, `goal_amount` is the tolerance band): `|balance| <= goal_amount` → good; `goal_amount < |balance| <= 2*goal_amount` → warn; else → over.
   - `goal_type: "surplus"` (target: intake ≥ burn by `goal_amount`, i.e. balance ≤ `-goal_amount`): `balance <= -goal_amount` → good; `-goal_amount < balance <= 0` → warn; `balance > 0` → over.
   - Symmetric across the three goal types, and it's the only piece of real branching logic this redesign introduces → gets a Vitest test alongside the existing `balance.test.js`.

2. **Food-photo surface rule is currently a no-op.** `PhotoMealForm.jsx` never renders the captured photo back to the user (just a file input → estimating → confirm state machine, no `<img>`). The brief's "lighter surface for food photo screens" rule has nothing to attach to today. Not adding a speculative lighter-surface style with no visible photo to apply it to (YAGNI) — noting it here so it's not forgotten if photo preview/thumbnails are added later.

3. **Weight goal reference line color.** Not one of the 7 named chart series (burn/weight/HRV/stress/RHR/sleep/extra) — it's a target marker, not a data series. Using `--accent` (teal), dashed, distinct from the `weight` series' solid blue line, consistent with accent's stated role ("key metric" / target).

4. **RHR vs. `--alert` collision.** Dashboard's "Resting HR" stat is plain text today (no color), so no collision exists yet. Flagging as satisfied by construction: RHR only gets its series color (`#FF6B8A`... but per the brief's own collision rule, recolor RHR to the purple `#B77BFF` bucket is already reserved for HRV). Re-reading the brief: HRV is `#B77BFF` and RHR is `#FF6B8A`, which collides with `--alert` `#FF6B4A`. Per the brief's explicit resolution ("if they'd collide, recolor RHR to the purple"), **RHR's series color becomes `#B77BFF` (same as HRV)** — but RHR and HRV never appear as two series on the same chart today (only weight is charted), so no same-chart legend collision occurs regardless. Token still defined for future charts.

## Scope (files touched)

- New: `pwa/src/styles/tokens.css`, `pwa/src/styles/chartTheme.js`
- Modified: `pwa/src/main.jsx` (import tokens.css), `pwa/src/App.jsx`, `pwa/src/pages/Dashboard.jsx`, `pwa/src/pages/Settings.jsx`, `pwa/src/pages/Login.jsx`, `pwa/src/components/MealForm.jsx`, `pwa/src/components/PhotoMealForm.jsx`, `pwa/src/components/WeightForm.jsx`, `pwa/src/components/WeightTrendChart.jsx`, `pwa/src/lib/balance.js` (+ test)

## Testing

- `deficitState()` gets Vitest coverage (good/warn/over for all three goal types), matching this project's existing `pwa/src/lib/*.test.js` convention.
- Manual: run the Vite dev server, view Dashboard/Settings/Login on a mobile viewport in both the light and dark OS color-scheme (app is dark-only by design, so this just confirms no `prefers-color-scheme` leakage from un-migrated inline styles), confirm the deficit badge reads clearly at a glance, confirm chart series colors are stable and don't collide.

## Out of scope

- Any new dependency (Tailwind, chart library swap, icon library).
- Redesigning layout/information architecture — this is a color/token/typography pass over the existing structure.
- The food-photo lighter-surface rule (see decision #2) — nothing to apply it to yet.
