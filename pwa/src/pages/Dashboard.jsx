import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import WeightForm from "../components/WeightForm.jsx";
import WeightTrendChart from "../components/WeightTrendChart.jsx";
import MealForm from "../components/MealForm.jsx";
import PhotoMealForm from "../components/PhotoMealForm.jsx";
import { intakeDate } from "../lib/intakeDate.js";
import { dayIntake, sevenDayBalance } from "../lib/balance.js";

function hoursMinutes(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Dashboard() {
  const [days, setDays] = useState(null); // null = loading, [] = loaded empty
  const [error, setError] = useState(false);
  const [weights, setWeights] = useState(null);
  const [meals, setMeals] = useState(null);

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

  async function loadWeights() {
    const { data } = await supabase
      .from("weights")
      .select("id, measured_at, weight")
      .order("measured_at", { ascending: true });
    setWeights(data ?? []);
  }

  async function loadMeals() {
    const { data } = await supabase
      .from("meals")
      .select("id, intake_date, name, calories")
      .order("eaten_at", { ascending: false });
    setMeals(data ?? []);
  }

  async function deleteMeal(id) {
    await supabase.from("meals").delete().eq("id", id);
    loadMeals();
  }

  useEffect(() => {
    load();
    loadWeights();
    loadMeals();
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

      <h2>Today's balance</h2>
      {meals === null ? (
        <p>Loading meals…</p>
      ) : (
        (() => {
          const todayBucket = intakeDate();
          const inToday = dayIntake(meals, todayBucket);
          const burnToday = today.total_kcal; // may be null - Garmin hasn't synced yet
          const weekBalance = sevenDayBalance(days, meals, todayBucket);
          const todayMeals = meals.filter((m) => m.intake_date === todayBucket);
          return (
            <div>
              <ul style={{ listStyle: "none", padding: 0 }}>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Calories in</span><strong>{inToday}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Calories out (in progress)</span><strong>{burnToday ?? "—"}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                  <span>Balance</span><strong>{burnToday == null ? "—" : burnToday - inToday}</strong>
                </li>
                <li style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#64748b" }}>
                  <span>7-day balance</span><strong>{weekBalance}</strong>
                </li>
              </ul>
              <MealForm onSaved={loadMeals} />
              <PhotoMealForm onSaved={loadMeals} />
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

      <h2>Weight</h2>
      <WeightForm onSaved={loadWeights} />
      {weights === null ? <p>Loading weight…</p> : <WeightTrendChart weights={weights} />}
    </section>
  );
}
