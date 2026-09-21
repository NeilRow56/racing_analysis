"use client";

import { useState, useTransition } from "react";

const TIMEWISE_NON_RUNNER_VALUE = "__timewise_non_runner__";

type TimewiseSaveResult = {
  status: "saved";
  raceId: string;
  timewiseRank1: string | null;
  timewiseRank2: string | null;
  timewiseRank1NonRunner: boolean;
  timewiseRank2NonRunner: boolean;
  serverDurationMs: number;
};

export function TimewiseComparisonForm({
  action,
  initialSummary,
  raceDate,
  raceId,
  rank1Default,
  rank2Default,
  runners,
}: {
  action: (formData: FormData) => Promise<TimewiseSaveResult>;
  initialSummary: string;
  raceDate: string;
  raceId: string;
  rank1Default: string;
  rank2Default: string;
  runners: Array<{ runnerId: string; horseName: string }>;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectionLabel = (horseName: string | null, nonRunner: boolean) =>
    nonRunner ? "Non-runner" : horseName ?? "unavailable";

  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        {summary}
      </summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          const formData = new FormData(event.currentTarget);
          const roundTripStartedAt = performance.now();
          startTransition(async () => {
            try {
              const result = await action(formData);
              setSummary(
                `Timewise: 1 ${selectionLabel(result.timewiseRank1, result.timewiseRank1NonRunner)} · 2 ${selectionLabel(result.timewiseRank2, result.timewiseRank2NonRunner)}`,
              );
              setMessage("Saved");
              console.info("TIMEWISE_SAVE_CLIENT_TIMING", {
                raceDate,
                raceId,
                serverDurationMs: Math.round(result.serverDurationMs * 10) / 10,
                actionRoundTripMs: Math.round((performance.now() - roundTripStartedAt) * 10) / 10,
                fullPageRefresh: false,
              });
            } catch {
              setMessage("Save failed");
            }
          });
        }}
      >
        <input name="raceDate" type="hidden" value={raceDate} />
        <input name="raceId" type="hidden" value={raceId} />
        <TimewiseSelect defaultValue={rank1Default} label="Timewise rank 1" name="timewiseRank1RunnerId" runners={runners} />
        <TimewiseSelect defaultValue={rank2Default} label="Timewise rank 2" name="timewiseRank2RunnerId" runners={runners} />
        <button
          className="border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-wait disabled:border-slate-400 disabled:bg-slate-400"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save Timewise"}
        </button>
        <span aria-live="polite" className="pb-1.5 text-xs font-medium text-slate-600">
          {message}
        </span>
      </form>
    </details>
  );
}

function TimewiseSelect({
  defaultValue,
  label,
  name,
  runners,
}: {
  defaultValue: string;
  label: string;
  name: string;
  runners: Array<{ runnerId: string; horseName: string }>;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-slate-600">
      {label}
      <select
        className="min-w-48 border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        defaultValue={defaultValue}
        name={name}
        required
      >
        <option disabled value="">Select runner</option>
        <option value={TIMEWISE_NON_RUNNER_VALUE}>Non-runner</option>
        {runners.map((runner) => (
          <option key={runner.runnerId} value={runner.runnerId}>{runner.horseName}</option>
        ))}
      </select>
    </label>
  );
}
