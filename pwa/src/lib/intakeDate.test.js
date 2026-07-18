import { describe, it, expect } from "vitest";
import { intakeDate } from "./intakeDate.js";

// Honolulu is UTC-10. 02:00 HST on 2026-07-17 == 12:00 UTC same day.
// 14:00 HST on 2026-07-17 == 00:00 UTC on 2026-07-18.
describe("intakeDate", () => {
  it("buckets pre-6am HST to the previous day", () => {
    expect(intakeDate(new Date("2026-07-17T12:00:00Z"))).toBe("2026-07-16");
  });
  it("buckets 6am HST exactly to the same day", () => {
    // 06:00 HST == 16:00 UTC
    expect(intakeDate(new Date("2026-07-17T16:00:00Z"))).toBe("2026-07-17");
  });
  it("buckets afternoon HST to the same day", () => {
    expect(intakeDate(new Date("2026-07-18T00:00:00Z"))).toBe("2026-07-17");
  });
});
