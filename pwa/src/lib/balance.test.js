import { describe, it, expect } from "vitest";
import { dayIntake, sevenDayBalance, deficitState } from "./balance.js";

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

  it("skips days with unknown burn instead of treating it as 0", () => {
    const days = [
      { date: "2026-07-17", total_kcal: null }, // Garmin hasn't synced today yet
      { date: "2026-07-16", total_kcal: 2000 },
    ];
    const meals = [
      { intake_date: "2026-07-17", calories: 800 }, // would wrongly show -800 if burn defaulted to 0
      { intake_date: "2026-07-16", calories: 1800 },
    ];
    // only 07-16 counts: 2000-1800 = 200
    expect(sevenDayBalance(days, meals, "2026-07-17")).toBe(200);
  });
});

describe("deficitState", () => {
  it("deficit goal: good at/above target, warn short of it, over on any surplus", () => {
    expect(deficitState(600, "deficit", 500)).toBe("good");
    expect(deficitState(500, "deficit", 500)).toBe("good");
    expect(deficitState(200, "deficit", 500)).toBe("warn");
    expect(deficitState(0, "deficit", 500)).toBe("warn");
    expect(deficitState(-100, "deficit", 500)).toBe("over");
  });

  it("maintain goal: good within tolerance, warn within 2x, over beyond", () => {
    expect(deficitState(50, "maintain", 100)).toBe("good");
    expect(deficitState(-100, "maintain", 100)).toBe("good");
    expect(deficitState(150, "maintain", 100)).toBe("warn");
    expect(deficitState(-200, "maintain", 100)).toBe("warn");
    expect(deficitState(250, "maintain", 100)).toBe("over");
  });

  it("surplus goal: good at/beyond target surplus, warn short of it, over on any deficit", () => {
    expect(deficitState(-600, "surplus", 500)).toBe("good");
    expect(deficitState(-500, "surplus", 500)).toBe("good");
    expect(deficitState(-200, "surplus", 500)).toBe("warn");
    expect(deficitState(0, "surplus", 500)).toBe("warn");
    expect(deficitState(100, "surplus", 500)).toBe("over");
  });
});
