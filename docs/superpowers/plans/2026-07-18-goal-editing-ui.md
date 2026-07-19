# Goal-Editing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit the calorie goal, tip timing, and weight goal from a PWA Settings view, backed by a one-row Supabase `settings` table that the Python tips pipeline also reads.

**Architecture:** A new `settings` table (single row) becomes the source of truth for goal_type/goal_amount/weight_goal_lb/slots. The PWA reads+updates it via RLS; `src/main.py` reads it via the existing `fetch.get_client()`. `config.yaml` loses its `goal:` key; `WeightTrendChart` loses its hardcoded `GOAL_WEIGHT = 155`.

**Tech Stack:** React 19, Vite 8, `@supabase/supabase-js` 2.x, Vitest; Python 3.12 + supabase-py.

**Spec:** `docs/superpowers/specs/2026-07-18-goal-editing-ui-design.md`.

## Global Constraints

- PWA changes live under `pwa/`; pipeline changes under `src/`. Timezone Pacific/Honolulu.
- Owner UUID for RLS: `3ddda5ba-7228-483f-bcc7-1404eab54a2e`.
- `settings` is exactly one row, `id = 1`. PWA gets `select` + `update` only — never `insert`/`delete`.
- `slots` jsonb shape matches `src/main.py`'s `DEFAULT_SLOTS`: `{"morning":{"enabled":true,"hour":7},"midday":{"enabled":true,"hour":13},"evening":{"enabled":true,"hour":20}}`.
- Validation: `goal_amount` int 0–2000; `weight_goal_lb` 50–500; ≥1 slot enabled; enabled slots have distinct hours (0–23).
- `goal_type` ∈ `deficit|maintain|surplus`.
- No new Python tests for the pipeline swap (spec decision) — verify existing suite + a live `--dry-run`.
- Shell commands run from `pwa/` unless the path says otherwise.

---

### Task 1: `settings` table, seed row, RLS

**Files:**
- Create: `pwa/settings-table.sql` (owner runs it in the Supabase SQL editor; committed as documentation)

**Interfaces:**
- Produces: a `settings` table with one seeded row and owner-scoped `select`/`update` policies. Consumed by Tasks 3–5.

- [ ] **Step 1: Create `pwa/settings-table.sql`**

```sql
-- One-row settings table: the shared source of truth for the calorie goal,
-- tip timing, and weight goal (PWA edits it; the Python pipeline reads it).
-- Run in the Supabase SQL editor.

create table settings (
  id int primary key default 1,
  goal_type text not null check (goal_type in ('deficit','maintain','surplus')),
  goal_amount int not null,
  weight_goal_lb numeric not null,
  slots jsonb not null,
  updated_at timestamptz default now()
);

-- Seed the single row from the current config.yaml values + the chart's 155 lb.
insert into settings (id, goal_type, goal_amount, weight_goal_lb, slots) values (
  1, 'deficit', 500, 155,
  '{"morning":{"enabled":true,"hour":7},"midday":{"enabled":true,"hour":13},"evening":{"enabled":true,"hour":20}}'
);

alter table settings enable row level security;

create policy "owner reads settings"
  on settings for select
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');

create policy "owner updates settings"
  on settings for update
  using (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e')
  with check (auth.uid() = '3ddda5ba-7228-483f-bcc7-1404eab54a2e');
```

- [ ] **Step 2: Owner runs the SQL**

Paste `pwa/settings-table.sql` into the Supabase SQL editor and run it. Expected: "Success. No rows returned." (the table, seed row, and policies are created).

- [ ] **Step 3: Commit**

```bash
cd ..
git add pwa/settings-table.sql
git commit -m "feat: settings table with seed row and owner RLS"
```

---

### Task 2: Settings validation helper + Vitest

**Files:**
- Create: `pwa/src/lib/settingsValidation.js`, `pwa/src/lib/settingsValidation.test.js`

**Interfaces:**
- Produces: `settingsErrors(s: {goal_type, goal_amount, weight_goal_lb, slots}): string[]` — empty array = valid; otherwise human-readable error strings. Consumed by Task 3's Settings view.

- [ ] **Step 1: Write the failing test — `pwa/src/lib/settingsValidation.test.js`**

