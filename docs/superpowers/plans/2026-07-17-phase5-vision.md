# Phase 5: Photo → Vision → Calorie Estimate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a meal by photographing it — a Supabase Edge Function calls Claude Haiku vision to estimate the dish and calories, the owner confirms/adjusts, and only name + calories are saved (photo never stored).

**Architecture:** A Deno/TypeScript Supabase Edge Function (`estimate-meal`) holds `ANTHROPIC_API_KEY`, receives a resized base64 image + a per-day usage check, calls `claude-haiku-4-5` with structured output, and returns `{ items, total_calories }`. The PWA resizes the photo client-side, POSTs it to the function, shows a mandatory confirm screen, and on confirm reuses Phase 4's `meals` insert path with `source: 'photo'`.

**Tech Stack:** Supabase Edge Functions (Deno), Anthropic Messages API (raw `fetch`, no SDK — Edge runtime), React 19.

**Spec:** `docs/superpowers/specs/2026-07-17-meals-vision-calibration-design.md` — Phase 5 section. Depends on Phase 4 (`meals` insert + `intakeDate`).

## Global Constraints

- **Vision model:** `claude-haiku-4-5` exactly. Anthropic Messages API version header `anthropic-version: 2023-06-01`.
- `ANTHROPIC_API_KEY` lives ONLY as a Supabase Edge Function secret — never in `pwa/` code, never in `.env.local`, never sent to the browser.
- **Photos are never persisted** — the base64 image exists only for the duration of the request.
- **Confirm screen is mandatory** — nothing is written to `meals` without an explicit confirm; the owner can edit the calorie number first.
- **Cost cap, both layers:** (1) a monthly USD spend limit on the Anthropic key set in the Anthropic Console (owner, manual, ~$5); (2) the Edge Function refuses once the owner has logged ~20 photo meals in the current Honolulu day.
- Structured output: request guaranteed-parseable JSON, shape `{ "items": [{ "name": string, "estimated_calories": integer }], "total_calories": integer }`.
- Owner-provided at build time: usual plate diameter and bowl diameter (for portion scale in the prompt).
- Reuses Phase 4: `source: 'photo'` on the `meals` insert, and `intakeDate()` for bucketing.

---

### Task 1: Edge Function scaffold + secrets

**Files:**
- Create: `pwa/supabase/functions/estimate-meal/index.ts`
- Create: `pwa/supabase/functions/estimate-meal/deno.json` (empty config, marks the function dir)

**Interfaces:**
- Produces: an HTTP endpoint `POST /functions/v1/estimate-meal` that (this task) returns `{ ok: true }` for a valid request. Later tasks add the vision call and the cap.

- [ ] **Step 1: Owner installs the Supabase CLI and links the project** (if not already)

```bash
# Owner runs, once, in their own terminal:
brew install supabase/tap/supabase
cd ~/garmin-health-tips/pwa
supabase link --project-ref <project-ref>
```
`<project-ref>` is the subdomain in the Supabase URL. This creates `pwa/supabase/config.toml`.

- [ ] **Step 2: Create `pwa/supabase/functions/estimate-meal/deno.json`**

```json
{}
```

- [ ] **Step 3: Create `pwa/supabase/functions/estimate-meal/index.ts` (skeleton)**

```ts
// Supabase Edge Function: estimate a meal's calories from a photo.
// Deno runtime. No secrets in the client — ANTHROPIC_API_KEY is a function secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: CORS });
  }
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return json({ error: "missing image" }, 400);
    }
    return json({ ok: true });
  } catch {
    return json({ error: "bad request" }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
```

- [ ] **Step 4: Owner sets the Anthropic key as a function secret**

```bash
# Owner runs, once:
cd ~/garmin-health-tips/pwa
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 5: Deploy and smoke-test**

```bash
supabase functions deploy estimate-meal
```
Then (owner, replacing `<project-ref>` and using the anon key):
```bash
curl -s -X POST "https://<project-ref>.supabase.co/functions/v1/estimate-meal" \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <anon-key>" \
  -d '{"image":"dGVzdA=="}'
```
Expected: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
cd ..
git add pwa/supabase/functions/estimate-meal/
git commit -m "feat: estimate-meal edge function scaffold"
```

---

### Task 2: Claude Haiku vision call with structured output

