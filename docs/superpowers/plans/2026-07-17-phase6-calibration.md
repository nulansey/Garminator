# Phase 6: Calibration Factor + Low-Log-Day Flagging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the owner's personal logging-bias correction factor (predicted balance vs actual weight-trend change), and flag days whose logs are too incomplete to trust — both display-only, never rewriting the raw numbers.

**Architecture:** Pure functions over data the app already has (`meals`, `weights`, `daily_metrics`). `calibration.js` computes the factor over a trailing window, excluding flagged low-log days; the dashboard renders the factor alongside raw balance and marks flagged days. No new tables, no new API calls, no new user input.

**Tech Stack:** React 19, Vitest (already added in Phase 4). Pure JS.

**Spec:** `docs/superpowers/specs/2026-07-17-meals-vision-calibration-design.md` — Phase 6 section. Depends on Phases 4–5 (meal data) and the skeleton's weight rolling-average.

## Global Constraints

- **Display only.** The raw logged balance is always shown; the corrected estimate sits alongside it, clearly labeled. Never show a single "true" number that hides the correction.
- **Energy bridge:** 3500 kcal ≈ 1 lb.
- **Window:** trailing 21 days (default; a named constant, adjustable).
- **Low-log day:** logged intake below 800 kcal OR fewer than 2 meals that day (defaults; named constants, adjustable). Flagged days are excluded from calibration AND surfaced on the dashboard.
- Reuses `sevenDayBalance`/`dayIntake` shapes from Phase 4 and the 7-day rolling weight average from the skeleton's `WeightTrendChart` logic.
- Everything under `pwa/`.

---

### Task 1: Low-log-day flagging + Vitest

**Files:**
- Create: `pwa/src/lib/lowLog.js`, `pwa/src/lib/lowLog.test.js`

**Interfaces:**
- Produces:
  - `LOW_LOG_KCAL = 800`, `LOW_LOG_MIN_MEALS = 2` (exported constants).
  - `isLowLog(meals: {intake_date, calories}[], date: string): boolean` — true if that intake_date has < 2 meals or < 800 total kcal. Consumed by Task 2 (exclusion) and Task 3 (dashboard flag).

- [ ] **Step 1: Write the failing test — `pwa/src/lib/lowLog.test.js`**

```js
import { describe, it, expect } from "vitest";
import { isLowLog } from "./lowLog.js";

describe("isLowLog", () => {
  it("flags a day with too few meals", () => {
    const meals = [{ intake_date: "2026-07-17", calories: 1500 }];
    expect(isLowLog(meals, "2026-07-17")).toBe(true); // only 1 meal
  });
  it("flags a day with implausibly low total", () => {
    const meals = [
      { intake_date: "2026-07-17", calories: 300 },
      { intake_date: "2026-07-17", calories: 200 },
    ];
    expect(isLowLog(meals, "2026-07-17")).toBe(true); // 500 < 800
  });
  it("does not flag a well-logged day", () => {
    const meals = [
      { intake_date: "2026-07-17", calories: 600 },
      { intake_date: "2026-07-17", calories: 700 },
      { intake_date: "2026-07-17", calories: 500 },
    ];
    expect(isLowLog(meals, "2026-07-17")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `lowLog.js` not found.

- [ ] **Step 3: Implement `pwa/src/lib/lowLog.js`**

```js
export const LOW_LOG_KCAL = 800;
export const LOW_LOG_MIN_MEALS = 2;

