# Per-item meal breakdown, portion reasoning, and a calorie-density reference

**Date:** 2026-07-20
**Status:** approved, not yet implemented

**Scope:** Make the photo-meal estimate more accurate and more correctable.
Three changes that share one prompt and one screen: the model states its
portion reasoning per food item, each item becomes individually editable and
recalculable, and the system prompt carries a static calorie-density table so
the model multiplies against a fixed number instead of free-associating a
total.

Supersedes the whole-meal Recalculate button from
`2026-07-20-meal-recalculate-design.md`, which stays in place until this
lands.

## Problem

The vision call already returns `items: [{name, estimated_calories}]`, but the
client immediately flattens it: item names are joined into one string and only
`total_calories` is kept. Three consequences:

1. When one food in a multi-item plate is misidentified, the only available fix
   is to correct the whole meal name and re-price the entire plate.
2. There is no visibility into *why* a number came back — a 900 kcal salad and
   a 900 kcal burger look identical on the confirm screen.
3. The model produces a calorie total in one step, with no intermediate
   commitment to portion size. Vision models estimate substantially better when
   forced to state grams first, then convert.

Vision estimates are ±30–50% on real meals (per
`2026-07-17-meals-vision-calibration-design.md`). This does not make them
ground truth; the weight-trend calibration factor remains the real correction.
The goal here is to cut per-meal error and make wrong answers easy to spot and
fix.

## Decisions

1. **Reasoning is per item, and read-only.** Each item carries a short portion
   note ("~150 g, about a deck of cards"). It is displayed as muted context,
   never edited — it explains a number rather than producing one.
2. **Name and calories are editable per item.** These are the fields that
   determine what gets saved, so both are inputs.
3. **The meal total is derived, not typed.** It is the sum of the item calorie
   fields and is read-only on the confirm screen. Editing a number means
   editing the item that is wrong.
4. **Saving still writes exactly one `meals` row.** Name is the joined item
   names, calories the summed total — unchanged from today, so `dayIntake`,
   `sevenDayBalance`, `calibrationFactor`, `isLowLog`, and `CaloriesChart` all
   keep working untouched. The breakdown additionally persists in a new
   nullable `items` jsonb column.
5. **Saved breakdowns are viewable but not editable.** The dashboard's meal
   list gets an expand arrow on rows that have `items`. Expanding shows the
   read-only breakdown. Correcting a saved meal is still delete-and-redo, as
   today.
6. **Per-item recalculation passes the full plate as context.** See
   "Per-item recalculation" below — this is the part most likely to be got
   wrong.
7. **The density reference is static and lives in the system prompt.** No live
   nutrition API. See "Why not a live nutrition API" below.
8. **The density table is a reference, not a whitelist.** Foods absent from it
   are estimated from the model's own knowledge as they are today. It anchors
   the common, high-impact cases; it does not constrain the menu.

## Per-item recalculation

The naive approach — reusing today's `mealPrompt` with a single item's
corrected name — is wrong on multi-item plates. Today's prompt says "the food
in this photo is X … estimate the calories for that food at that portion." Give
that a photo of chicken, rice, and broccoli with `name = "fried rice"` and the
model can reasonably return calories for the *entire plate* interpreted as
fried rice. The number comes back plausible and badly wrong, which is the worst
failure mode available.

The recalculation prompt therefore carries the whole plate and names the target:

> This photo contains these items: chicken breast, white rice, broccoli.
> The owner has corrected item 2 to: fried rice.
> Trust that correction over your own reading of the image. Estimate calories
> for **only** that one item as it appears in this photo — not the whole plate.

The response reuses the existing schema; the client takes `total_calories` from
it as that single item's new calorie value and leaves every other item
untouched. One item fixed per call, other items' manual edits preserved.

## Calorie-density reference

A static table of kcal per 100 g, embedded in the system prompt alongside the
existing plate and bowl dimensions. It serves the same purpose those do: give
the model a fixed external number to reason against instead of recalling a
total from impression.

The prompt directs a three-step method: identify the food, state the estimated
portion in grams (using the plate/bowl scale), then multiply by the density —
stating the result as the reasoning string. This is what makes the reasoning
field an accuracy feature rather than a display feature.

**Composition.** Roughly 35 entries, weighted deliberately:

- **Fats and oils** (olive oil, butter, mayonnaise, nuts, cheese) — the largest
  error source by far. A tablespoon of oil is ~120 kcal and visually nearly
  invisible; misjudging it swamps every vegetable on the plate.
- **Dense starches** (white and brown rice, pasta, bread, potato, tortilla) —
  high calorie count, high portion-size ambiguity.
- **Proteins** (chicken breast and thigh, beef, pork, fish, egg, tofu) — wide
  density range between cuts, so naming the cut matters.
- **Everything else** (vegetables, fruit, broth) — a handful of entries only.
  These are low-density and low-stakes; precision here does not move a daily
  total.

The owner's logged history is too small to tailor the list to (4 meals at time
of writing: smoked lamb, corn on the cob, roasted cauliflower, sweet potato,
beef curry, mac salad, tortilla chips, beer). The table starts generic and is a
plain exported constant, trivial to extend once real logging history exists.

