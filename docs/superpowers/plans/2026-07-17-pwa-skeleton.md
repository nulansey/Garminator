# PWA Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-installable React PWA in a new `pwa/` subdirectory that authenticates the owner via Supabase magic link, shows Garmin daily metrics from the `daily_metrics` table, and lets the owner log weight and see a trend chart against a 155 lb goal line.

**Architecture:** Self-contained `pwa/` at the repo root — its own npm/Vite toolchain, sharing nothing with the Python code except Supabase and the git repo. React + Vite + `vite-plugin-pwa` for the installable shell, `@supabase/supabase-js` for auth and data (anon/publishable key only, gated by RLS on the owner's uid), Recharts for the weight trend.

**Tech Stack:** Node 22, React 19, Vite 8, vite-plugin-pwa 1.x, @supabase/supabase-js 2.x, recharts 3.x.

**Spec:** `docs/superpowers/specs/2026-07-17-pwa-skeleton-design.md` — read it first.

## Global Constraints

- Everything for this phase lives under `pwa/`. Do NOT modify `src/` (Python fetch/tips) or `web/` (existing FastAPI panel). The FastAPI panel keeps running.
- Do NOT modify `src/garmin.py` — weight is entered manually, never fetched.
- The frontend uses the Supabase **publishable/anon** key only (`VITE_SUPABASE_ANON_KEY`, an `sb_publishable_...` value). The secret key must NEVER appear in `pwa/` code or `pwa/.env.local`.
- `pwa/.env.local` and `pwa/node_modules` are gitignored; never commit them.
- Goal weight this phase is a hardcoded constant: **155** (pounds). Weight is entered and displayed in pounds.
- No JS unit-test harness this phase (spec decision). Verification is `npm run build` output and driving the running app in a browser.
- All shell commands run from `pwa/` unless the path says otherwise.
- Access control is defense-in-depth: RLS policies gate on the owner's specific `auth.uid()`, AND new signups are disabled in the Supabase dashboard. Both are required.
- This is a skeleton — keep it minimal. No state-management library, no component library, no router beyond simple session-based conditional rendering.

---

### Task 1: Scaffold the `pwa/` app and PWA build

**Files:**
- Create: `pwa/package.json`, `pwa/vite.config.js`, `pwa/index.html`, `pwa/.env.local.example`, `pwa/src/main.jsx`, `pwa/src/App.jsx`, `pwa/src/supabaseClient.js`
- Modify: `.gitignore` (repo root)
- Create (owner, not committed): `pwa/.env.local`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a Vite React app that builds to a PWA. `supabaseClient.js` exports `supabase` (a `SupabaseClient` created from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`). `App` is the root component (a placeholder this task; real content in Task 2+).

- [ ] **Step 1: Create `pwa/package.json`**

```json
{
  "name": "garmin-pwa",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.110.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "recharts": "^3.9.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.0",
    "vite": "^8.1.0",
    "vite-plugin-pwa": "^1.3.0"
  }
}
```

- [ ] **Step 2: Create `pwa/vite.config.js`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Garmin Calorie Tracker",
        short_name: "Calories",
        description: "Weight and calorie tracking on top of Garmin data",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          // Placeholder: a single inline-generatable icon is enough for the
          // skeleton. Real icons are a later polish step. vite-plugin-pwa
          // will still emit a valid manifest without icons listed.
        ],
      },
    }),
  ],
});
```

- [ ] **Step 3: Create `pwa/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Garmin Calorie Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `pwa/src/supabaseClient.js`**

```js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — see pwa/.env.local.example"
  );
}

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 5: Create `pwa/src/App.jsx` (placeholder)**

```jsx
export default function App() {
  return <h1>Garmin Calorie Tracker</h1>;
}
```

- [ ] **Step 6: Create `pwa/src/main.jsx`**

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Create `pwa/.env.local.example`**