**Files:**
- Modify: `pwa/supabase/functions/estimate-meal/index.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY` (function secret), the `image` base64 (JPEG) from the request.
- Produces: the endpoint now returns `{ items: [{name, estimated_calories}], total_calories }` from the model.

- [ ] **Step 1: Add the constants and vision call. Replace the `return json({ ok: true });` line with a call to `estimate(image)`.**

Add near the top (after the imports):

```ts
const PLATE_CM = 27; // owner's usual dinner plate diameter — REPLACE with real value
const BOWL_CM = 15;  // owner's usual bowl diameter — REPLACE with real value

const SYSTEM = `You estimate calories from a photo of a meal. The owner's usual dinner plate is ${PLATE_CM} cm across and their usual bowl is ${BOWL_CM} cm across — use them to judge portion size. Estimate generously rather than low; real portions are usually bigger than they look. Return only the structured JSON.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          estimated_calories: { type: "integer" },
        },
        required: ["name", "estimated_calories"],
        additionalProperties: false,
      },
    },
    total_calories: { type: "integer" },
  },
  required: ["items", "total_calories"],
  additionalProperties: false,
};

async function estimate(imageB64: string) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
            { type: "text", text: "Estimate the calories in this meal." },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return json({ error: "vision call failed", detail }, 502);
  }
  const data = await resp.json();
  const textBlock = data.content.find((b: { type: string }) => b.type === "text");
  return json(JSON.parse(textBlock.text));
}
```

- [ ] **Step 2: Replace the skeleton success return**

Change:
```ts
    return json({ ok: true });
```
to:
```ts
    return await estimate(image);
```

- [ ] **Step 3: Owner sets the real plate/bowl diameters**

Replace the `PLATE_CM` and `BOWL_CM` placeholder values with the owner's actual measurements.

- [ ] **Step 4: Deploy and test with a real food photo**

```bash
cd pwa && supabase functions deploy estimate-meal
```
Owner: base64-encode a JPEG of a meal and POST it as `image`. Expected: JSON like `{"items":[{"name":"...","estimated_calories":420}],"total_calories":420}`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add pwa/supabase/functions/estimate-meal/index.ts
git commit -m "feat: claude-haiku-4-5 vision estimate with structured output"
```

---

### Task 3: Per-day cap (soft cost cap)

**Files:**
- Modify: `pwa/supabase/functions/estimate-meal/index.ts`

**Interfaces:**
- Consumes: the caller's Supabase JWT (forwarded `Authorization` header) to read `meals` under RLS; `intake_date` bucketing is done client-side in Phase 4, but the cap counts today's photo meals server-side by `created_at` date in Honolulu.
- Produces: a `429` when the owner has already logged 20 photo meals today.

- [ ] **Step 1: Add the cap check at the start of the POST handler, before `estimate`**

Add this helper:

```ts
const DAILY_PHOTO_CAP = 20;

function honoluluDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Honolulu",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // en-CA yields YYYY-MM-DD
}

async function underCap(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const start = honoluluDate() + "T00:00:00-10:00";
  const { count } = await client
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("source", "photo")
    .gte("created_at", start);
  return (count ?? 0) < DAILY_PHOTO_CAP;
}
```

- [ ] **Step 2: Call it in the handler**

After validating `image` and before `return await estimate(image);`, add:

```ts
    if (!(await underCap(req.headers.get("Authorization")))) {
      return json({ error: "daily photo limit reached" }, 429);
    }
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically into Edge Functions — no secret to set.

- [ ] **Step 3: Deploy**

```bash
cd pwa && supabase functions deploy estimate-meal
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add pwa/supabase/functions/estimate-meal/index.ts
git commit -m "feat: 20/day soft cap on photo estimates"
```

---

### Task 4: Client resize + PhotoMealForm with confirm screen

**Files:**
- Create: `pwa/src/lib/resizeImage.js`
- Create: `pwa/src/components/PhotoMealForm.jsx`
- Modify: `pwa/src/pages/Dashboard.jsx` (render `PhotoMealForm` in the balance section)

**Interfaces:**
- Consumes: `supabase` (for the function URL + auth token), `intakeDate`, the `estimate-meal` endpoint.
- Produces: `PhotoMealForm({ onSaved })` — camera input → resize → estimate → confirm/adjust → insert `meals` row with `source: 'photo'`.

- [ ] **Step 1: Create `pwa/src/lib/resizeImage.js`**

```js
// Downscale an image File to a JPEG base64 string (no data: prefix),
// max 1024px on the long edge, quality 0.8.
export function resizeImage(file, maxEdge = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      URL.revokeObjectURL(img.src);
      resolve(dataUrl.split(",")[1]); // strip "data:image/jpeg;base64,"
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

- [ ] **Step 2: Create `pwa/src/components/PhotoMealForm.jsx`**

```jsx
import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";
import { resizeImage } from "../lib/resizeImage.js";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-meal`;

export default function PhotoMealForm({ onSaved }) {
  const [status, setStatus] = useState("idle"); // idle | estimating | confirm | error
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("estimating");
    try {
      const image = await resizeImage(file);
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image }),
      });
      if (!resp.ok) { setStatus("error"); return; }
      const est = await resp.json();
      setName(est.items?.map((i) => i.name).join(", ") || "Meal");
      setCalories(String(est.total_calories ?? ""));
      setStatus("confirm");
    } catch {
      setStatus("error");
    }
  }

  async function confirm(e) {
    e.preventDefault();
    const { error } = await supabase.from("meals").insert({
      name,
      calories: Number(calories),
      source: "photo",
      eaten_at: new Date().toISOString(),
      intake_date: intakeDate(),
    });
    if (error) { setStatus("error"); return; }
    setStatus("idle");
    setName("");
    setCalories("");
    onSaved();
  }

  if (status === "confirm") {
    return (
      <form onSubmit={confirm} style={{ display: "flex", gap: 8, margin: "1rem 0", flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          style={{ flex: 2, minWidth: 120, padding: 8 }} />
        <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} required
          style={{ flex: 1, minWidth: 90, padding: 8 }} />
        <button type="submit" style={{ padding: 8 }}>Save</button>
        <button type="button" onClick={() => setStatus("idle")} style={{ padding: 8 }}>Cancel</button>
      </form>
    );
  }

  return (
    <div style={{ margin: "1rem 0" }}>
      <label style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}>
        {status === "estimating" ? "Estimating…" : "📷 Photo a meal"}
        <input type="file" accept="image/*" capture="environment" onChange={onPick}
          disabled={status === "estimating"} style={{ display: "none" }} />
      </label>
      {status === "error" && <span style={{ color: "crimson", marginLeft: 8 }}>Estimate failed</span>}
    </div>
  );
}
```

- [ ] **Step 3: Render `PhotoMealForm` in the dashboard**

In `pwa/src/pages/Dashboard.jsx`, add the import near the other component imports:

```jsx
import PhotoMealForm from "../components/PhotoMealForm.jsx";
```

In the balance section (from Phase 4), immediately after `<MealForm onSaved={loadMeals} />`, add:

```jsx
              <PhotoMealForm onSaved={loadMeals} />
```

- [ ] **Step 4: Verify in the browser**

Run (from `pwa/`): `npm run dev`, sign in. Tap "Photo a meal", pick a food photo. Expected: "Estimating…" then a confirm form pre-filled with a name and calorie estimate. Adjust the number, Save → the meal appears in today's list with the adjusted value and the balance updates. Cancel → nothing saved.

- [ ] **Step 5: Full check + commit**

```bash
npm test && npm run build
```
Expected: tests pass, build succeeds.

```bash
cd ..
git add pwa/src/lib/resizeImage.js pwa/src/components/PhotoMealForm.jsx pwa/src/pages/Dashboard.jsx
git commit -m "feat: photo meal capture with resize and confirm screen"
```

---

## Phase acceptance

1. Tapping "Photo a meal" returns a name + calorie estimate on a confirm screen.
2. Confirming saves a `meals` row with `source: 'photo'`; an adjusted number saves the adjusted value; Cancel saves nothing.
3. `ANTHROPIC_API_KEY` appears nowhere in `pwa/src` or `pwa/.env.local` (grep to confirm) — only as a Supabase function secret.
4. The 21st photo meal in one Honolulu day returns 429.
5. `npm test && npm run build` pass; driven in the browser signed in as the owner.

## Manual steps owned by the user

- Install + link the Supabase CLI (Task 1, Step 1).
- Set `ANTHROPIC_API_KEY` as a function secret, and a monthly spend limit in the Anthropic Console (Task 1, Step 4).
- Provide real plate/bowl diameters (Task 2, Step 3).
- Deploy the function after each change (`supabase functions deploy estimate-meal`).