export function isLowLog(meals, date) {
  const dayMeals = meals.filter((m) => m.intake_date === date);
  if (dayMeals.length < LOW_LOG_MIN_MEALS) return true;
  const total = dayMeals.reduce((s, m) => s + Number(m.calories), 0);
  return total < LOW_LOG_KCAL;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add pwa/src/lib/lowLog.js pwa/src/lib/lowLog.test.js
git commit -m "feat: low-log-day flagging helper"
```

---

### Task 2: Calibration factor + Vitest

**Files:**
- Create: `pwa/src/lib/calibration.js`, `pwa/src/lib/calibration.test.js`

**Interfaces:**
- Consumes: `dayIntake` from `./balance.js`, `isLowLog` from `./lowLog.js`.
- Produces:
  - `CALIBRATION_WINDOW_DAYS = 21`, `KCAL_PER_LB = 3500` (constants).
  - `rollingAvg(weights, date, windowDays=7): number|null` — 7-day trailing mean of weigh-ins ending at `date` (null if none in window).
  - `calibrationFactor({ days, meals, weights, endDate }): { factor: number, predictedLb: number, actualLb: number, usableDays: number } | null` — over the trailing window ending `endDate`, sum burn−intake for non-low-log days (predicted balance → predictedLb via /3500), compare to the change in 7-day rolling weight average across the window (actualLb). `factor = predictedLb / actualLb` when both are meaningful; null if too little data (usableDays < 7 or actualLb ≈ 0).

- [ ] **Step 1: Write the failing test — `pwa/src/lib/calibration.test.js`**

```js
import { describe, it, expect } from "vitest";
import { rollingAvg, calibrationFactor } from "./calibration.js";

describe("rollingAvg", () => {
  it("averages weigh-ins within the trailing window", () => {
    const weights = [
      { measured_at: "2026-07-10T12:00:00Z", weight: 170 },
      { measured_at: "2026-07-16T12:00:00Z", weight: 168 },
    ];
    expect(rollingAvg(weights, "2026-07-16", 7)).toBe(169);
  });
  it("returns null with no weigh-ins in window", () => {
    expect(rollingAvg([], "2026-07-16", 7)).toBe(null);
  });
});

describe("calibrationFactor", () => {
  it("computes factor from predicted vs actual over the window", () => {
    // 21 days, each burn 2000, intake 1500 (well-logged: 3 meals of 500).
    // Predicted balance = 21 * 500 = 10500 kcal deficit -> 3.0 lb predicted loss.
    // Weight: rolling avg drops from 170 (start window) to 168.5 (end) -> 1.5 lb actual loss.
    // factor = 3.0 / 1.5 = 2.0
    const dates = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date("2026-07-21T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const days = dates.map((date) => ({ date, total_kcal: 2000 }));
    const meals = dates.flatMap((date) => [
      { intake_date: date, calories: 500 },
      { intake_date: date, calories: 500 },
      { intake_date: date, calories: 500 },
    ]);
    const weights = [
      { measured_at: "2026-07-01T12:00:00Z", weight: 170 },
      { measured_at: "2026-07-21T12:00:00Z", weight: 168.5 },
    ];
    const r = calibrationFactor({ days, meals, weights, endDate: "2026-07-21" });
    expect(r.predictedLb).toBeCloseTo(3.0, 1);
    expect(r.actualLb).toBeCloseTo(1.5, 1);
    expect(r.factor).toBeCloseTo(2.0, 1);
    expect(r.usableDays).toBe(21);
  });

  it("returns null when there is too little usable data", () => {
    const r = calibrationFactor({ days: [], meals: [], weights: [], endDate: "2026-07-21" });
    expect(r).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `calibration.js` not found.

- [ ] **Step 3: Implement `pwa/src/lib/calibration.js`**

```js
import { dayIntake } from "./balance.js";
import { isLowLog } from "./lowLog.js";

export const CALIBRATION_WINDOW_DAYS = 21;
export const KCAL_PER_LB = 3500;

export function rollingAvg(weights, date, windowDays = 7) {
  const end = new Date(date + "T23:59:59Z").getTime();
  const start = end - windowDays * 86400000;
  const inWindow = weights.filter((w) => {
    const t = new Date(w.measured_at).getTime();
    return t > start && t <= end;
  });
  if (inWindow.length === 0) return null;
  return inWindow.reduce((s, w) => s + Number(w.weight), 0) / inWindow.length;
}

function windowDates(endDate, n) {
  const end = new Date(endDate + "T00:00:00Z");
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out; // newest first
}

export function calibrationFactor({ days, meals, weights, endDate }) {
  const burnByDate = Object.fromEntries(days.map((d) => [d.date, d.total_kcal ?? 0]));
  const dates = windowDates(endDate, CALIBRATION_WINDOW_DAYS);

  let predictedKcal = 0;
  let usableDays = 0;
  for (const date of dates) {
    if (isLowLog(meals, date)) continue; // exclude untrustworthy days
    predictedKcal += (burnByDate[date] ?? 0) - dayIntake(meals, date);
    usableDays++;
  }
  if (usableDays < 7) return null;

  const startDate = dates[dates.length - 1];
  const startAvg = rollingAvg(weights, startDate);
  const endAvg = rollingAvg(weights, endDate);
  if (startAvg == null || endAvg == null) return null;

  const predictedLb = predictedKcal / KCAL_PER_LB;      // + = predicted loss
  const actualLb = startAvg - endAvg;                    // + = actual loss
  if (Math.abs(actualLb) < 0.2) return null;             // trend too flat to divide

  return {
    factor: predictedLb / actualLb,
    predictedLb,
    actualLb,
    usableDays,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add pwa/src/lib/calibration.js pwa/src/lib/calibration.test.js
git commit -m "feat: calibration factor over trailing window, excluding low-log days"
```

---

### Task 3: Show calibration + low-log flag on the dashboard

**Files:**
- Modify: `pwa/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `calibrationFactor`, `isLowLog`, `intakeDate`, existing `days`/`meals`/`weights` state.

- [ ] **Step 1: Add imports near the other lib imports in `pwa/src/pages/Dashboard.jsx`**

```jsx
import { calibrationFactor } from "../lib/calibration.js";
import { isLowLog } from "../lib/lowLog.js";
```

- [ ] **Step 2: Flag today's balance when low-log**

In the balance section from Phase 4, replace the "Balance" `<li>` with a version that appends a flag when today is low-log:

```jsx
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Balance{isLowLog(meals, todayBucket) ? " ⚠️ (low log — not reliable)" : ""}</span>
                  <strong>{burnToday - inToday}</strong>
                </li>
```

- [ ] **Step 3: Add a calibration block after the 7-day balance `<li>`**

Immediately after the 7-day balance `<li>` (still inside the balance `<ul>`'s parent `<div>`, after the `</ul>` that closes the four balance rows and before `<MealForm .../>`), insert:

```jsx
              {(() => {
                const cal = calibrationFactor({
                  days, meals, weights: weights ?? [], endDate: todayBucket,
                });
                if (!cal) return <p style={{ color: "#64748b" }}>Calibration: need ~3 weeks of logs and weigh-ins.</p>;
                const pct = Math.round((cal.factor - 1) * 100);
                return (
                  <p style={{ color: "#64748b" }}>
                    Calibration ({cal.usableDays} usable days): scale shows {cal.actualLb.toFixed(1)} lb vs {cal.predictedLb.toFixed(1)} lb predicted.
                    {pct > 0
                      ? ` You likely eat ~${pct}% more than you log.`
                      : ` Your logs track the scale closely.`}
                  </p>
                );
              })()}
```

- [ ] **Step 4: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in. With real data present:
- If you have < ~3 weeks of logs/weigh-ins, the calibration line reads "need ~3 weeks…".
- Log only one small meal for today → the Balance row shows the ⚠️ low-log flag.
Expected: raw balance numbers stay visible; the calibration line is additive, never replacing them.

- [ ] **Step 5: Full check + commit**

```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

```bash
cd ..
git add pwa/src/pages/Dashboard.jsx
git commit -m "feat: dashboard shows calibration factor and low-log flag"
```

---

## Phase acceptance

1. `cd pwa && npm test && npm run build` — tests pass (including the synthetic calibration window → factor 2.0), build succeeds.
2. With ~3 weeks of data, the dashboard shows a correction factor alongside the raw balance.
3. A day with implausibly low logged intake shows the ⚠️ flag and is excluded from the calibration (verified by the unit test excluding low-log days).
4. Raw balance numbers remain visible — the calibration line never replaces them.
5. Driven in the browser signed in as the owner.

## Manual steps owned by the user

- None (pure computation over existing data). Thresholds (`LOW_LOG_KCAL`, `LOW_LOG_MIN_MEALS`, `CALIBRATION_WINDOW_DAYS`) are named constants — adjust in-code once you've used it.