```js
import { describe, it, expect } from "vitest";
import { settingsErrors } from "./settingsValidation.js";

const valid = {
  goal_type: "deficit",
  goal_amount: 500,
  weight_goal_lb: 155,
  slots: {
    morning: { enabled: true, hour: 7 },
    midday: { enabled: true, hour: 13 },
    evening: { enabled: true, hour: 20 },
  },
};

describe("settingsErrors", () => {
  it("returns no errors for valid settings", () => {
    expect(settingsErrors(valid)).toEqual([]);
  });
  it("rejects an out-of-range calorie amount", () => {
    expect(settingsErrors({ ...valid, goal_amount: 3000 }).length).toBeGreaterThan(0);
  });
  it("rejects an out-of-range weight goal", () => {
    expect(settingsErrors({ ...valid, weight_goal_lb: 20 }).length).toBeGreaterThan(0);
  });
  it("rejects all slots disabled", () => {
    const slots = {
      morning: { enabled: false, hour: 7 },
      midday: { enabled: false, hour: 13 },
      evening: { enabled: false, hour: 20 },
    };
    expect(settingsErrors({ ...valid, slots }).length).toBeGreaterThan(0);
  });
  it("rejects two enabled slots at the same hour", () => {
    const slots = {
      morning: { enabled: true, hour: 13 },
      midday: { enabled: true, hour: 13 },
      evening: { enabled: false, hour: 20 },
    };
    expect(settingsErrors({ ...valid, slots }).length).toBeGreaterThan(0);
  });
  it("allows disabled slots to share an hour", () => {
    const slots = {
      morning: { enabled: true, hour: 7 },
      midday: { enabled: false, hour: 7 },
      evening: { enabled: false, hour: 7 },
    };
    expect(settingsErrors({ ...valid, slots })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `settingsValidation.js` not found.

- [ ] **Step 3: Implement `pwa/src/lib/settingsValidation.js`**

```js
const SLOT_NAMES = ["morning", "midday", "evening"];

export function settingsErrors(s) {
  const errors = [];

  if (!Number.isInteger(s.goal_amount) || s.goal_amount < 0 || s.goal_amount > 2000) {
    errors.push("Calorie amount must be a whole number between 0 and 2000.");
  }
  if (!(s.weight_goal_lb >= 50 && s.weight_goal_lb <= 500)) {
    errors.push("Weight goal must be between 50 and 500 lb.");
  }

  const enabled = SLOT_NAMES.filter((n) => s.slots[n]?.enabled);
  if (enabled.length === 0) {
    errors.push("At least one tip time must stay enabled.");
  }
  for (const n of enabled) {
    const h = s.slots[n].hour;
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      errors.push(`${n} hour must be between 0 and 23.`);
    }
  }
  const hours = enabled.map((n) => s.slots[n].hour);
  if (new Set(hours).size !== hours.length) {
    errors.push("Enabled tip times must be at different hours.");
  }

  return errors;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd ..
git add pwa/src/lib/settingsValidation.js pwa/src/lib/settingsValidation.test.js
git commit -m "feat: settings validation helper with vitest"
```

---

### Task 3: Settings view + header toggle

**Files:**
- Create: `pwa/src/pages/Settings.jsx`
- Modify: `pwa/src/App.jsx`

**Interfaces:**
- Consumes: `supabase`, `settingsErrors`.
- Produces: `Settings({ onDone })` — loads the row, edits it, validates, `update`s it, calls `onDone()` when finished. `App` gains a `view` toggle (`"dashboard" | "settings"`) and a ⚙️ button.

- [ ] **Step 1: Create `pwa/src/pages/Settings.jsx`**

```jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { settingsErrors } from "../lib/settingsValidation.js";

const SLOT_NAMES = ["morning", "midday", "evening"];

