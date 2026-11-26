import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAwProfitabilityReport, readAwProfitabilityLedgers } from "@/lib/racing/aw-profitability-report";
import { AW_SPRINT_ID } from "@/lib/racing/aw-profit-sprint-filter";
import { CHASE_CLASS46_ID } from "@/lib/racing/chase-t3-class46-handicap";
import { HURDLE_CLASS4_ID } from "@/lib/racing/hurdle-t2-class4-filter";
import { HURDLE_T2_FILTER_ID } from "@/lib/racing/hurdle-t2-nonhandicap-filter";
import { GENERATION_MODEL_HASHES } from "@/lib/racing/tissue-generation-config";
import { emptyTissueGeneration, loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { buildDailyProfitability, DailyProfitability, readDailyShadows } from "./daily-profitability";

const [generation, aw, shadows] = await Promise.all([loadTissueGeneration(), readAwProfitabilityLedgers(), readDailyShadows()]);
const present = <T,>(value: T): PromiseFulfilledResult<T> => ({ status: "fulfilled", value });
const date = "2026-11-27";
const armedAt = "2026-11-26T16:54:02.500Z";
const sourceCapturedAt = date + "T08:00:00.000Z";
const capturedAt = date + "T08:01:00.000Z";
const recordedAt = date + "T16:01:00.000Z";
const identity = (raceId: string, hour = "13") => ({
  raceId, raceDate: date, course: "Same Course", scheduledOff: date + "T" + hour + ":00:00.000Z",
  sourceCapturedAt, featureCutoffAt: sourceCapturedAt, capturedAt,
});
const t2 = { runnerId: "two", horseId: "horse-two", horseName: "T2 Horse", rank: 2 as const, capturedPrice: null, quotes: [] };
const third = { ...t2, runnerId: "three", horseId: "horse-three", horseName: "T3 Horse", rank: 3 as const };
const baseOutcome = {
  version: CANONICAL_SETTLEMENT_VERSION, status: "settled" as const, recordedAt, winner: true, finishPosition: 1,
  capturedProfitLoss: null, deadHeatDivisor: 1, finalSp: { fractional: "4/1", decimal: 5, profitLoss: 4 },
};
const voidOutcome = { ...baseOutcome, status: "void" as const, winner: null, finishPosition: null, finalSp: null };
const frame = {
  modelHash: GENERATION_MODEL_HASHES.HURDLE, handicap: "non-handicap" as const,
  handicapEvidence: { source: "frozen_tissue_handicap_input" as const, values: [0, 0] as (0 | 1)[] },
  distanceFurlongs: 17, t2,
};
const short = {
  ...identity("short"), ...frame, decision: "NO BET" as const, selectionRunnerId: null, settlement: baseOutcome,
  abstentionReason: "confirmed_non_handicap_under_18f" as const,
};
const checked = {
  ...frame, evidence: { cardSourceId: "provider", cardStage: "DORMANT", cardIdentityVerified: true, cardClass: "4",
    cardHandicap: "handicap" as const, cardDistanceYards: 4400, classInputs: [4, 4], distanceInputs: [20, 20] },
  officialClass: 4, confirmedHandicap: "handicap" as const, confirmedDistanceYards: 4400, originalDecision: "BET" as const,
};
const sprintFrame = {
  modelHash: GENERATION_MODEL_HASHES.AW, v1DecidedAt: capturedAt, sourceId: "provider", material: "TAPETA" as const,
  awConfirmed: true, handicap: "handicap" as const, distanceYards: 1320, completeMarket: false,
  t2, v1: third, outcomes: { t2: null, v1: null },
};
const chasePick = (p: typeof t2 | typeof third) => ({ ...p, probability: 0.2, priceCapturedAt: sourceCapturedAt, priceStatus: "missing" as const });
const chaseFrame = {
  modelHash: GENERATION_MODEL_HASHES.CHASE, family: "CHASE" as const, handicap: "handicap" as const, officialClass: 4,
  evidence: { handicapInputs: [1, 1] as (0 | 1)[], classInputs: [4, 4], officialClassText: "4", cardIdentityVerified: true,
    cardHandicap: "handicap" as const, cardSourceId: "provider", cardStage: "DORMANT", t3Withdrawn: false },
  t2: chasePick(t2), t3: chasePick(third),
};
const empty = emptyTissueGeneration();

test("shows today's stored choices, each distinct abstention and retained or substituted Chase ranks", () => {
  const report = buildDailyProfitability(date, empty, buildAwProfitabilityReport(date, empty, aw), [
    present({ policy: AW_SPRINT_ID, version: 1, armedAt, races: [
      { ...identity("sprint", "14"), ...sprintFrame, selectionRunnerId: null, reason: "sprint_handicap_filter" },
      { ...identity("retained", "12"), ...sprintFrame, distanceYards: 1800, selectionRunnerId: third.runnerId, reason: "v1_retained" },
    ] }),
    present({ policy: HURDLE_T2_FILTER_ID, armedAt, races: [
      short, { ...identity("hurdle-retain"), ...frame, distanceFurlongs: 20, decision: "BET", selectionRunnerId: t2.runnerId,
        abstentionReason: null, settlement: voidOutcome },
    ] }),
    present({ policy: HURDLE_CLASS4_ID, armedAt, races: [
      { ...checked, ...short, existingDecision: "NO BET" },
      { ...checked, ...identity("extra"), existingDecision: "BET", decision: "NO BET", selectionRunnerId: null,
        abstentionReason: "confirmed_class_4", settlement: { ...baseOutcome, winner: false, finishPosition: 2,
          finalSp: { fractional: "9/2", decimal: 5.5, profitLoss: -1 } } },
    ] }),
    present({ policy: CHASE_CLASS46_ID, version: 1, armedAt, races: [
      { ...identity("sprint"), ...chaseFrame, decision: "T3_SUBSTITUTION", reason: "class46_handicap", selectionRunnerId: third.runnerId,
        outcomes: { t2: null, shadow: null } },
      { ...identity("chase-retain"), ...chaseFrame, decision: "T2_RETAINED", reason: "unknown_class", selectionRunnerId: t2.runnerId,
        outcomes: { t2: null, shadow: null } },
      { ...identity("chase-empty"), ...chaseFrame, t2: null, decision: "NO_SELECTION", reason: "missing_or_invalid_t2", selectionRunnerId: null,
        outcomes: { t2: null, shadow: null } },
    ] }),
  ]);
  assert.equal(report.races.length, 8);
  assert.deepEqual(report.races.filter(r => r.family === "AW").map(r => r.raceId), ["retained", "sprint"]);
  assert.equal(report.races.find(r => r.raceId === "short")?.entries.filter(e => e.decision?.reason === "Short non-handicap").length, 2);
  const html = renderToStaticMarkup(<DailyProfitability report={report} date={date} />);
  for (const value of ["Sprint handicap", "Original V1 retained", "Short non-handicap", "Class 4 exclusion", "T3 SUBSTITUTED", "T2 RETAINED",
    "NO SELECTION", "NO BET", "bg-red-700", "PENDING", "Won", "Lost", "VOID", "quote unavailable", "Verified final SP 4/1",
    "Matching Tissue source book unavailable"]) assert(html.includes(value), value);
});

test("uses the selected date for every family, shows zero-observation activation, and never invents sprint decisions", () => {
  const historical = "2026-11-22";
  const report = buildDailyProfitability(historical, generation, buildAwProfitabilityReport(historical, generation, aw), shadows);
  assert(report.races.every(r => r.raceDate === historical));
  for (const r of report.races.filter(r => r.family === "AW")) {
    const sprint = r.entries.find(e => e.policy === "Sprint Filter V1");
    assert(sprint?.armedAt);
    assert.equal(sprint.decision, undefined);
    assert.equal(sprint.missing, "Race preceded activation.");
  }
  const noShadows = buildDailyProfitability(historical, generation, buildAwProfitabilityReport(historical, generation, aw),
    [present(null), present(null), present(null), present(null)]);
  assert(noShadows.races.every(r => !r.entries.some(e => e.policy === "Sprint Filter V1")));
  const html = renderToStaticMarkup(<DailyProfitability report={noShadows} date={historical} />);
  assert(html.includes("UNARMED"));
  assert(html.includes("NO BET"));
});
