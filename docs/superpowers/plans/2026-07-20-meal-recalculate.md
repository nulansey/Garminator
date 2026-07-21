# Meal Recalculate Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the photo-meal confirm screen, let the owner correct the meal name
and re-run the calorie estimate against the same photo.

**Architecture:** The resized base64 image moves from a local variable into
`PhotoMealForm` state so the confirm screen can re-post it. The existing
`estimate-meal` edge function gains an optional `name`; when present, the typed
name is ground truth for *what* the food is and the photo is used only for
*how much*. Prompt building moves into a pure `prompt.ts` module beside the
function, tested directly by vitest.

**Tech Stack:** React 19 (no router, plain `useState`), Supabase JS v2,
Supabase Edge Functions (Deno), Anthropic Messages API (`claude-haiku-4-5`),
vitest 3.

**Spec:** `docs/superpowers/specs/2026-07-20-meal-recalculate-design.md`

## Global Constraints

- Photos are never stored — not in Supabase, not in `localStorage`, not in a
  table. The base64 lives in React state only and is dropped on save/cancel.
- Recalculation is available on the confirm screen only. Saved meals are out of
  scope.
- Recalculations are uncapped and do not touch the existing 20/day photo cap or
  how it is counted. The button is disabled in flight to stop double-taps.
- A recalculation updates the calorie field only. The typed name is never
  overwritten.
- With no `name` in the request, the edge function must behave byte-for-byte as
  it does today.
- `name` is untrusted input: max 200 characters, embedded in the user text
  block, never the system prompt.
- Run all commands from `pwa/` unless stated otherwise.

---

### Task 1: Prompt helper

Pure module, no Deno APIs, so vitest imports the shipped file directly.
(Verified 2026-07-20: vitest's default glob collects tests under
`supabase/functions/`; there is no `vitest.config` in `pwa/`.)

**Files:**
- Create: `pwa/supabase/functions/estimate-meal/prompt.ts`
- Test: `pwa/supabase/functions/estimate-meal/prompt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_NAME: number` (200)
  - `DEFAULT_PROMPT: string`
  - `normalizeName(name: unknown): string` — trim, blank→`""`, cap at `MAX_NAME`
  - `mealPrompt(name: unknown): string` — the user text block for the vision call

- [ ] **Step 1: Write the failing test**

Create `pwa/supabase/functions/estimate-meal/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mealPrompt, normalizeName, MAX_NAME, DEFAULT_PROMPT } from "./prompt.ts";

describe("normalizeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeName("  chicken burrito  ")).toBe("chicken burrito");
  });

  it("treats blank and non-string input as absent", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(42)).toBe("");
  });

  it("caps length at MAX_NAME", () => {
    expect(normalizeName("a".repeat(500))).toHaveLength(MAX_NAME);
  });
});

describe("mealPrompt", () => {
  it("returns the unchanged default when there is no usable name", () => {
    expect(mealPrompt(undefined)).toBe(DEFAULT_PROMPT);
    expect(mealPrompt("")).toBe(DEFAULT_PROMPT);
    expect(mealPrompt("   ")).toBe(DEFAULT_PROMPT);
    expect(mealPrompt(42)).toBe(DEFAULT_PROMPT);
  });

  it("includes the corrected name and defers to it", () => {
    const out = mealPrompt("chicken burrito");
    expect(out).toContain("chicken burrito");
    expect(out).toMatch(/portion/i);
    expect(out).not.toBe(DEFAULT_PROMPT);
  });

  it("uses the truncated name, not the raw one", () => {
    const out = mealPrompt("b".repeat(500));
    expect(out).toContain("b".repeat(MAX_NAME));
    expect(out).not.toContain("b".repeat(MAX_NAME + 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/estimate-meal/prompt.test.ts`
