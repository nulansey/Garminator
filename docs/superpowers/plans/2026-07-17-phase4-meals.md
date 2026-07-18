# Phase 4: Manual Meals + Calorie Balance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log meals by hand and show the day's calorie balance (Garmin burn − logged intake), with intake bucketed to 6am→6am local days.

**Architecture:** Extend the existing `pwa/` React app. A pure `intakeDate()` helper computes the 6am-rule bucket; a `MealForm` inserts `meals` rows; the dashboard reads today's meals + `daily_metrics` and renders calories in / out / balance plus a 7-day rolling balance. This phase adds Vitest to test the pure logic (the skeleton had no JS test harness by design; real logic now justifies one).

**Tech Stack:** React 19, Vite 8, `@supabase/supabase-js` 2.x, Vitest (new dev dependency).

**Spec:** `docs/superpowers/specs/2026-07-17-meals-vision-calibration-design.md` — Phase 4 section.

## Global Constraints

- Everything lives under `pwa/`. Do NOT touch `src/` (Python) or `web/` (FastAPI panel).
- Timezone is **Pacific/Honolulu** everywhere. Honolulu is UTC−10, no DST.
- **6am rule:** a meal whose Honolulu-local hour is `< 6` belongs to the **previous** calendar date; otherwise today's date. `intake_date` is computed once at insert and stored on the row.
- Burn source is Garmin `total_kcal` from `daily_metrics` — never add a separate BMR estimate.
- Owner UUID for RLS: `3ddda5ba-7228-483f-bcc7-1404eab54a2e` (same as the skeleton's `weights` policies).
- `meals` table already exists: `id, eaten_at timestamptz, intake_date date, name text, calories int, source text ('photo'|'manual'), created_at`. No schema change.
- Shell commands run from `pwa/` unless the path says otherwise.

---

### Task 1: `intakeDate()` 6am-rule helper + Vitest

**Files:**
- Create: `pwa/src/lib/intakeDate.js`, `pwa/src/lib/intakeDate.test.js`
- Modify: `pwa/package.json` (add Vitest + `test` script)

**Interfaces:**
- Produces: `intakeDate(now: Date = new Date()): string` — returns `YYYY-MM-DD` (the Honolulu-bucketed intake date). Consumed by Task 3's `MealForm`.

- [ ] **Step 1: Add Vitest and a test script to `pwa/package.json`**

Add to `devDependencies`: `"vitest": "^3.2.0"`. Add to `scripts`: `"test": "vitest run"`. Then:

```bash
npm install
```

- [ ] **Step 2: Write the failing test — `pwa/src/lib/intakeDate.test.js`**

```js
import { describe, it, expect } from "vitest";
import { intakeDate } from "./intakeDate.js";

// Honolulu is UTC-10. 02:00 HST on 2026-07-17 == 12:00 UTC same day.
// 14:00 HST on 2026-07-17 == 00:00 UTC on 2026-07-18.
describe("intakeDate", () => {
  it("buckets pre-6am HST to the previous day", () => {
    expect(intakeDate(new Date("2026-07-17T12:00:00Z"))).toBe("2026-07-16");
  });
  it("buckets 6am HST exactly to the same day", () => {
    // 06:00 HST == 16:00 UTC
    expect(intakeDate(new Date("2026-07-17T16:00:00Z"))).toBe("2026-07-17");
  });
  it("buckets afternoon HST to the same day", () => {
    expect(intakeDate(new Date("2026-07-18T00:00:00Z"))).toBe("2026-07-17");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `intakeDate` is not defined / module not found.

- [ ] **Step 4: Implement `pwa/src/lib/intakeDate.js`**

```js
// Returns the 6am->6am intake-day bucket (YYYY-MM-DD) in Pacific/Honolulu.
// A meal before 6am local counts toward the previous calendar day.
export function intakeDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Honolulu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour")) % 24; // Intl can emit "24" at midnight
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (hour < 6) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
cd ..
git add pwa/package.json pwa/package-lock.json pwa/src/lib/intakeDate.js pwa/src/lib/intakeDate.test.js
git commit -m "feat: 6am-rule intakeDate helper with vitest"
```

---

### Task 2: RLS policies for `meals`

**Files:**
- Create: `pwa/supabase-rls-meals.sql` (owner runs it; committed as documentation)

**Interfaces:**
- Produces: owner-scoped `select`/`insert`/`delete` access to `meals`, consumed by Tasks 3–4.

- [ ] **Step 1: Create `pwa/supabase-rls-meals.sql`**

```sql
-- Owner-only access to meals, gated on the specific uid (same owner as the
-- skeleton's weights/daily_metrics policies). Run in the Supabase SQL editor.

create policy "owner reads meals"
  on meals for select
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');

create policy "owner inserts meals"
  on meals for insert
  with check (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');

create policy "owner deletes meals"
  on meals for delete
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');
```

- [ ] **Step 2: Owner runs the SQL**

Paste `pwa/supabase-rls-meals.sql` into the Supabase SQL editor and run it. Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
cd ..
git add pwa/supabase-rls-meals.sql
git commit -m "feat: owner-scoped RLS policies for meals"
```

---

### Task 3: `MealForm` — insert a manual meal

**Files:**
- Create: `pwa/src/components/MealForm.jsx`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient.js`; `intakeDate` from `../lib/intakeDate.js`.
- Produces: `MealForm({ onSaved })` — name + calories inputs and a Save button; inserts one `meals` row (`source: 'manual'`, `eaten_at` = now ISO, `intake_date` = `intakeDate()`); calls `onSaved()` on success; keeps typed values and shows an error on failure.

- [ ] **Step 1: Create `pwa/src/components/MealForm.jsx`**

```jsx
import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";

export default function MealForm({ onSaved }) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError(false);
    setSaving(true);
    const { error } = await supabase.from("meals").insert({
      name,
      calories: Number(calories),
      source: "manual",
      eaten_at: new Date().toISOString(),
      intake_date: intakeDate(),
    });
    setSaving(false);
    if (error) {
      setError(true); // keep typed values so nothing is re-entered
    } else {
      setName("");
      setCalories("");
      onSaved();
    }
  }

  return (
    <form onSubmit={save} style={{ display: "flex", gap: 8, margin: "1rem 0", flexWrap: "wrap" }}>
      <input
        type="text"
        required
        placeholder="Meal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: 2, minWidth: 120, padding: 8 }}
      />
      <input
        type="number"
        required
        placeholder="Calories"
        value={calories}
        onChange={(e) => setCalories(e.target.value)}
        style={{ flex: 1, minWidth: 90, padding: 8 }}
      />
      <button type="submit" disabled={saving} style={{ padding: 8 }}>
        {saving ? "Saving…" : "Log meal"}
      </button>
      {error && <span style={{ color: "crimson" }}>Save failed</span>}
    </form>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (the component is imported in Task 5; a standalone build here just confirms no syntax error — if the bundler tree-shakes it out, that's fine).

- [ ] **Step 3: Commit**

```bash
cd ..
git add pwa/src/components/MealForm.jsx
git commit -m "feat: MealForm inserts manual meals with 6am bucketing"
```

---

### Task 4: `balance()` helpers + Vitest

**Files:**
- Create: `pwa/src/lib/balance.js`, `pwa/src/lib/balance.test.js`

**Interfaces:**
- Produces:
  - `dayIntake(meals: {intake_date, calories}[], date: string): number` — sum of calories for that intake_date.
  - `sevenDayBalance(days: {date, total_kcal}[], meals: {intake_date, calories}[], today: string): number` — sum of (burn − intake) over the 7 intake-dates ending at `today`. Consumed by Task 5's dashboard.

- [ ] **Step 1: Write the failing test — `pwa/src/lib/balance.test.js`**

```js
import { describe, it, expect } from "vitest";
import { dayIntake, sevenDayBalance } from "./balance.js";

describe("dayIntake", () => {
  it("sums calories for the given intake_date only", () => {
    const meals = [
      { intake_date: "2026-07-17", calories: 500 },
      { intake_date: "2026-07-17", calories: 300 },
      { intake_date: "2026-07-16", calories: 900 },
    ];
    expect(dayIntake(meals, "2026-07-17")).toBe(800);
  });
  it("returns 0 when no meals match", () => {
    expect(dayIntake([], "2026-07-17")).toBe(0);
  });
});

describe("sevenDayBalance", () => {
  it("sums burn minus intake over the 7 days ending today", () => {
    const days = [
      { date: "2026-07-17", total_kcal: 2000 },
      { date: "2026-07-16", total_kcal: 2000 },
    ];
    const meals = [
      { intake_date: "2026-07-17", calories: 1500 },
      { intake_date: "2026-07-16", calories: 1800 },
      { intake_date: "2026-07-01", calories: 9999 }, // outside window, ignored
    ];
    // (2000-1500) + (2000-1800) = 700
    expect(sevenDayBalance(days, meals, "2026-07-17")).toBe(700);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `balance.js` not found.

- [ ] **Step 3: Implement `pwa/src/lib/balance.js`**

```js
export function dayIntake(meals, date) {
  return meals
    .filter((m) => m.intake_date === date)
    .reduce((sum, m) => sum + Number(m.calories), 0);
}

// Balance = burn - intake, summed over the 7 intake-dates ending at `today`.
// Garmin burn is calendar-day; intake is 6am-bucketed. The minor window
// mismatch is accepted (see spec decision #2).
export function sevenDayBalance(days, meals, today) {
  const burnByDate = Object.fromEntries(days.map((d) => [d.date, d.total_kcal ?? 0]));
  const end = new Date(today + "T00:00:00Z");
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    total += (burnByDate[iso] ?? 0) - dayIntake(meals, iso);
  }
  return total;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd ..
git add pwa/src/lib/balance.js pwa/src/lib/balance.test.js
git commit -m "feat: calorie balance helpers with vitest"
```

---

### Task 5: Wire meals + balance into the dashboard

**Files:**
- Modify: `pwa/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `MealForm`, `intakeDate`, `dayIntake`, `sevenDayBalance`, `supabase`.

- [ ] **Step 1: Add imports at the top of `pwa/src/pages/Dashboard.jsx`**

After the existing `WeightTrendChart` import, add:

```jsx
import MealForm from "../components/MealForm.jsx";
import { intakeDate } from "../lib/intakeDate.js";
import { dayIntake, sevenDayBalance } from "../lib/balance.js";
```

- [ ] **Step 2: Add meals state + loader (inside the component, alongside the `weights` state)**

```jsx
  const [meals, setMeals] = useState(null);

  async function loadMeals() {
    const { data } = await supabase
      .from("meals")
      .select("id, intake_date, name, calories")
      .order("eaten_at", { ascending: false });
    setMeals(data ?? []);
  }
```

Extend the existing `useEffect` to also call `loadMeals()`:

```jsx
  useEffect(() => {
    load();
    loadWeights();
    loadMeals();
  }, []);
```

- [ ] **Step 3: Add a delete handler (inside the component)**

```jsx
  async function deleteMeal(id) {
    await supabase.from("meals").delete().eq("id", id);
    loadMeals();
  }
```

- [ ] **Step 4: Render the balance + meals section**

In the returned JSX, immediately after the closing `</ul>` of the Garmin stats list and before the `<h2>Weight</h2>` line, insert:

```jsx
      <h2>Today's balance</h2>
      {meals === null ? (
        <p>Loading meals…</p>
      ) : (
        (() => {
          const todayBucket = intakeDate();
          const inToday = dayIntake(meals, todayBucket);
          const burnToday = today.total_kcal ?? 0;
          const weekBalance = sevenDayBalance(days, meals, todayBucket);
          const todayMeals = meals.filter((m) => m.intake_date === todayBucket);
          return (
            <div>
              <ul style={{ listStyle: "none", padding: 0 }}>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Calories in</span><strong>{inToday}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Calories out (in progress)</span><strong>{burnToday}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Balance</span><strong>{burnToday - inToday}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#64748b" }}>
                  <span>7-day balance</span><strong>{weekBalance}</strong>
                </li>
              </ul>
              <MealForm onSaved={loadMeals} />
              <ul style={{ listStyle: "none", padding: 0 }}>
                {todayMeals.map((m) => (
                  <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                    <span>{m.name} — {m.calories}</span>
                    <button onClick={() => deleteMeal(m.id)} style={{ padding: "2px 8px" }}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      )}

```

- [ ] **Step 5: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in. Log a meal (e.g. "Lunch", 700). Expected: it appears in today's list, "Calories in" rises by 700, "Balance" updates. Delete it → the list and balance revert. If it's currently before 6am Honolulu time, the meal is bucketed to yesterday and won't appear under today — that's correct behavior.

- [ ] **Step 6: Full check + commit**

```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

```bash
cd ..
git add pwa/src/pages/Dashboard.jsx
git commit -m "feat: dashboard shows calorie balance and today's meals"
```

---

## Phase acceptance

1. `cd pwa && npm test && npm run build` — tests pass, build succeeds.
2. A meal logged after 6am HST appears under today and moves the balance; one logged before 6am HST buckets to the previous day.
3. Deleting a meal updates the balance.
4. Driven in the browser, signed in as the owner.

## Manual steps owned by the user

- Run `pwa/supabase-rls-meals.sql` in the Supabase SQL editor (Task 2).
