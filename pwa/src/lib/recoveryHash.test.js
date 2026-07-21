import { describe, it, expect } from "vitest";
import { isRecoveryHash } from "./recoveryHash.js";

describe("isRecoveryHash", () => {
  it("detects a recovery redirect", () => {
    expect(
      isRecoveryHash("#access_token=abc&expires_in=3600&type=recovery")
    ).toBe(true);
  });

  it("works without the leading #", () => {
    expect(isRecoveryHash("access_token=abc&type=recovery")).toBe(true);
  });

  it("ignores a normal sign-in redirect", () => {
    expect(isRecoveryHash("#access_token=abc&type=magiclink")).toBe(false);
  });

  it("is false for an expired-link error hash", () => {
    expect(isRecoveryHash("#error=access_denied&error_code=otp_expired")).toBe(
      false
    );
  });

  it("is false for no hash at all", () => {
    expect(isRecoveryHash("")).toBe(false);
    expect(isRecoveryHash("#")).toBe(false);
  });
});