```
# Copy to pwa/.env.local and fill in. Use the PUBLISHABLE/ANON key only.
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

- [ ] **Step 8: Add gitignore entries (repo root `.gitignore`)**

Append these lines:

```
pwa/node_modules/
pwa/dist/
pwa/.env.local
```

- [ ] **Step 9: Owner creates `pwa/.env.local`**

Copy `pwa/.env.local.example` to `pwa/.env.local` and fill in the real project URL and the `sb_publishable_...` anon key (Supabase dashboard → Project Settings → API). This file is gitignored.

- [ ] **Step 10: Install and build**

Run (from `pwa/`):
```bash
npm install
npm run build
```
Expected: build succeeds; `pwa/dist/` contains `sw.js` and `manifest.webmanifest`. Verify:
```bash
ls dist/sw.js dist/manifest.webmanifest
```
Expected: both paths exist (no "No such file").

- [ ] **Step 11: Commit**

```bash
cd ..
git add .gitignore pwa/package.json pwa/package-lock.json pwa/vite.config.js pwa/index.html pwa/.env.local.example pwa/src
git commit -m "feat: scaffold PWA app shell with vite-plugin-pwa"
```

---

### Task 2: Supabase RLS policies + magic-link auth

**Files:**
- Create: `pwa/supabase-rls.sql` (owner runs it in the Supabase SQL editor; committed as documentation)
- Create: `pwa/src/pages/Login.jsx`
- Modify: `pwa/src/App.jsx`

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient.js`.
- Produces: `Login` (default export) — renders an email field and a "send magic link" button, calls `supabase.auth.signInWithOtp`. `App` now gates on session: no session → `<Login/>`, session → a signed-in placeholder showing the user's email and a sign-out button.

- [ ] **Step 1: Owner gets their user id**

Owner signs in once to create their auth user (either: run the app after Task 1 wiring, or use the Supabase dashboard → Authentication → Users → "Add user" / send themselves a magic link). Then copy the user's UUID from Authentication → Users. This UUID replaces `<OWNER_UUID>` below.

- [ ] **Step 2: Create `pwa/supabase-rls.sql`**

```sql
-- Owner-only access. Replace <OWNER_UUID> with the owner's auth user id
-- (Supabase dashboard -> Authentication -> Users). Run in the SQL editor.
-- These gate on the SPECIFIC uid, not merely authenticated, so a stranger
-- who signs up still reads nothing. Also disable new signups in the
-- dashboard (Authentication -> Providers -> Email -> "Allow new users to
-- sign up" = off) after the owner's user exists.

create policy "owner reads daily_metrics"
  on daily_metrics for select
  using (auth.uid() = '<OWNER_UUID>');

create policy "owner reads weights"
  on weights for select
  using (auth.uid() = '<OWNER_UUID>');

create policy "owner inserts weights"
  on weights for insert
  with check (auth.uid() = '<OWNER_UUID>');
```

- [ ] **Step 3: Owner runs the SQL and disables signups**

Owner pastes `pwa/supabase-rls.sql` (with the real UUID) into the Supabase SQL editor and runs it, then toggles "Allow new users to sign up" off. Also add the local dev URL `http://localhost:5173` to Authentication → URL Configuration → Redirect URLs, so magic links return to the running dev app.

- [ ] **Step 4: Create `pwa/src/pages/Login.jsx`**

```jsx
import { useState } from "react";
import { supabase } from "../supabaseClient.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "sent" | "error"

  async function sendLink(e) {
    e.preventDefault();
    setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <form onSubmit={sendLink} style={{ maxWidth: 320, margin: "4rem auto" }}>
      <h1>Sign in</h1>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <button type="submit" style={{ width: "100%", padding: 8 }}>
        Send magic link
      </button>
      {status === "sent" && <p>Check your email for the link.</p>}
      {status === "error" && <p>Something went wrong — try again.</p>}
    </form>
  );
}
```

- [ ] **Step 5: Rewrite `pwa/src/App.jsx` to gate on session**

```jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import Login from "./pages/Login.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <p style={{ margin: "4rem auto", textAlign: "center" }}>Loading…</p>;
  if (!session) return <Login />;

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <p>Signed in as {session.user.email}</p>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}
```

- [ ] **Step 6: Verify in the browser**

Run (from `pwa/`): `npm run dev`. Open `http://localhost:5173`.
Expected: the Login form shows. Enter the owner's email, click send, click the emailed link → the app now shows "Signed in as …" and a Sign out button. Sign out → back to Login.

- [ ] **Step 7: Commit**

```bash
cd ..
git add pwa/supabase-rls.sql pwa/src/pages/Login.jsx pwa/src/App.jsx
git commit -m "feat: magic-link auth and owner-scoped RLS policies"
```

---

### Task 3: Dashboard reading `daily_metrics`

