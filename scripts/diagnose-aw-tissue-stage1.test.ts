import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { baselineOrder, buildPopulation, featureValues, fit, predict, quality, type PriorRun } from "./diagnose-aw-tissue-stage1";
const cache = await loadLatestBacktestFeatureCacheForYear({ year: "2025", family: "all_weather_flat" });
if (!cache?.rows[0])
    throw new Error("Authoritative AW fixture cache required");
const template = cache.rows[0];
function row(id: string, won: boolean, patch: Partial<Row["outcome"]> = {}): Row {
    return {
        features: {
            ...template!.features, targetRaceId: "race", targetRunnerId: id, horseId: id, raceDate: "2025-06-01", raceDateTime: new Date("2025-06-01T12:00:00Z"), latestRunDate: "2025-05-01", actualRunnerCount: 2, declaredRunnerCount: 2, averageAwSpeedLast3: won ? 100 : 80, trainerPriorWinRate: .1, jockeyPriorWinRate: .1
        },
        outcome: {
            ...template!.outcome, targetRaceId: "race", targetRunnerId: id, won, finishingPosition: won ? 1 : 2, resultStatus: "finished", startingPriceDecimal: null, ...patch
        },
    };
}
describe("AW Tissue Stage 1 diagnostic invariants", () => {
    test("retains started non-finishers and winners without prices; rejects incomplete and unresolved fields", () => {
        const rows = [
            row("winner", true), row("loser", false, { finishingPosition: null, won: null, resultStatus: "pulled_up" })
        ];
        const population = buildPopulation(rows, new Map());
        assert.equal(population.examples.length, 2);
        assert.equal(population.examples[1]!.won || population.examples[0]!.won, true);
        assert.equal(population.examples.filter((e) => e.won).length, 1);
        assert.equal(buildPopulation(rows.slice(0, 1), new Map()).examples.length, 0);
        assert.equal(buildPopulation([rows[0]!, row("loser", false, { finishingPosition: null, won: null, resultStatus: "finished" })], new Map()).examples.length, 0);
        assert.equal(buildPopulation([row("a", true), row("b", true)], new Map()).examples.length, 0);
        const withNonRunner = [
            row("winner", true), row("loser", false), row("nr", false, { finishingPosition: null, won: null, resultStatus: "non_runner" })
        ];
        withNonRunner.forEach((r) => { r.features.actualRunnerCount = 3; });
        assert.equal(buildPopulation(withNonRunner, new Map()).examples.length, 2);
    });
    test("counts only earlier AW starters and never target/future comments", () => {
        const run = (raceId: string, date: string, aw: boolean): PriorRun => ({ raceId, raceDate: date.slice(0, 10), raceDateTime: new Date(date), comment: "stayed on", aw });
        const history = new Map([
            [
                "winner", [
                    run("prior-aw", "2025-05-01T12:00:00Z", true), run("prior-turf", "2025-05-02T12:00:00Z", false), run("race", "2025-06-01T12:00:00Z", true), run("future", "2025-06-02T12:00:00Z", true)
                ]
            ]
        ]);
        const e = buildPopulation([row("winner", true), row("loser", false)], history).examples.find((e) => e.won)!;
        assert.equal(e.priorAwStarts, 1);
        assert.deepEqual(e.priorComments.map((r) => r.raceId), ["prior-turf", "prior-aw"]);
    });
    test("predictions are deterministic, normalized and invariant to SP and result field size", () => {
        const examples = buildPopulation([row("winner", true), row("loser", false)], new Map()).examples;
        const model = fit(examples, "AW-T0");
        assert.deepEqual(fit(examples, "AW-T0"), model);
        predict(examples, "AW-T0", model);
        const before = examples.map((e) => e.probabilities["AW-T0"]!);
        assert.ok(Math.abs(before.reduce((a, b) => a + b, 0) - 1) < 1e-12);
        for (const e of examples) {
            e.row.outcome.startingPriceDecimal = "101";
            e.row.features.actualRunnerCount = 999;
        }
        predict(examples, "AW-T0", model);
        assert.deepEqual(examples.map((e) => e.probabilities["AW-T0"]), before);
        assert.ok(Number.isFinite(quality(examples, "AW-T0").logLoss));
        assert.throws(() => quality(examples.slice(0, 1), "AW-T0"), /complete single-winner fields/);
    });
    test("AW-D baseline respects the unchanged coverage guard", () => {
        const examples = buildPopulation([row("winner", true), row("loser", false)], new Map()).examples;
        assert.equal(baselineOrder(examples, "AW_D_V1").length, 2);
        examples.find((e) => !e.won)!.row.features.averageAwSpeedLast3 = null;
        assert.equal(baselineOrder(examples, "AW_D_V1").length, 0);
        assert.equal(baselineOrder(examples, "AW_A_V1").length, 1);
    });
    test("missing numeric values carry a flag and the schema contains no target or market features", () => {
        const e = buildPopulation([row("winner", true), row("loser", false)], new Map()).examples[0]!;
        e.row.features.averageAwSpeedLast3 = null;
        const values = featureValues(e, "AW-T2");
        assert.equal(values[0], null);
        assert.equal(values[7], 1);
        const model = fit(buildPopulation([row("winner", true), row("loser", false)], new Map()).examples, "AW-T1");
        assert.ok(model.names.every((name) => !/odds|market|favourite|finishing|actual_field/.test(name)));
    });
});