Expected: FAIL — `Failed to load .../prompt.ts` (the module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `pwa/supabase/functions/estimate-meal/prompt.ts`:

```ts
// Builds the user text block for the meal vision call.
//
// Plain TypeScript with no Deno APIs on purpose: vitest imports this exact
// file, so the shipped code is the tested code (see prompt.test.ts).

export const MAX_NAME = 200;

export const DEFAULT_PROMPT = "Estimate the calories in this meal.";

/** Trim, treat blank or non-string as absent, cap length. */
export function normalizeName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.trim().slice(0, MAX_NAME);
}

/**
 * With no usable name this returns the original prompt unchanged, so a
 * first-time estimate behaves exactly as it always has.
 *
 * With a name, the owner's text is ground truth for WHAT the food is and the
 * photo is reduced to judging HOW MUCH - that is what makes correcting a
 * misidentified food actually move the number. The name goes here, in the
 * user turn, never into the system prompt where it could displace the
 * plate/bowl portion-size instructions.
 */
export function mealPrompt(name: unknown): string {
  const clean = normalizeName(name);
  if (!clean) return DEFAULT_PROMPT;
  return [
    `The owner says the food in this photo is: ${clean}`,
    "",
    "Trust that identification over your own reading of the image, even if",
    "the food looks like something else. Use the photo only to judge portion",
    "size, then estimate the calories for that food at that portion.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/estimate-meal/prompt.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Run the full suite for regressions**

Run: `npx vitest run`
Expected: PASS — 8 test files, 50 tests (44 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add pwa/supabase/functions/estimate-meal/prompt.ts pwa/supabase/functions/estimate-meal/prompt.test.ts
git commit -m "feat: prompt helper for name-corrected meal estimates"
```

---

### Task 2: Edge function accepts an optional name

**Files:**
- Modify: `pwa/supabase/functions/estimate-meal/index.ts`

**Interfaces:**
- Consumes: `mealPrompt` from `./prompt.ts` (Task 1). `normalizeName` is called
  internally by `mealPrompt`; the function does not import it directly.
- Produces: `POST /estimate-meal` accepts `{ image: string, name?: string }`.
  Response shape is unchanged: `{ items: [{name, estimated_calories}],
  total_calories }`.

- [ ] **Step 1: Import the helper**

At the top of `index.ts`, below the existing `createClient` import:

```ts
import { mealPrompt } from "./prompt.ts";
```

- [ ] **Step 2: Thread the name through `estimate()`**

Change the signature and the text block. Replace:

```ts
async function estimate(imageB64: string) {
```

with:

```ts
async function estimate(imageB64: string, name?: unknown) {
```

and replace this line:

```ts
            { type: "text", text: "Estimate the calories in this meal." },
```

with:

```ts
            { type: "text", text: mealPrompt(name) },
```

Leave `SYSTEM`, `SCHEMA`, the model, and `max_tokens` untouched — with no
name, `mealPrompt` returns the original sentence, so the request is identical
to today's.

- [ ] **Step 3: Validate and pass the name in the handler**

In `Deno.serve`, replace:

```ts
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return json({ error: "missing image" }, 400);
    }
```

with:

```ts
    const { image, name } = await req.json();
    if (!image || typeof image !== "string") {
      return json({ error: "missing image" }, 400);
    }
    // Absent is fine (first estimate). Present-but-not-a-string is a client
    // bug worth surfacing; over-length is truncated in normalizeName, since
    // the realistic cause is a rambling description, not an attack.
    if (name !== undefined && name !== null && typeof name !== "string") {
      return json({ error: "invalid name" }, 400);
    }
```

and replace:

```ts
    return await estimate(image);
```

with:

```ts
    return await estimate(image, name);
```

- [ ] **Step 4: Type-check the function**

Run from the repo root:

```bash
npx --yes deno@2 check pwa/supabase/functions/estimate-meal/index.ts
```

Expected: `Check file:///...index.ts` with no errors. If `deno` cannot be
fetched in this environment, skip this step and rely on Task 4's live check —
note the skip in the commit message rather than claiming it passed.

- [ ] **Step 5: Confirm the helper tests still pass**

Run from `pwa/`: `npx vitest run`
Expected: PASS — 8 files, 50 tests.

- [ ] **Step 6: Commit**

```bash
git add pwa/supabase/functions/estimate-meal/index.ts
git commit -m "feat: estimate-meal accepts an optional corrected name"
```

---

### Task 3: Recalculate button on the confirm screen

**Files:**
- Modify: `pwa/src/components/PhotoMealForm.jsx`

**Interfaces:**
- Consumes: the `POST` contract from Task 2 (`{ image, name }`).
- Produces: no exports beyond the existing default `PhotoMealForm({ onSaved })`.

- [ ] **Step 1: Replace the component body**

Rewrite `pwa/src/components/PhotoMealForm.jsx` in full. The changes from the
current file: the base64 moves into state, the fetch is extracted into
`callEstimate` so the first estimate and the recalculation share one code path,
and the confirm screen gains a Recalculate button plus its own error line.

```jsx
import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";
import { resizeImage } from "../lib/resizeImage.js";
import { input, button, buttonPrimary } from "../styles/ui.js";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-meal`;

// Posts the photo for a calorie estimate. `name`, when given, tells the model
// what the food actually is so it only has to judge portion size - that is how
// a misidentified meal gets corrected. Throws on any non-OK response.
async function callEstimate(image, name) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(name ? { image, name } : { image }),
  });
  if (!resp.ok) throw new Error("estimate failed");
  return await resp.json();
}

