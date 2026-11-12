import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { winGrossReturn } from "./win-settlement";

describe("winGrossReturn", () => {
  test("settles ordinary winners and losers", () => {
    assert.equal(winGrossReturn({ won: true, decimalOdds: 5 }), 5);
    assert.equal(winGrossReturn({ won: false, decimalOdds: 5 }), 0);
  });

  test("divides the entire winning stake for two-way and three-way dead heats", () => {
    assert.equal(winGrossReturn({ won: true, decimalOdds: 5, deadHeatDivisor: 2 }), 2.5);
    assert.equal(winGrossReturn({ won: true, decimalOdds: 7, deadHeatDivisor: 3 }), 7 / 3);
    assert.equal(winGrossReturn({ won: true, decimalOdds: 4.5, deadHeatDivisor: 2 }), 2.25);
  });

  test("caps fractional odds before applying the dead-heat divisor", () => {
    assert.equal(winGrossReturn({ won: true, decimalOdds: 26, deadHeatDivisor: 2, maxFractionalOdds: 20 }), 10.5);
    assert.equal(winGrossReturn({ won: true, decimalOdds: 26, maxFractionalOdds: 20 }), 21);
  });
});
