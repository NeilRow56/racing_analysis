import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { before, canonicalTargetMatches, cleanCapture, commentSignals, ledgerEvidence, number, parseOptions, positiveTissueSelections, rank, renderReport, validateReconstructedField, type Case, type FieldRow } from "./diagnose-three-winners";

const cutoff = new Date("2026-10-08T14:00:00Z");
const capture = { raceId: "race", recordedAt: "2026-10-08T12:00:00Z", recordedPreRace: true };
const ledger = (file: string, entries: Record<string, unknown>[]) => ({ file, entries, sha256: null, status: "read original forward ledger" });

describe("three-winner pre-race evidence", () => {
  test("fixed historical date and strict CLI validation", () => {
    assert.deepEqual(parseOptions([]), { date: "2026-10-08", validate: false });
    assert.deepEqual(parseOptions(["--validate"]), { date: "2026-10-08", validate: true });
    assert.throws(() => parseOptions(["--date", "2026-02-30"]));
    assert.throws(() => parseOptions(["--date"]));
    assert.throws(() => parseOptions(["--fallback"]));
  });
  test("off-time equality, invalid timestamps and missing flags are rejected", () => {
    assert.equal(before("2026-10-08T13:59:59Z", cutoff), true);
    assert.equal(before(cutoff, cutoff), false);
    assert.equal(before("bad", cutoff), false);
    assert.equal(cleanCapture({ ...capture, recordedAt: cutoff.toISOString() }, cutoff), false);
    assert.equal(cleanCapture({ ...capture, recordedPreRace: null }, cutoff), false);
  });
  test("SP-derived market fields never become pre-race prices", () => {
    const evidence = ledgerEvidence([ledger("tissue-forward-v2.json", [{ ...capture, runners: [{ runnerId: "runner", tissueRank: 2, probability: 0.16, finalSp: 10, marketRank: 4, marketImpliedProbability: 0.1, finishingPosition: 1 }] }])], "race", "runner", "Stanage", cutoff);
    assert.equal(evidence.models[0].rank, 2);
    assert.deepEqual(evidence.prices, []);
    assert.deepEqual(evidence.selections, []);
  });
  test("rank-one eligibility guard blocks a recorded rating selection", () => {
    const evidence = ledgerEvidence([ledger("jump-rating-forward-v1.json", [{ ...capture, jprARankEligible: false, runners: [{ runnerId: "runner", jprARank: 1, jprBRank: 2 }] }])], "race", "runner", "Ballygeary", cutoff);
    assert.equal(evidence.models[0].eligible, false);
    assert.deepEqual(evidence.selections, []);
  });
  test("actual frozen rank-one attribution requires exact race and runner IDs", () => {
    const data = ledger("tissue-forward-v2.json", [{ ...capture, runners: [{ runnerId: "runner", tissueRank: 1, probability: 0.16 }] }]);
    assert.equal(ledgerEvidence([data], "race", "runner", "Stanage", cutoff).selections[0].system, "Turf Tissue v2");
    assert.deepEqual(ledgerEvidence([data], "wrong-race", "runner", "Stanage", cutoff).models, []);
    assert.deepEqual(ledgerEvidence([data], "race", "other", "Stanage", cutoff).models, []);
  });
  test("late captures and late prices are excluded independently", () => {
    const data = ledger("aw-tissue-forward-v1.json", [{ ...capture, top1: "runner", runners: [{ runnerId: "runner", rank: 1, probability: 0.2 }], prices: {
      early: { medianBookmakerPriceDecimal: 10, bookmakerQuoteCount: 3, capturedAt: "2026-10-08T12:30:00Z" },
      t60: { medianBookmakerPriceDecimal: 12, bookmakerQuoteCount: 3, capturedAt: "2026-10-08T14:01:00Z" },
    } }, { ...capture, recordedAt: "2026-10-08T14:01:00Z", runners: [{ runnerId: "runner", rank: 1, probability: 0.9 }] }]);
    const evidence = ledgerEvidence([data], "race", "runner", "State Express", cutoff);
    assert.equal(evidence.models.length, 1);
    assert.equal(evidence.prices.length, 1);
    assert.equal(evidence.prices[0].probability, 0.1);
    assert.equal(evidence.audit.some((a) => a.status.startsWith("excluded")), true);
  });
  test("post-race outcomes cannot affect frozen attribution", () => {
    const run = (position: number, sp: number) => ledgerEvidence([ledger("tissue-forward-v2.json", [{ ...capture, winners: ["Other"], runners: [{ runnerId: "runner", tissueRank: 1, probability: 0.16, finalSp: sp, finishingPosition: position }] }])], "race", "runner", "Stanage", cutoff);
    assert.deepEqual(run(1, 10), run(8, 2));
  });
  test("positive-edge selector uses existing quote requirements and only rank 1", () => {
    const data = ledger("tissue-forward-v2.json", [{ ...capture, runners: [{ runnerId: "runner", tissueRank: 1, probability: 0.16 }] }]);
    const models = ledgerEvidence([data], "race", "runner", "Stanage", cutoff).models;
    const price = { decimal: 10, probability: 0.1, capturedAt: "2026-10-08T12:30:00Z", source: "fixture", quoteCount: 3 };
    assert.equal(positiveTissueSelections(models, price).length, 1);
    assert.equal(positiveTissueSelections(models, { ...price, quoteCount: 0 }).length, 0);
    assert.equal(positiveTissueSelections(models.map((m) => ({ ...m, rank: 2 })), price).length, 0);
    assert.equal(positiveTissueSelections(models, { ...price, decimal: 2, probability: 0.5 }).length, 0);
  });
  test("forecast-like stored prices cannot be treated as bookmaker medians", () => {
    const data = ledger("aw-tissue-forward-v1.json", [{ ...capture, top1: "runner", runners: [{ runnerId: "runner", rank: 1, probability: 0.2 }], prices: { early: { decimalPrice: 10, capturedAt: "2026-10-08T12:30:00Z" } } }]);
    assert.deepEqual(ledgerEvidence([data], "race", "runner", "State Express", cutoff).prices, []);
  });
  test("shadow capture provenance uses its actual live-sync schema", () => {
    const data = ledger("aw-tissue-parity-shadow-forward-v1.json", [{ raceId: "race", captureMode: "live_sync", capturedAt: "2026-10-08T12:30:00Z", v1RecordedAt: "2026-10-08T12:00:00Z", runners: [{ runnerId: "runner", candidateRank: 2, candidateProbability: 0.2 }] }]);
    assert.equal(ledgerEvidence([data], "race", "runner", "State Express", cutoff).models[0].rank, 2);
    data.entries[0].captureMode = "retrospective_or_imported";
    assert.deepEqual(ledgerEvidence([data], "race", "runner", "State Express", cutoff).models, []);
  });
  test("competition ranks preserve ties and missingness", () => {
    assert.equal(rank(90, [100, 100, 90, null]), 3);
    assert.equal(rank(10, [3, 10, 10, null], true), 2);
    assert.equal(rank(null, [100]), null);
    assert.equal(number(null), null);
    assert.equal(number(false), null);
  });
  test("comment cues do not manufacture unsuitable conditions", () => {
    assert.deepEqual(commentSignals("Hampered, not fluent, stayed on"), ["trouble in running", "jumping error", "late progress"]);
    assert.deepEqual(commentSignals("Finished fifth"), []);
    assert.deepEqual(commentSignals(null), []);
  });
  test("invalid frozen probability fails closed", () => {
    assert.throws(() => ledgerEvidence([ledger("tissue-forward-v2.json", [{ ...capture, runners: [{ runnerId: "runner", tissueRank: 1, probability: 1.3 }] }])], "race", "runner", "Stanage", cutoff));
  });
});

