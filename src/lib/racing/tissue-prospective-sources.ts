import { prospectiveGoingFields, type ProspectiveGoing } from "./prospective-going";
import { frozenBestL3SpeedRanks } from "./tissue-speed-rank-watch";
import { getTissueInputReliability, type TissueInputReliability } from "./tissue-input-reliability";
import { TURF_VALUE_CONFIG, AW_VALUE_CONFIG, HURDLE_VALUE_CONFIG } from "./tissue-value-config";
import type { TissueForwardData } from "./tissue-forward";
import { TISSUE_V3_EPOCH, TISSUE_V3_MODEL_VERSION, TISSUE_V3_LIVE_SEMANTICS_VERSION } from "./tissue-forward";
import type { AwTissueForwardData } from "./aw-tissue-forward";
import { AW_TISSUE_V2_EPOCH } from "./aw-tissue-v2-activation";
import { AW_TISSUE_V2_VERSION } from "./aw-tissue-v2";
import type { JumpTissueForwardData } from "./jump-tissue-forward";
import { JUMP_TISSUE_IMPLEMENTED_AT, JUMP_TISSUE_VERSION } from "./jump-tissue-model";
import type { ValueCohortSnapshot } from "./tissue-value-readers";
import { isVoidBetResultStatus, settledWinValue } from "./backtest";
import type { ValueOutcome } from "./tissue-value-metrics";
import { TISSUE_PROSPECTIVE_START, type ProspectiveTissueObservation } from "./tissue-prospective-summary";

// Read-only quarantine recovered from the 23 October audit. Do not delete tracker rows.
// Keep these identities excluded until an explicit identity review resolves the overlap.
export const TISSUE_PENDING_IDENTITY_QUARANTINE = [
  { family: "AW", date: "2026-10-23", sourceId: "945140", reason: "Dundalk: 11 shared horses with alternative pending source 945533" },
  { family: "AW", date: "2026-10-23", sourceId: "945533", reason: "Dundalk: 11 shared horses with alternative pending source 945140" },
  { family: "CHASE", date: "2026-10-22", sourceId: "944784", reason: "Ffos Las: pending field contains all nine horses in settled source 945340; retain 945340" },
] as const;

type Result = { finishPosition: number | null; resultStatus: string | null; winner: boolean | null; deadHeatDivisor: number };
/** Project stored result evidence only. No price settlement or model reconstruction. */
function modelOutcome(result: Result, settledAt: string): ValueOutcome | null {
  const voided = isVoidBetResultStatus(result.resultStatus);
  if (!voided && settledWinValue({ finishingPosition: result.finishPosition, resultStatus: result.resultStatus, won: result.winner }) === null) return null;
  return { ...result, status: voided ? result.resultStatus?.trim().toLowerCase() === "non_runner" ? "NR" : "void" : "settled",
    grossReturn: null, profitLoss: null, settledAt };
}

