import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isRefreshResultsSubmitDisabled,
  refreshResultsSubmitButtonLabel,
} from "./refresh-results-button";

describe("Refresh results button helpers", () => {
  test("disables duplicate submissions while pending", () => {
    assert.equal(isRefreshResultsSubmitDisabled(false), false);
    assert.equal(isRefreshResultsSubmitDisabled(true), true);
    assert.equal(refreshResultsSubmitButtonLabel(false), "Refresh results");
    assert.equal(refreshResultsSubmitButtonLabel(true), "Refreshing...");
  });
});