describe("three-winner field reconstruction validation", () => {
  const runner = (name: string, resultStatus: string | null = "finished") => ({ runnerId: name.toLowerCase(), name, resultStatus });

  test("declared field 7, active runners 6 and one genuine NR passes with an explicit exclusion", () => {
    const validation = validateReconstructedField({
      raceName: "Ballygeary",
      dbDeclaredRunnerCount: 6,
      dbActualRunnerCount: 7,
      racecardRideCount: 7,
      resultRideCount: 6,
      runners: [runner("Ballygeary"), runner("Caelan", "non_runner"), runner("Sun Art", "pulled_up"), runner("Latin"), runner("Knighton"), runner("Bannister"), runner("Paddys Policy")],
    });
    assert.equal(validation.ok, true);
    assert.equal(validation.declaredField, 7);
    assert.equal(validation.activeRunnerCount, 6);
    assert.deepEqual(validation.excludedNonRunners, ["Caelan"]);
    assert.equal(validation.diagnostics.some((message) => message.includes("Excluded genuine NR: Caelan")), true);
  });

  test("declared field 7 and active rows 6 fails without a non-runner explanation", () => {
    const validation = validateReconstructedField({
      raceName: "Incomplete",
      dbDeclaredRunnerCount: 7,
      dbActualRunnerCount: 7,
      racecardRideCount: 7,
      resultRideCount: 6,
      runners: [runner("One"), runner("Two"), runner("Three"), runner("Four"), runner("Five"), runner("Six")],
    });
    assert.equal(validation.ok, false);
    assert.match(validation.diagnostics.join("; "), /incomplete|Starter count mismatch|not explained/);
  });

  test("superseded race versions are removed before requiring one canonical target", () => {
    const matches = [
      { raceId: "stale-race", runnerId: "stale-runner", name: "Stanage" },
      { raceId: "current-race", runnerId: "current-runner", name: "Stanage" },
    ];
    const canonical = canonicalTargetMatches(matches, { supersededRaceIds: new Set(["stale-race"]) });
    assert.deepEqual(canonical, [{ raceId: "current-race", runnerId: "current-runner", name: "Stanage" }]);
  });

  test("optional joined data can be unavailable without dropping the runner", () => {
    const validation = validateReconstructedField({
      raceName: "Optional",
      dbDeclaredRunnerCount: 2,
      dbActualRunnerCount: 2,
      racecardRideCount: 2,
      resultRideCount: 2,
      runners: [runner("Complete"), { ...runner("Missing Jockey"), optionalUnavailable: ["jockey name"] }],
    });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.unavailableOptionalFeatures, [{ runner: "Missing Jockey", features: ["jockey name"] }]);
  });

  test("complete normal race passes without count diagnostics", () => {
    const validation = validateReconstructedField({
      raceName: "Normal",
      dbDeclaredRunnerCount: 3,
      dbActualRunnerCount: 3,
      racecardRideCount: 3,
      resultRideCount: 3,
      runners: [runner("One"), runner("Two"), runner("Three")],
    });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.excludedNonRunners, []);
    assert.equal(validation.diagnostics.length, 0);
  });
});

