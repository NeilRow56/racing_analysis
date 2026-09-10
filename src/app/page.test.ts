import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Home from "./page";

describe("home route", () => {
  test("redirects to today's racing", () => {
    assert.throws(
      () => Home(),
      (error) =>
        error instanceof Error &&
        "digest" in error &&
        typeof error.digest === "string" &&
        error.digest.includes("/racing/today"),
    );
  });
});