**Files:**
- Create: `pwa/src/pages/Dashboard.jsx`
- Modify: `pwa/src/App.jsx` (render `Dashboard` when signed in)

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient.js`; a signed-in session (App guarantees it).
- Produces: `Dashboard` (default export) — queries `daily_metrics`, renders the latest day's Garmin numbers and passes nothing to weight (that's Task 4). Column names come from `src/fetch.py`'s `FIELD_MAP`: `date, total_kcal, active_kcal, bmr_kcal, steps, distance_m, resting_hr, avg_stress, moderate_min, vigorous_min, body_battery_high, body_battery_low, sleep_seconds, deep_sleep_seconds, rem_sleep_seconds, sleep_score, hrv_last_night_avg, hrv_status, activities`.

- [ ] **Step 1: Create `pwa/src/pages/Dashboard.jsx`**

```jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

function hoursMinutes(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Dashboard() {
  const [days, setDays] = useState(null); // null = loading, [] = loaded empty
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setDays(null);
    const { data, error } = await supabase
      .from("daily_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(90);
    if (error) setError(true);
    else setDays(data);
  }

  useEffect(() => {
    load();
  }, []);

  if (error)
    return (
      <section>
        <p>Couldn't load Garmin data.</p>
        <button onClick={load}>Retry</button>
      </section>
    );
  if (days === null) return <p>Loading Garmin data…</p>;
  if (days.length === 0) return <p>No Garmin data yet.</p>;

  const today = days[0]; // newest first
  const stats = [
    ["Calories burned (in progress)", today.total_kcal ?? "—"],
    ["Steps", today.steps ?? "—"],
    ["Resting HR", today.resting_hr ?? "—"],
    ["Sleep", hoursMinutes(today.sleep_seconds)],
    ["Sleep score", today.sleep_score ?? "—"],
    ["Body battery high", today.body_battery_high ?? "—"],
    ["Body battery low", today.body_battery_low ?? "—"],
  ];

  return (
    <section>
      <h2>Today ({today.date})</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {stats.map(([label, value]) => (
          <li key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span>{label}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Render `Dashboard` from `App.jsx`**

Replace the signed-in placeholder block in `pwa/src/App.jsx` with:

```jsx
import Dashboard from "./pages/Dashboard.jsx";
```

and the signed-in return becomes:

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

- [ ] **Step 3: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in.
Expected: the dashboard shows the newest day's real numbers (e.g. today's date, steps, resting HR, sleep). Data currently spans 38+ days through today, so the newest day renders with real values.

- [ ] **Step 4: Commit**

```bash
cd ..
git add pwa/src/pages/Dashboard.jsx pwa/src/App.jsx
git commit -m "feat: dashboard reading daily_metrics"
```

---

### Task 4: Weight entry + trend chart

**Files:**
- Create: `pwa/src/components/WeightForm.jsx`, `pwa/src/components/WeightTrendChart.jsx`
- Modify: `pwa/src/pages/Dashboard.jsx` (load weights, render form + chart, re-query on insert)

**Interfaces:**
- Consumes: `supabase` from `../supabaseClient.js`. `weights` table columns: `id, measured_at (timestamptz), weight (numeric)`.
- Produces:
  - `WeightForm({ onSaved })` — a numeric input + Save button; inserts one `weights` row (`measured_at` = now, `weight` = number), calls `onSaved()` on success, keeps the typed value and shows an error on failure.
  - `WeightTrendChart({ weights })` — Recharts chart: raw weigh-ins as faint dots, a 7-day trailing rolling average as the primary line, and a horizontal reference line at the goal (155).

- [ ] **Step 1: Create `pwa/src/components/WeightForm.jsx`**

```jsx
import { useState } from "react";
import { supabase } from "../supabaseClient.js";

export default function WeightForm({ onSaved }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError(false);
    setSaving(true);
    const { error } = await supabase
      .from("weights")
      .insert({ weight: Number(value), measured_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      setError(true); // keep the typed value so it isn't re-entered
    } else {
      setValue("");
      onSaved();
    }
  }

  return (
    <form onSubmit={save} style={{ display: "flex", gap: 8, margin: "1rem 0" }}>
      <input
        type="number"
        step="0.1"
        required
        placeholder="Weight (lb)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ flex: 1, padding: 8 }}
      />
      <button type="submit" disabled={saving} style={{ padding: 8 }}>
        {saving ? "Saving…" : "Log weight"}
      </button>
      {error && <span style={{ color: "crimson" }}>Save failed</span>}
    </form>
  );
}
```

- [ ] **Step 2: Create `pwa/src/components/WeightTrendChart.jsx`**

The rolling average is a 7-day trailing mean over each weigh-in's own date (a
day this old counts, a day older than 7 days does not). Points are sorted
oldest-first for the axis.

```jsx
import {
  ComposedChart, Line, Scatter, ReferenceLine,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const GOAL_WEIGHT = 155;

function withRollingAvg(weights) {
  // weights: [{ measured_at, weight }], any order. Returns points sorted
  // oldest-first with a 7-day trailing average attached to each.
  const sorted = [...weights].sort(
    (a, b) => new Date(a.measured_at) - new Date(b.measured_at)
  );
  return sorted.map((w) => {
    const t = new Date(w.measured_at).getTime();
    const window = sorted.filter((o) => {
      const dt = t - new Date(o.measured_at).getTime();
      return dt >= 0 && dt <= 7 * 24 * 3600 * 1000;
    });
    const avg = window.reduce((s, o) => s + Number(o.weight), 0) / window.length;
    return {
      date: new Date(w.measured_at).toLocaleDateString(),
      weight: Number(w.weight),
      avg: Math.round(avg * 10) / 10,
    };
  });
}

export default function WeightTrendChart({ weights }) {
  if (!weights || weights.length === 0) return <p>No weight entries yet.</p>;
  const data = withRollingAvg(weights);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={["dataMin - 3", "dataMax + 3"]} tick={{ fontSize: 11 }} />
        <Tooltip />
        <ReferenceLine y={GOAL_WEIGHT} stroke="#16a34a" strokeDasharray="4 4"
          label={{ value: `Goal ${GOAL_WEIGHT}`, position: "insideTopRight", fontSize: 11 }} />
        <Scatter dataKey="weight" fill="#cbd5e1" />
        <Line type="monotone" dataKey="avg" stroke="#0f172a" dot={false} strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Wire weights into `Dashboard.jsx`**

Add weight state and loading alongside the existing `days` state. Add near the top of the component body (after the `days`/`error` state):

```jsx
  const [weights, setWeights] = useState(null);

  async function loadWeights() {
    const { data } = await supabase
      .from("weights")
      .select("id, measured_at, weight")
      .order("measured_at", { ascending: true });
    setWeights(data ?? []);
  }
```

Extend the existing `useEffect` to also call `loadWeights()`:

```jsx
  useEffect(() => {
    load();
    loadWeights();
  }, []);
```

Add the imports at the top:

```jsx
import WeightForm from "../components/WeightForm.jsx";
import WeightTrendChart from "../components/WeightTrendChart.jsx";
```

Then, inside the returned JSX for the loaded state (after the stats `<ul>`, before `</section>`), add:

```jsx
      <h2>Weight</h2>
      <WeightForm onSaved={loadWeights} />
      {weights === null ? <p>Loading weight…</p> : <WeightTrendChart weights={weights} />}
```

- [ ] **Step 4: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in.
Expected: below the Garmin stats, a weight form and chart appear. Enter a weight (e.g. `170`) → "Log weight" → the chart updates to include the new point, the goal line sits at 155, and the row is visible in the Supabase `weights` table. Enter two or three more on different values to confirm the rolling-average line renders.

- [ ] **Step 5: Verify the production build still emits the PWA**

Run (from `pwa/`):
```bash
npm run build && ls dist/sw.js dist/manifest.webmanifest
```
Expected: build succeeds, both files exist.

- [ ] **Step 6: Commit**

```bash
cd ..
git add pwa/src/components/WeightForm.jsx pwa/src/components/WeightTrendChart.jsx pwa/src/pages/Dashboard.jsx
git commit -m "feat: weight entry and trend chart against goal line"
```

---

## Phase acceptance (run after Task 4)

1. `cd pwa && npm run build` succeeds and `dist/sw.js` + `dist/manifest.webmanifest` exist.
2. `npm run dev`, signed in as the owner: dashboard shows real Garmin data and the weight chart renders.
3. Logging a weight persists it (visible in Supabase; chart updates).
4. Signed out or with a non-owner session: no health data is readable (RLS returns empty).

## Manual steps owned by the user (flagged in-task, repeated here)

- Create `pwa/.env.local` from the example with the anon/publishable key (Task 1, Step 9).
- Get the owner UUID, run `pwa/supabase-rls.sql`, disable new signups, and add `http://localhost:5173` as a redirect URL (Task 2, Steps 1 & 3).
- Deploy target (Vercel or Cloudflare Pages, pointing at `pwa/`) is out of scope for this plan — the skeleton runs locally.