export function buildProspectiveTissueSources(input: {
  turf: TissueForwardData; aw: AwTissueForwardData; jump: JumpTissueForwardData; cohorts: ValueCohortSnapshot[];
}) {
  const observations: ProspectiveTissueObservation[] = [], priceObservations: ProspectiveTissueObservation[] = [];
  const quarantined: Array<{ family: string; sourceId: string; raceId: string; reason: string }> = [];
  const unresolvedResults: string[] = [];
  const results = new Map<string, ValueOutcome | null>();
  for (const { config, data } of input.cohorts) {
    if (!config.probabilityAvailable) continue;
    for (const race of data.races) {
      if (race.raceDate < TISSUE_PROSPECTIVE_START || race.capturedAt < config.epoch) continue;
      const speedRanks = frozenBestL3SpeedRanks(race.family, race.featureNames, race.runners);
      for (const runner of race.runners) {
        const key = `${race.family}|${race.raceId}|${runner.runnerId}`;
        if (results.has(key)) throw new Error("Duplicate prospective Tissue result evidence");
        results.set(key, runner.outcome);
        priceObservations.push({ family: race.family, tissueRank: runner.tissueRank, probability: runner.probability,
          raceId: race.raceId, capturedAt: race.capturedAt,
          inputReliability: getTissueInputReliability({ family: race.family, featureNames: race.featureNames, modelInputs: runner.modelInputs }),
          ...prospectiveGoingFields(race), capturedPrice: runner.marketPrice, bestL3SpeedRank: speedRanks.get(runner.runnerId) ?? null, outcome: runner.outcome });
      }
    }
  }
  const seen = new Set<string>();
  const add = (family: ProspectiveTissueObservation["family"], raceId: string, runnerId: string, tissueRank: number | null, probability: number | null, outcome: ValueOutcome | null, bestL3SpeedRank: number | null, going: ProspectiveGoing, capturedAt: string, inputReliability: TissueInputReliability) => {
    if (tissueRank !== 1 && tissueRank !== 2) return;
    const key = `${family}|${raceId}|${runnerId}`;
    if (seen.has(key)) throw new Error("Duplicate primary prospective Tissue observation");
    seen.add(key);
    observations.push({ ...prospectiveGoingFields(going), family, raceId, capturedAt, inputReliability, tissueRank, probability: probability!, capturedPrice: null, outcome, bestL3SpeedRank });
  };
  const validBook = (rows: Array<{ runnerId: string; probability: number | null }>) => rows.length >= 2 &&
    new Set(rows.map(r => r.runnerId)).size === rows.length && rows.every(r => r.probability !== null && Number.isFinite(r.probability) && r.probability > 0 && r.probability <= 1) &&
    Math.abs(rows.reduce((sum, r) => sum + r.probability!, 0) - 1) < 1e-10;
  for (const race of input.turf.races) {
    // Turf clocks in this ledger are source UTC clocks, as in the audit.
    const off = `${race.raceDate}T${race.raceTime.length === 5 ? `${race.raceTime}:00` : race.raceTime}.000Z`;
    if (race.raceDate < TISSUE_PROSPECTIVE_START || race.recordedPreRace !== true || race.recordedAt < TISSUE_V3_EPOCH ||
      race.recordedAt >= off || race.tissueModelVersion !== TISSUE_V3_MODEL_VERSION || race.liveSemanticsVersion !== TISSUE_V3_LIVE_SEMANTICS_VERSION || !validBook(race.runners)) continue;
    const speedRanks = frozenBestL3SpeedRanks("TURF", TURF_VALUE_CONFIG.featureNames, race.runners);
    for (const runner of race.runners.filter(r => r.tissueRank === 1 || r.tissueRank === 2)) {
      let outcome: ValueOutcome | null = null;
      if (race.settledAt) {
        const stored = results.get(`TURF|${race.raceId}|${runner.runnerId}`);
        if (stored) {
          if (stored.finishPosition !== runner.finishingPosition) throw new Error("Turf prospective result evidence disagrees with family book");
          // Join result status only: retain the primary book's own ranks/probabilities.
          outcome = modelOutcome(stored, race.settledAt);
        } else if (runner.finishingPosition !== null && Number.isInteger(runner.finishingPosition) && runner.finishingPosition > 0) {
          outcome = modelOutcome({ finishPosition: runner.finishingPosition, resultStatus: "finished", winner: runner.finishingPosition === 1,
            deadHeatDivisor: runner.finishingPosition === 1 ? Math.max(1, race.winners.length) : 1 }, race.settledAt);
        }
        if (!outcome) unresolvedResults.push(`${race.raceId}|${runner.runnerId}`);
      }
      add("TURF", race.raceId, runner.runnerId, runner.tissueRank, runner.probability, outcome, speedRanks.get(runner.runnerId) ?? null, race, race.recordedAt,
        getTissueInputReliability({ family: "TURF", featureNames: TURF_VALUE_CONFIG.featureNames, modelInputs: runner.modelInputs }));
    }
  }
  for (const [data, isAw] of [[input.aw, true], [input.jump, false]] as const) for (const race of data.races) {
    const family = isAw ? "AW" : "subtype" in race && race.subtype === "Hurdle" ? "HURDLE" : "subtype" in race && race.subtype === "Chase" ? "CHASE" : null;
    if (!family || race.raceDate < TISSUE_PROSPECTIVE_START) continue;
    const guard = TISSUE_PENDING_IDENTITY_QUARANTINE.find(q => q.family === family && q.date === race.raceDate && q.sourceId === race.sourceId);
    if (guard) { quarantined.push({ family, sourceId: guard.sourceId, raceId: race.raceId, reason: guard.reason }); continue; }
    if (!race.recordedPreRace || race.recordedAt < (isAw ? AW_TISSUE_V2_EPOCH : JUMP_TISSUE_IMPLEMENTED_AT) || race.recordedAt >= race.scheduledOffAt ||
      race.modelVersion !== (isAw ? AW_TISSUE_V2_VERSION : JUMP_TISSUE_VERSION) || race.excludedReason !== null || !validBook(race.runners)) continue;
    const speedRanks = frozenBestL3SpeedRanks(family, isAw ? AW_VALUE_CONFIG.featureNames : HURDLE_VALUE_CONFIG.featureNames, race.runners);
    for (const runner of race.runners) {
      const result = runner.outcome;
      const outcome = race.settledAt && result ? modelOutcome({ finishPosition: result.finishingPosition, resultStatus: result.resultStatus,
        winner: result.won, deadHeatDivisor: result.deadHeatDivisor }, race.settledAt) : null;
      add(family, race.raceId, runner.runnerId, runner.rank, runner.probability, outcome, speedRanks.get(runner.runnerId) ?? null, race, race.recordedAt,
        getTissueInputReliability({ family, featureNames: isAw ? AW_VALUE_CONFIG.featureNames : HURDLE_VALUE_CONFIG.featureNames, modelInputs: runner.modelInputs }));
    }
  }
  return { observations, priceObservations, quarantined, unresolvedResults };
}
