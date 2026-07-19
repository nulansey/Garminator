import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { intakeDate } from "../lib/intakeDate.js";
import { input, buttonPrimary } from "../styles/ui.js";

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
        style={{ ...input, flex: 2, minWidth: 120 }}
      />
      <input
        type="number"
        required
        placeholder="Calories"
        value={calories}
        onChange={(e) => setCalories(e.target.value)}
        style={{ ...input, flex: 1, minWidth: 90 }}
      />
      <button type="submit" disabled={saving} style={buttonPrimary}>
        {saving ? "Saving…" : "Log meal"}
      </button>
      {error && <span style={{ color: "var(--state-over-fg)" }}>Save failed</span>}
    </form>
  );
}