export default function Settings({ onDone }) {
  const [s, setS] = useState(null);
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error

  useEffect(() => {
    supabase.from("settings").select("*").eq("id", 1).single().then(({ data }) => setS(data));
  }, []);

  if (s === null) return <p>Loading settings…</p>;

  function setSlot(name, patch) {
    setS({ ...s, slots: { ...s.slots, [name]: { ...s.slots[name], ...patch } } });
  }

  async function save(e) {
    e.preventDefault();
    const errs = settingsErrors(s);
    setErrors(errs);
    if (errs.length) return;
    setStatus("saving");
    const { error } = await supabase
      .from("settings")
      .update({
        goal_type: s.goal_type,
        goal_amount: s.goal_amount,
        weight_goal_lb: s.weight_goal_lb,
        slots: s.slots,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setStatus(error ? "error" : "saved");
  }

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Settings</h1>
        <button onClick={onDone}>Back</button>
      </header>
      <form onSubmit={save}>
        <h2>Calorie goal</h2>
        <select value={s.goal_type} onChange={(e) => setS({ ...s, goal_type: e.target.value })}
          style={{ padding: 8, marginRight: 8 }}>
          <option value="deficit">deficit</option>
          <option value="maintain">maintain</option>
          <option value="surplus">surplus</option>
        </select>
        <input type="number" value={s.goal_amount}
          onChange={(e) => setS({ ...s, goal_amount: Number(e.target.value) })}
          style={{ padding: 8, width: 120 }} /> kcal

        <h2>Weight goal</h2>
        <input type="number" step="0.1" value={s.weight_goal_lb}
          onChange={(e) => setS({ ...s, weight_goal_lb: Number(e.target.value) })}
          style={{ padding: 8, width: 120 }} /> lb

        <h2>Tip timing</h2>
        {SLOT_NAMES.map((name) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <input type="checkbox" checked={s.slots[name].enabled}
              onChange={(e) => setSlot(name, { enabled: e.target.checked })} />
            <span style={{ width: 80 }}>{name}</span>
            <input type="number" min="0" max="23" value={s.slots[name].hour}
              onChange={(e) => setSlot(name, { hour: Number(e.target.value) })}
              style={{ padding: 6, width: 70 }} /> :00
          </div>
        ))}

        {errors.map((msg) => <p key={msg} style={{ color: "crimson" }}>{msg}</p>)}
        <button type="submit" disabled={status === "saving"} style={{ padding: 8, marginTop: 12 }}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span style={{ color: "green", marginLeft: 8 }}>Saved</span>}
        {status === "error" && <span style={{ color: "crimson", marginLeft: 8 }}>Save failed</span>}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire the toggle into `pwa/src/App.jsx`**

Add the import near the other page imports:

```jsx
import Settings from "./pages/Settings.jsx";
```

Add a `view` state alongside the existing session state (inside the component, after the `session`/`loading` state):

```jsx
  const [view, setView] = useState("dashboard");
```

In the signed-in return block, replace the header + `<Dashboard />` with a view switch. The current signed-in return is:

```jsx
  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Calories</h1>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <Dashboard />
    </div>
  );
```

Replace it with:

```jsx
  if (view === "settings") return <Settings onDone={() => setView("dashboard")} />;

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Calories</h1>
        <div>
          <button onClick={() => setView("settings")} style={{ marginRight: 8 }}>⚙️ Settings</button>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <Dashboard />
    </div>
  );
```

- [ ] **Step 3: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in. Click ⚙️ Settings. Expected: the form loads with deficit / 500 / 155 and all three slots enabled at 7/13/20. Change the amount to `600`, Save → "Saved". Set two enabled slots to the same hour, Save → a validation error appears and nothing saves. Back → returns to the dashboard.

- [ ] **Step 4: Full check + commit**

```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

```bash
cd ..
git add pwa/src/pages/Settings.jsx pwa/src/App.jsx
git commit -m "feat: settings view for calorie goal, weight goal, and tip timing"
```

---

### Task 4: Wire weight goal into the chart

**Files:**
- Modify: `pwa/src/components/WeightTrendChart.jsx`, `pwa/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `settings.weight_goal_lb`.
- Produces: `WeightTrendChart` now takes a `goalWeight` prop instead of the hardcoded constant; `Dashboard` loads the settings row and passes it.

- [ ] **Step 1: Replace the constant with a prop in `pwa/src/components/WeightTrendChart.jsx`**

Delete the line `const GOAL_WEIGHT = 155;` and change the function signature + its uses:

```jsx
export default function WeightTrendChart({ weights, goalWeight = 155 }) {
  if (!weights || weights.length === 0) return <p>No weight entries yet.</p>;
  const data = withRollingAvg(weights);
  // Include the goal in the range so the reference line is always visible,
  // not just when actual weight happens to be near the goal.
  const values = data.flatMap((d) => [d.weight, d.avg]).concat(goalWeight);
  const domain = [Math.floor(Math.min(...values) - 3), Math.ceil(Math.max(...values) + 3)];
```

And in the JSX, change the reference line:

```jsx
        <ReferenceLine y={goalWeight} stroke="#16a34a" strokeDasharray="4 4"
          label={{ value: `Goal ${goalWeight}`, position: "insideTopRight", fontSize: 11 }} />
```

- [ ] **Step 2: Load settings in `pwa/src/pages/Dashboard.jsx`**

Add state alongside the existing `weights`/`meals` state:

```jsx
  const [goalWeight, setGoalWeight] = useState(155);
```

Add a loader (near `loadWeights`):

```jsx
  async function loadSettings() {
    const { data } = await supabase.from("settings").select("weight_goal_lb").eq("id", 1).single();
    if (data) setGoalWeight(Number(data.weight_goal_lb));
  }
```

Extend the existing `useEffect` to call it:

```jsx
  useEffect(() => {
    load();
    loadWeights();
    loadMeals();
    loadSettings();
  }, []);
```

- [ ] **Step 3: Pass the prop to the chart**

Change the chart render line from:

```jsx
      {weights === null ? <p>Loading weight…</p> : <WeightTrendChart weights={weights} />}
```

to:

```jsx
      {weights === null ? <p>Loading weight…</p> : <WeightTrendChart weights={weights} goalWeight={goalWeight} />}
```

- [ ] **Step 4: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in. The weight chart's goal line sits at 155. Go to Settings, change weight goal to 150, Save, Back, refresh. Expected: the goal line now sits at 150.

- [ ] **Step 5: Full check + commit**

```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

```bash
cd ..
git add pwa/src/components/WeightTrendChart.jsx pwa/src/pages/Dashboard.jsx
git commit -m "feat: weight chart goal line reads from settings"
```

---

### Task 5: Python pipeline reads settings

**Files:**
- Modify: `src/fetch.py`, `src/main.py`, `config.yaml`

**Interfaces:**
- Consumes: the `settings` row (Task 1); `fetch.get_client()` (already exists).
- Produces: `fetch.fetch_settings() -> dict`; `main.get_slots(slots)` takes a slots dict; `run()` reads goal + slots from settings.

- [ ] **Step 1: Add `fetch_settings()` to `src/fetch.py`**

After the existing `newest_date()` function, add:

```python
def fetch_settings(client=None):
    """The single settings row (goal + tip timing + weight goal)."""
    client = client or get_client()
    return client.table("settings").select("*").eq("id", 1).single().execute().data
```

- [ ] **Step 2: Change `get_slots` in `src/main.py` to take a slots dict**

Replace the current `get_slots`:

```python
def get_slots(config):
    """Slots from config merged over defaults; absent section = defaults."""
    slots = {k: dict(v) for k, v in DEFAULT_SLOTS.items()}
    for name, override in (config.get("slots") or {}).items():
        if name in slots:
            slots[name].update(override)
    return slots
```

with:

```python
def get_slots(slots_override):
    """Slots from settings merged over defaults; None/empty = defaults."""
    slots = {k: dict(v) for k, v in DEFAULT_SLOTS.items()}
    for name, override in (slots_override or {}).items():
        if name in slots:
            slots[name].update(override)
    return slots
```

- [ ] **Step 3: Read settings in `run()` in `src/main.py`**

Change the top of `run()` from:

```python
def run(args):
    config = load_config()
    now = datetime.now(ZoneInfo(config["timezone"]))
    today = now.date()
    today_iso = today.isoformat()
    slots = get_slots(config)
```

to:

```python
def run(args):
    config = load_config()
    settings = fetch.fetch_settings()
    now = datetime.now(ZoneInfo(config["timezone"]))
    today = now.date()
    today_iso = today.isoformat()
    slots = get_slots(settings["slots"])
```

And change the calorie-target line from:

```python
        target = calorie_target(burn, config["goal"]["type"], config["goal"]["amount"])
```

to:

```python
        target = calorie_target(burn, settings["goal_type"], settings["goal_amount"])
```

- [ ] **Step 4: Remove the `goal:` key from `config.yaml`**

Delete these lines:

```yaml
goal:
  type: deficit              # deficit | maintain | surplus
  amount: 500                # calories below/above yesterday's burn (ignored for maintain)
```

- [ ] **Step 5: Run the existing Python suite**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS (38 passed) — no test referenced `config["goal"]` or called `get_slots`, so the swap doesn't break them.

- [ ] **Step 6: Live dry-run verification**

Run (from repo root):
```bash
set -a && source .env && set +a && .venv/bin/python -m src.main --dry-run --slot morning
```
Expected: it prints a morning tip (or a stale-data nudge). The run reads `settings` from Supabase and computes the calorie target from `goal_type`/`goal_amount` — a successful run with no `KeyError` confirms the swap works end-to-end.

- [ ] **Step 7: Commit**

```bash
git add src/fetch.py src/main.py config.yaml
git commit -m "feat: tips pipeline reads goal and tip timing from settings table"
```

---

## Phase acceptance

1. `cd pwa && npm test && npm run build` — tests pass, build succeeds.
2. `.venv/bin/python -m pytest -q` — 38 pass.
3. Editing the calorie goal / weight goal / tip timing in the Settings view persists to Supabase; invalid input (bad amount, all slots off, duplicate enabled hours) blocks the save with an inline error.
4. The weight chart's goal line reflects the saved `weight_goal_lb`.
5. `python -m src.main --dry-run --slot morning` reads the settings row without error.

## Manual steps owned by the user

- Run `pwa/settings-table.sql` in the Supabase SQL editor (Task 1).