test("report renders every requested section with missing evidence explicit", () => {
  const row: FieldRow = {
    runnerId: "runner", name: "Stanage", officialRating: null, orRank: null, market: null, marketRank: null, marketRankComplete: false,
    speed: null, speedRanks: { latest: null, bestL3: null, averageL3: null }, trainer: null, jockey: null, trainerRank: null, jockeyRank: null, trainerPrior: undefined, jockeyPrior: undefined,
    trainerContext: {}, daysSinceRun: null, classMove: "unknown", records: {}, recentForm: [], priors: [], metrics: null, goingForm: undefined,
    models: [], reconstructedModels: {}, selections: [], ruleMatches: [], ruleAudit: [], signals: [], priceComparisons: [],
    outcome: { position: 1, status: null, sp: "7/1", spDecimal: 8, spRank: 3 }, ledgerAudit: [],
  };
  const c: Case = { name: "Stanage", race: { raceId: "race", sourceId: null, scheduledTime: "14:00", raceDateTime: cutoff, courseCountry: "UK", raceName: null, raceClass: null, raceType: "Flat", raceTypeCode: null, distance: null, distanceYards: null, going: null, surface: "TURF", declaredRunnerCount: 1, actualRunnerCount: 1, winningTime: null, course: "Fixture", family: "turf_flat", cutoff: cutoff.toISOString(), metadataProvenance: "Synthetic fixture" }, winner: row, field: [row], comparators: { favourites: [], modelLeaders: [], secondRanked: [] }, positives: ["Evidence unavailable"], hiddenForm: "No angle established", missed: ["Unknown"] };
  const output = renderReport({ date: "2026-10-08", generatedAt: cutoff.toISOString(), methodology: [], ledgers: [], cases: [{ ...c, name: "Ballygeary" }, c, { ...c, name: "State Express" }], common: [], leads: [] });
  for (const section of ["Executive Summary", "Ballygeary", "Stanage", "State Express", "Existing Model Selections", "Full-Field Comparisons", "Hidden Form", "Trainer Context", "Price / Value Context", "Common Characteristics", "Favourite Comparisons", "What Our Models Missed", "Research Leads"]) assert.ok(output.includes(`## ${section}`));
  assert.ok(output.includes("Turf Tissue involved: UNKNOWN"));
  assert.ok(output.includes("full-field prices unavailable"));
});
