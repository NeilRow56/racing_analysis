import {
  TRAINER_COHORT_MIN_SETTLED_RUNNERS,
  trainerCohortLabel,
  type ResolvedTrainerCohort,
} from "@/lib/racing/trainer-cohort-mode";

export type TrainerCohortDiagnostics = {
  currentYearMatchedTrainerCount: number;
  currentYearRunnerCount: number;
};

export function TrainerCohortPanel({
  diagnostics,
  trainerCohort,
}: {
  diagnostics: TrainerCohortDiagnostics | null;
  trainerCohort: ResolvedTrainerCohort | null;
}) {
  if (!trainerCohort) {
    return null;
  }
  const qualifiedTrainerCount = trainerCohort.qualifiedTrainerCount ?? trainerCohort.members.length;
  return (
    <details className="border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-lg font-semibold">
        View {trainerCohortLabel({
          top: trainerCohort.definition.top,
          referenceYear: trainerCohort.referenceYear,
          family: trainerCohort.family,
        })} trainers
      </summary>
      <p className="mt-2 text-sm text-slate-600">
        Ranked by prior-year wins with at least {TRAINER_COHORT_MIN_SETTLED_RUNNERS} settled runners.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="border border-slate-100 p-2">
          <dt className="text-slate-500">Qualifying prior-year trainers</dt>
          <dd className="font-semibold">{qualifiedTrainerCount}</dd>
        </div>
        <div className="border border-slate-100 p-2">
          <dt className="text-slate-500">Resolved cohort trainers</dt>
          <dd className="font-semibold">{trainerCohort.members.length}</dd>
        </div>
        <div className="border border-slate-100 p-2">
          <dt className="text-slate-500">2025 cache runners matched</dt>
          <dd className="font-semibold">{diagnostics?.currentYearRunnerCount ?? 0}</dd>
        </div>
      </dl>
      {trainerCohort.members.length === 0 ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No eligible prior-year trainer cohort could be resolved for this family.
        </p>
      ) : diagnostics?.currentYearRunnerCount === 0 ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The prior-year cohort resolved, but none of its stable trainer IDs matched runners in the 2025 cache for this family.
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Rank</th>
              <th className="py-2 pr-3 font-medium">Trainer</th>
              <th className="py-2 pr-3 font-medium">Runs</th>
              <th className="py-2 pr-3 font-medium">Wins</th>
              <th className="py-2 pr-3 font-medium">Win rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trainerCohort.members.map((member) => (
              <tr key={member.trainerId}>
                <td className="py-2 pr-3">{member.rank}</td>
                <td className="py-2 pr-3">{member.trainerName}</td>
                <td className="py-2 pr-3">{member.priorYearRuns}</td>
                <td className="py-2 pr-3">{member.priorYearWins}</td>
                <td className="py-2 pr-3">{formatPct(member.priorYearWinRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function formatPct(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}
