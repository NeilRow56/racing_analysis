import type { ForwardRaceRecord } from "../../../../scripts/diagnose-tpr-vs-timewise-forward";
import type { TodayRace } from "@/lib/racing/todays-racing";
import { TIMEWISE_NON_RUNNER_VALUE } from "@/lib/racing/tpr-timewise-forward-context";
import { saveTimewiseComparisonAction } from "./actions";

export function TimewiseComparison({
  existing,
  race,
  raceDate,
}: {
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

  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        {existing
          ? `Timewise: 1 ${slotLabel(existing.timewiseRank1, existing.timewiseRank1NonRunner)} · 2 ${slotLabel(existing.timewiseRank2, existing.timewiseRank2NonRunner)}`
          : "Timewise: not entered"}
      </summary>
      <form action={saveTimewiseComparisonAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input name="raceDate" type="hidden" value={raceDate} />
        <input name="raceId" type="hidden" value={race.raceId} />
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Timewise rank 1
          <select
            className="min-w-48 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            defaultValue={selectedRunnerId(existing?.timewiseRank1, existing?.timewiseRank1NonRunner) ?? ""}
            name="timewiseRank1RunnerId"
            required
          >
            <option disabled value="">Select runner</option>
            <option value={TIMEWISE_NON_RUNNER_VALUE}>Non-runner</option>
            {runners.map((runner) => <option key={runner.runnerId} value={runner.runnerId}>{runner.horseName}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          Timewise rank 2
          <select
            className="min-w-48 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
            defaultValue={selectedRunnerId(existing?.timewiseRank2, existing?.timewiseRank2NonRunner) ?? ""}
            name="timewiseRank2RunnerId"
            required
          >
            <option disabled value="">Select runner</option>
            <option value={TIMEWISE_NON_RUNNER_VALUE}>Non-runner</option>
            {runners.map((runner) => <option key={runner.runnerId} value={runner.runnerId}>{runner.horseName}</option>)}
          </select>
        </label>
        <button className="border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800" type="submit">
          Save Timewise
        </button>
      </form>
    </details>
  );
}
