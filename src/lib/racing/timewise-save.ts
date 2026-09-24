import {
  createRecord,
  forwardRaceKey,
  mutateTrackerData,
  upsertRace,
  type ForwardRaceInput,
  type ForwardRaceRecord,
  type TrackerMutationTiming,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  buildTodayForwardInput,
  TIMEWISE_NON_RUNNER_VALUE,
  timewiseTimingForSave,
} from "./tpr-timewise-forward-context";
import type { TodayRace } from "./todays-racing";

export type TimewiseSaveContext = {
  raceDate: string;
  raceId: string;
  raceDateTime: string | null;
  runners: Array<{ runnerId: string; horseName: string }>;
  forwardInput: ForwardRaceInput;
};

export type TimewiseSaveResult = {
  status: "saved";
  raceId: string;
  timewiseRank1: string | null;
  timewiseRank2: string | null;
  timewiseRank1NonRunner: boolean;
  timewiseRank2NonRunner: boolean;
  timewiseRecordedAt: string | null;
  timewiseRecordedPreRace: boolean | null;
  timewiseUpdatedAt: string | null;
  serverDurationMs: number;
};

export type TimewiseSaveTiming = TrackerMutationTiming & {
  inputParsingValidationMs: number;
  resultSettlementEnrichmentMs: number;
  revalidationMs: number;
  serverActionReturnMs: number;
  totalMs: number;
};

export function buildTimewiseSaveContext(input: {
  course: string;
  race: TodayRace;
  raceDate: string;
}): TimewiseSaveContext {
  return {
    raceDate: input.raceDate,
    raceId: input.race.raceId,
    raceDateTime: input.race.raceDateTime?.toISOString() ?? null,
    runners: input.race.runners.map((runner) => ({
      runnerId: runner.runnerId,
      horseName: runner.horseName,
    })),
    forwardInput: buildTodayForwardInput({
      course: input.course,
      race: input.race,
      raceDate: input.raceDate,
      timewiseRank1: null,
      timewiseRank2: null,
    }),
  };
}

export async function saveTimewiseComparison(input: {
  context: TimewiseSaveContext;
  formData: FormData;
  trackerPath?: string;
  recordedAt?: Date;
  onTiming?: (timing: TimewiseSaveTiming) => void;
}): Promise<TimewiseSaveResult> {
  const startedAt = performance.now();
  const raceDate = requiredFormValue(input.formData, "raceDate");
  const raceId = requiredFormValue(input.formData, "raceId");
  const rank1RunnerId = requiredFormValue(input.formData, "timewiseRank1RunnerId");
  const rank2RunnerId = requiredFormValue(input.formData, "timewiseRank2RunnerId");
  validateSubmission(input.context, { raceDate, raceId, rank1RunnerId, rank2RunnerId });
  const inputParsingValidationMs = performance.now() - startedAt;
  const rank1NonRunner = rank1RunnerId === TIMEWISE_NON_RUNNER_VALUE;
  const rank2NonRunner = rank2RunnerId === TIMEWISE_NON_RUNNER_VALUE;
  const rank1 = rank1NonRunner
    ? null
    : input.context.runners.find((runner) => runner.runnerId === rank1RunnerId)!;
  const rank2 = rank2NonRunner
    ? null
    : input.context.runners.find((runner) => runner.runnerId === rank2RunnerId)!;
  let trackerTiming: TrackerMutationTiming = {
    lockWaitMs: 0,
    fileReadMs: 0,
    mutationMs: 0,
    atomicWriteMs: 0,
  };
  let savedRecord: ForwardRaceRecord | null = null;
  const recordedAt = input.recordedAt ?? new Date();

  await mutateTrackerData((trackerData) => {
    const existing = trackerData.races.find(
      (record) => forwardRaceKey(record) === forwardRaceKey(input.context.forwardInput),
    );
    const settlement = preservedSettlement(existing, input.context.forwardInput);
    savedRecord = createRecord({
      ...input.context.forwardInput,
      ...settlement,
      tprInputSnapshot: existing
        ? existing.tprInputSnapshot ?? null
        : input.context.forwardInput.tprInputSnapshot ?? null,
      timewiseRank1: rank1?.horseName ?? null,
      timewiseRank2: rank2?.horseName ?? null,
      timewiseRank1NonRunner: rank1NonRunner,
      timewiseRank2NonRunner: rank2NonRunner,
      ...timewiseTimingForSave(
        existing,
        input.context.raceDateTime ? new Date(input.context.raceDateTime) : null,
        recordedAt,
      ),
    });
    return upsertRace(trackerData, savedRecord, true);
  }, input.trackerPath, (timing) => {
    trackerTiming = timing;
  });

  const resultSettlementEnrichmentMs = 0;
  const revalidationMs = 0;
  const beforeReturnAt = performance.now();
  const record = savedRecord as ForwardRaceRecord | null;
  if (!record) throw new Error("Timewise tracker save did not produce a record.");
  const result: TimewiseSaveResult = {
    status: "saved",
    raceId,
    timewiseRank1: record.timewiseRank1,
    timewiseRank2: record.timewiseRank2,
    timewiseRank1NonRunner: record.timewiseRank1NonRunner ?? false,
    timewiseRank2NonRunner: record.timewiseRank2NonRunner ?? false,
    timewiseRecordedAt: record.timewiseRecordedAt ?? null,
    timewiseRecordedPreRace: record.timewiseRecordedPreRace ?? null,
    timewiseUpdatedAt: record.timewiseUpdatedAt ?? null,
    serverDurationMs: 0,
  };
  result.serverDurationMs = performance.now() - startedAt;
  const timing: TimewiseSaveTiming = {
    inputParsingValidationMs,
    ...trackerTiming,
    resultSettlementEnrichmentMs,
    revalidationMs,
    serverActionReturnMs: performance.now() - beforeReturnAt,
    totalMs: performance.now() - startedAt,
  };
  input.onTiming?.(timing);
  return result;
}

