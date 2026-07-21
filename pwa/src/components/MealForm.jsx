import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";
import { callEstimate } from "../lib/estimateMeal.js";
import {
  itemsTotal, itemsForSave, hasIncompleteItem, blankItem, withFallbackName,
} from "../lib/mealItems.js";
import MealItemsEditor from "./MealItemsEditor.jsx";
import { input, button, buttonPrimary, textSecondary } from "../styles/ui.js";

export default function MealForm({ onSaved }) {
  const [mealName, setMealName] = useState("");
  // One blank row so the fast path - meal name, one number, Save - takes the
  // same interactions it always has.
  const [items, setItems] = useState([blankItem(0)]);
  const [estimating, setEstimating] = useState(false);
  const [estimateFailed, setEstimateFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Price the typed description. No photo, so the model works from stated
  // quantities. On failure the rows already on screen are left untouched.
  async function estimate() {
    setEstimateFailed(false);
    setEstimating(true);
    try {
      const est = await callEstimate({ text: mealName });
      setItems(
        (est.items ?? []).map((it, i) => ({
          key: i,
          name: it.name ?? "",
          calories: String(it.estimated_calories ?? ""),
          reasoning: it.reasoning ?? null,
        })),
      );
    } catch {
      setEstimateFailed(true);
    }
    setEstimating(false);
  }

  async function save(e) {
    e.preventDefault();
    setError(false);
    setSaving(true);
    const rows = withFallbackName(itemsForSave(items), mealName.trim());
    const { error } = await supabase.from("meals").insert({
      name: mealName,
      calories: itemsTotal(items),
      source: "manual",
      eaten_at: new Date().toISOString(),
      intake_date: intakeDate(),
      items: rows.length ? rows : null,
    });
    setSaving(false);
    if (error) {
      setError(true); // keep typed values so nothing is re-entered
    } else {
      setMealName("");
      setItems([blankItem(0)]);
      setEstimateFailed(false);
      onSaved();
    }
  }

  const total = itemsTotal(items);
  const incomplete = hasIncompleteItem(items);
  const savedRows = withFallbackName(itemsForSave(items), mealName.trim());
  const canSave = mealName.trim() !== "" && savedRows.length > 0 && !incomplete && !saving;

  return (
    <form onSubmit={save} style={{ margin: "1rem 0" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          required
          placeholder="Meal (e.g. 2 eggs and a sausage)"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          style={{ ...input, flex: 2, minWidth: 140 }}
        />
        <button
          type="button"
          onClick={estimate}
          disabled={estimating || !mealName.trim()}
          style={button}
        >
          {estimating ? "Estimating…" : "✨ Estimate"}
        </button>
      </div>
      <MealItemsEditor items={items} onChange={setItems} />
      <div style={{ margin: "12px 0", fontWeight: "var(--font-weight-emphasis)" }}>
        Total: {total} kcal
      </div>
      {incomplete && (
        <p style={textSecondary}>Give every named item a calorie number before saving.</p>
      )}
      {estimateFailed && (
        <p style={{ color: "var(--state-over-fg)" }}>
          Estimate failed — the items above are unchanged.
        </p>
      )}
      <button type="submit" disabled={!canSave} style={buttonPrimary}>
        {saving ? "Saving…" : "Log meal"}
      </button>
      {error && <span style={{ color: "var(--state-over-fg)", marginLeft: 8 }}>Save failed</span>}
    </form>
  );
}