export default function PhotoMealForm({ onSaved }) {
  // idle | estimating | confirm | recalculating | error
  const [status, setStatus] = useState("idle");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  // Kept only so the confirm screen can re-estimate. Never persisted, and
  // dropped on save or cancel.
  const [image, setImage] = useState(null);
  const [recalcFailed, setRecalcFailed] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("estimating");
    try {
      const b64 = await resizeImage(file);
      const est = await callEstimate(b64);
      setImage(b64);
      setName(est.items?.map((i) => i.name).join(", ") || "Meal");
      setCalories(String(est.total_calories ?? ""));
      setStatus("confirm");
    } catch {
      setStatus("error");
    }
  }

  // Re-price the same photo against the corrected name. Only the calorie field
  // changes - the name was just typed by hand, so overwriting it would undo
  // the correction. On failure the existing estimate is left intact.
  async function recalculate() {
    setRecalcFailed(false);
    setStatus("recalculating");
    try {
      const est = await callEstimate(image, name);
      setCalories(String(est.total_calories ?? ""));
    } catch {
      setRecalcFailed(true);
    }
    setStatus("confirm");
  }

  function reset() {
    setStatus("idle");
    setName("");
    setCalories("");
    setImage(null);
    setRecalcFailed(false);
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
    reset();
    onSaved();
  }

  if (status === "confirm" || status === "recalculating") {
    const busy = status === "recalculating";
    return (
      <form onSubmit={confirm} style={{ display: "flex", gap: 8, margin: "1rem 0", flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          style={{ ...input, flex: 2, minWidth: 120 }} />
        <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} required
          style={{ ...input, flex: 1, minWidth: 90 }} />
        <button type="button" onClick={recalculate} disabled={busy} style={button}>
          {busy ? "Recalculating…" : "↻ Recalculate"}
        </button>
        <button type="submit" style={buttonPrimary}>Save</button>
        <button type="button" onClick={reset} style={button}>Cancel</button>
        {recalcFailed && (
          <span style={{ color: "var(--state-over-fg)", width: "100%" }}>
            Recalculate failed — the estimate above is unchanged.
          </span>
        )}
      </form>
    );
  }

  return (
    <div style={{ margin: "1rem 0" }}>
      <label style={{ ...button, display: "inline-block" }}>
        {status === "estimating" ? "Estimating…" : "📷 Photo a meal"}
        <input type="file" accept="image/*" capture="environment" onChange={onPick}
          disabled={status === "estimating"} style={{ display: "none" }} />
      </label>
      {status === "error" && <span style={{ color: "var(--state-over-fg)", marginLeft: 8 }}>Estimate failed</span>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run from `pwa/`: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 3: Verify the suite still passes**

Run from `pwa/`: `npx vitest run`
Expected: PASS — 8 files, 50 tests. (No new unit tests here: this task is
wiring and markup, and the branching logic it depends on is covered in Task 1.)

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/PhotoMealForm.jsx
git commit -m "feat: recalculate a photo estimate from a corrected meal name"
```

---

### Task 4: Deploy and verify end to end

The edge function change is inert until deployed — the PWA calls the hosted
function, not a local one. **Deploying changes live behavior and costs real API
calls: confirm with the owner before running Step 2.**

**Files:** none modified.

- [ ] **Step 1: Push the client**

```bash
git push
```

Then confirm the Deploy PWA run is green:

```bash
gh run list --workflow=deploy-pwa.yml --limit 1
```

Expected: `completed  success`. (This workflow deploys `pwa/**` to GitHub
Pages; it does not deploy edge functions.)

- [ ] **Step 2: Deploy the edge function**

Requires a logged-in Supabase CLI. Ask the owner before running.

```bash
npx --yes supabase@latest functions deploy estimate-meal --project-ref giydwqerqtikkbzwfeae
```

Expected: `Deployed Functions on project giydwqerqtikkbzwfeae: estimate-meal`.
If it fails on auth, the owner runs `npx supabase login` — do not attempt to
supply credentials.

- [ ] **Step 3: Confirm the no-name path is unchanged**

On the phone or at https://nulansey.github.io/Garminator/, photograph a meal.
Expected: an estimate appears on the confirm screen exactly as before, with the
new Recalculate button now beside Save.

- [ ] **Step 4: Confirm a correction moves the number**

On that confirm screen, replace the name with a clearly different food (for
example change a salad to `cheeseburger`) and tap Recalculate.
Expected: the calorie figure changes in the plausible direction for the typed
food, the name field still reads exactly what was typed, and the button
returns from "Recalculating…" to "↻ Recalculate".

- [ ] **Step 5: Confirm a failure is non-destructive**

With the phone in airplane mode, tap Recalculate.
Expected: "Recalculate failed — the estimate above is unchanged." appears, and
both the name and calorie fields keep their values. Restore connectivity and
save the meal to confirm the normal path still works.

- [ ] **Step 6: Mark the plan complete**

Set the status line of
`docs/superpowers/specs/2026-07-20-meal-recalculate-design.md` to
`implemented 2026-07-__` with the real date, then:

```bash
git add docs/superpowers/specs/2026-07-20-meal-recalculate-design.md
git commit -m "docs: mark meal recalculate spec implemented"
git push
```

---

## Notes for the implementer

- The 20/day cap check in `underCap` counts saved rows with `source='photo'`.
  Recalculations do not create rows, so they do not affect it. This is
  intended — do not "fix" it.
- `estimate()` returns a `Response` (it calls `json(...)` itself) rather than a
  parsed object. Keep that shape; the handler returns its result directly.
- The confirm screen renders for both `confirm` and `recalculating` so the form
  does not unmount mid-request and lose the typed name.
- Do not add a photo-storage step, a retry cap, or name-overwriting on
  recalculation. All three were considered and deliberately excluded — see the
  Decisions section of the spec.
