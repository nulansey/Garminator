export function dayIntake(meals, date) {
  return meals
    .filter((m) => m.intake_date === date)
    .reduce((sum, m) => sum + Number(m.calories), 0);
}

// Balance = burn - intake, summed over the 7 intake-dates ending at `today`.
// Garmin burn is calendar-day; intake is 6am-bucketed. The minor window
// mismatch is accepted (see spec decision #2).
export function sevenDayBalance(days, meals, today) {
  const burnByDate = Object.fromEntries(days.map((d) => [d.date, d.total_kcal]));
  const end = new Date(today + "T00:00:00Z");
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const burn = burnByDate[iso];
    if (burn == null) continue; // no Garmin burn yet for this day - skip, don't treat as 0
    total += burn - dayIntake(meals, iso);
  }
  return total;
}

// Maps today's balance (burn - intake) against the user's goal to the
// glanceable good/warn/over state. See spec decision #1 in
// docs/superpowers/specs/2026-07-18-dark-theme-design-system.md.
export function deficitState(balance, goalType, goalAmount) {
  if (goalType === "surplus") {
    if (balance <= -goalAmount) return "good";
    if (balance <= 0) return "warn";
    return "over";
  }
  if (goalType === "maintain") {
    const abs = Math.abs(balance);
    if (abs <= goalAmount) return "good";
    if (abs <= goalAmount * 2) return "warn";
    return "over";
  }
  // deficit (default)
  if (balance >= goalAmount) return "good";
  if (balance >= 0) return "warn";
  return "over";
}
