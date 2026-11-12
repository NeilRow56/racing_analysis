/** Settlement evidence only: never changes captured inputs, prices or raw results. */
export type SettlementOutcomeEvidence = {
  raceStage?: string | null;
  outcomeCode?: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  won?: boolean | null;
};

const token = (value: string | null | undefined) => (value ?? "").trim().toUpperCase().replace(/[\s_-]/g, "");
const VOID = new Set(["ABANDONED", "ABANDON", "CANCELLED", "CANCELED", "NORACE", "RACEVOID", "VOID", "VOIDRACE"]);
const NR = new Set(["NONRUNNER", "WITHDRAWN", "NR"]);
const NON_FINAL = new Set(["DORMANT", "PARADING", "GOINGDOWN", "ATTHEPOST", "GOINGBEHIND", "OFF", "FINISHED", "RESULT"]);
const NON_FINISHER = new Set(["PULLEDUP", "PU", "FELL", "F", "UNSEATEDRIDER", "UNSEATED", "UR", "BROUGHTDOWN", "BD", "RANOUT", "SLIPPEDUP", "REFUSED", "REFUSEDTORACE", "CARRIEDOUT", "DISQUALIFIED", "DSQ", "DQ"]);

export function isVoidBetStatus(status: string | null | undefined): boolean {
  return VOID.has(token(status)) || NR.has(token(status));
}

export function settlementOutcomeState(outcome: SettlementOutcomeEvidence): "void" | "NR" | "win" | "loss" | "unresolved" {
  const status = token(outcome.resultStatus);
  if (NR.has(status)) return "NR";
  // Race-level terminal evidence takes precedence even over provisional positions.
  if (VOID.has(token(outcome.raceStage))) return "void";
  if (VOID.has(status)) return "void";
  const stage = token(outcome.raceStage);
  if (NON_FINAL.has(stage) || stage && !["WEIGHEDIN", "OFFICIAL", "COMPLETED"].includes(stage)) return "unresolved";
  if (outcome.finishingPosition !== null) {
    if (!Number.isInteger(outcome.finishingPosition) || outcome.finishingPosition < 1) return "unresolved";
    return outcome.finishingPosition === 1 ? "win" : "loss";
  }
  // `other`, `0` and a price are not evidence of a completed losing bet.
  if (NON_FINISHER.has(status) || NON_FINISHER.has(token(outcome.outcomeCode))) return "loss";
  return "unresolved";
}

export function isVoidSettlementOutcome(outcome: SettlementOutcomeEvidence): boolean {
  const state = settlementOutcomeState(outcome);
  return state === "void" || state === "NR";
}

/** Whole-race exclusion; a genuine NR in a valid race remains a captured selection. */
export function isVoidRaceOutcome(outcome: SettlementOutcomeEvidence): boolean {
  return VOID.has(token(outcome.raceStage)) || VOID.has(token(outcome.resultStatus));
}

/** Settlement-only projection. The caller's race and captured runner fields stay immutable. */
export function raceForSettlement<T extends { raceStage?: string | null; runners: Array<{ resultStatus: string | null; finishingPosition: number | null; outcomeCode?: string | null }> }>(race: T): T {
  const stage = token(race.raceStage);
  return { ...race, runners: race.runners.map(runner => {
    if (NR.has(token(runner.resultStatus))) return runner;
    if (VOID.has(stage)) return { ...runner, resultStatus: "void_race", finishingPosition: null };
    if (stage && !["WEIGHEDIN", "OFFICIAL", "COMPLETED"].includes(stage)) return { ...runner, resultStatus: null, finishingPosition: null };
    if (runner.resultStatus === "other" && NON_FINISHER.has(token(runner.outcomeCode))) {
      return { ...runner, resultStatus: token(runner.outcomeCode).toLowerCase() };
    }
    return runner;
  }) };
}
