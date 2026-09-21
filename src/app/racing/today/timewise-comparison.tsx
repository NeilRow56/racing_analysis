import type { ForwardRaceRecord } from "../../../../scripts/diagnose-tpr-vs-timewise-forward";
import type { TodayRace } from "@/lib/racing/todays-racing";
import { TIMEWISE_NON_RUNNER_VALUE } from "@/lib/racing/tpr-timewise-forward-context";
import { buildTimewiseSaveContext } from "@/lib/racing/timewise-save";
import { saveTimewiseComparisonAction } from "./actions";
import { TimewiseComparisonForm } from "./timewise-comparison-form";

export function TimewiseComparison({
  courseName,
  existing,
  race,
  raceDate,
}: {
  courseName: string;
  existing: ForwardRaceRecord | null;
  race: TodayRace;
  raceDate: string;
}) {
  const runners = race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  const selectedRunnerId = (horseName: string | null | undefined, nonRunner: boolean | undefined) =>
    nonRunner ? TIMEWISE_NON_RUNNER_VALUE :
    runners.find((runner) => runner.horseName === horseName)?.runnerId;
  const slotLabel = (horseName: string | null, nonRunner: boolean | undefined) =>
    nonRunner ? "Non-runner" : horseName ?? "unavailable";
  const context = buildTimewiseSaveContext({
    course: courseName,
    race,
    raceDate,
  });
  async function saveAction(formData: FormData) {
    "use server";
    return saveTimewiseComparisonAction(context, formData);
  }

  return (
    <TimewiseComparisonForm
      action={saveAction}
      initialSummary={existing
        ? `Timewise: 1 ${slotLabel(existing.timewiseRank1, existing.timewiseRank1NonRunner)} · 2 ${slotLabel(existing.timewiseRank2, existing.timewiseRank2NonRunner)}`
        : "Timewise: not entered"}
      raceDate={raceDate}
      raceId={race.raceId}
      rank1Default={selectedRunnerId(existing?.timewiseRank1, existing?.timewiseRank1NonRunner) ?? ""}
      rank2Default={selectedRunnerId(existing?.timewiseRank2, existing?.timewiseRank2NonRunner) ?? ""}
      runners={runners.map((runner) => ({ runnerId: runner.runnerId, horseName: runner.horseName }))}
    />
  );
}