**Cost.** ~35 entries is on the order of 300–400 additional prompt tokens per
call, on `claude-haiku-4-5`. At a 20/day cap this is negligible.

### Why not a live nutrition API

USDA FoodData Central, Nutritionix, and similar are built around packaged and
branded products that resolve to one matchable database row. Home-plated mixed
dishes — the entire use case here — mostly do not resolve cleanly: "beef curry
with egg" and "mac salad" have no single authoritative entry, and picking among
fuzzy matches is itself a judgement call the model would have to make anyway.
In exchange for that unreliable benefit it would add a network dependency in
the request path, a rate limit, possibly another API key to manage, and
latency on every estimate. A static table captures most of the available
accuracy at none of that cost.

## Architecture

### Schema — one additive column

```sql
alter table meals add column items jsonb;
```

Nullable, default null. Manual meals and every existing row stay null. Existing
row-level RLS policies cover the new column; no policy change is needed.

Stored shape:

```json
[
  {"name": "chicken breast", "calories": 250, "reasoning": "~150 g, about a deck of cards"},
  {"name": "white rice",     "calories": 260, "reasoning": "~200 g, filling half a 27 cm plate"}
]
```

### `pwa/supabase/functions/estimate-meal/prompt.ts`

Grows from one exported prompt builder into the module owning all prompt text,
so the system prompt becomes testable rather than an untested literal in
`index.ts`:

- `DENSITIES` — the static table, exported for testing.
- `systemPrompt()` — today's plate/bowl/estimate-generously text, plus the
  density table and the identify → grams → multiply instruction. Moves here
  from `index.ts`.
- `mealPrompt(name)` — unchanged, still covers the no-name and whole-meal
  correction cases.
- `itemPrompt(items, index)` — the per-item recalculation text described above.
  Reuses `normalizeName` for each name it embeds, so the 200-character cap and
  the "untrusted text goes in the user turn" rule apply identically.

### `pwa/supabase/functions/estimate-meal/index.ts`

- `SCHEMA` gains a required `reasoning: string` on each item.
- `SYSTEM` is replaced by `systemPrompt()`.
- The request body accepts an optional `items: [{name}]` plus `itemIndex:
  number` for the per-item path, validated the same way `name` already is:
  wrong type is a 400, absent is the existing behavior.

### `pwa/src/components/PhotoMealForm.jsx`

The confirm screen becomes a list of item rows rather than one name/calorie
pair. Per item: an editable name input, an editable calorie input, a
recalculate control, and the reasoning below in muted text. Above them, the
editable meal name (defaulting to the joined item names) and the derived
read-only total.

State moves from `name`/`calories` scalars to an `items` array plus a separate
`mealName`. `recalculate(index)` replaces the current whole-meal
`recalculate()`; the in-flight lock becomes per-row so one item recalculating
does not disable the others' inputs.

Save inserts one row: `mealName`, the summed calories, `source: 'photo'`, and
the items array into the new column.

This component is doing appreciably more than it was. If the item-row markup
makes the file unwieldy, extracting a presentational `MealItemRow` is in scope;
splitting further is not.

### `pwa/src/pages/Dashboard.jsx`

`loadMeals`'s select adds `items`. Each meal row in the daily list renders an
expand arrow when `m.items` is non-empty, toggling a read-only indented
breakdown. Rows without items (every manual meal, every pre-migration row)
render exactly as they do now — no arrow, no layout shift.

## Testing

Automated, in `prompt.test.ts` (the pure module — vitest reaches
`supabase/functions/`, verified 2026-07-20):

- `DENSITIES` entries are well-formed: non-empty name, positive integer
  kcal/100 g, no duplicate names.
- `systemPrompt()` contains the plate and bowl dimensions, at least one known
  density line, and the grams-then-multiply instruction.
- `mealPrompt` retains every behavior from its existing suite (unchanged
  default with no name, correction phrasing with one, truncation at 200).
- `itemPrompt` names the target item, includes the other items as context, and
  contains an explicit "only that item" constraint; out-of-range and empty
  index inputs fall back to `mealPrompt` rather than emitting a malformed
  prompt.

A new pure helper `itemsTotal(items)` (summing, tolerating blank and
non-numeric calorie fields mid-edit) is unit tested alongside the existing
`lib/` helpers.

Manual, since the vision call cannot be asserted on:

1. Photograph a plate with at least three distinguishable foods. Confirm each
   appears as its own row with a plausible portion note, and the total equals
   the item sum.
2. Correct one item's name to a clearly different food and recalculate that
   row. Confirm only that row's calories change, the other rows and their
   manual edits are untouched, and the returned number is plausible *for that
   item alone* — not near the whole-plate total. This is the check that the
   context-carrying prompt is working.
3. Save, then expand the meal in the daily list and confirm the breakdown
   matches what was saved.
4. Log a manual meal and confirm it renders with no expand arrow.

## Out of scope

- Any live nutrition API or barcode lookup.
- Editing or re-pricing a meal after it is saved (delete and redo).
- A user-editable density table in Settings — the constant is one file edit
  away and there is no evidence yet of which foods need tuning.
- Changing the model, the 20/day cap, or how the cap is counted.
- Backfilling `items` for meals already logged; those stay null forever.