function validateSubmission(
  context: TimewiseSaveContext,
  input: {
    raceDate: string;
    raceId: string;
    rank1RunnerId: string;
    rank2RunnerId: string;
  },
) {
  if (input.raceDate !== context.raceDate || input.raceId !== context.raceId) {
    throw new Error("Timewise race context does not match the submitted race.");
  }
  if (
    input.rank1RunnerId === input.rank2RunnerId &&
    input.rank1RunnerId !== TIMEWISE_NON_RUNNER_VALUE
  ) {
    throw new Error("Timewise rank 1 and rank 2 must differ.");
  }
  for (const runnerId of [input.rank1RunnerId, input.rank2RunnerId]) {
    if (
      runnerId !== TIMEWISE_NON_RUNNER_VALUE &&
      !context.runners.some((runner) => runner.runnerId === runnerId)
    ) {
      throw new Error("Select runners from this race.");
    }
  }
}

function preservedSettlement(
  existing: ForwardRaceRecord | undefined,
  current: ForwardRaceInput,
): Pick<ForwardRaceInput, "winner" | "winnerSp" | "winners" | "winnerOrRank" | "tprRank1NonRunner" | "tprRank2NonRunner" | "w50Rank1NonRunner"> {
  if (existing && existing.winners.length > 0) {
    return {
      winner: existing.winner,
      winnerSp: existing.winnerSp,
      winners: existing.winners,
      winnerOrRank: existing.winnerOrRank,
      tprRank1NonRunner: existing.tprRank1NonRunner,
      tprRank2NonRunner: existing.tprRank2NonRunner,
      w50Rank1NonRunner: existing.w50Rank1NonRunner,
    };
  }
  return {
    winner: current.winner,
    winnerSp: current.winnerSp,
    winners: current.winners,
    winnerOrRank: current.winnerOrRank,
    tprRank1NonRunner: existing?.tprRank1NonRunner ?? current.tprRank1NonRunner,
    tprRank2NonRunner: existing?.tprRank2NonRunner ?? current.tprRank2NonRunner,
    w50Rank1NonRunner: existing?.w50Rank1NonRunner ?? current.w50Rank1NonRunner,
  };
}

function requiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) throw new Error(`Missing ${name}.`);
  return value;
}
