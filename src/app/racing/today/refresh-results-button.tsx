"use client";

import { useFormStatus } from "react-dom";

export function RefreshResultsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      disabled={isRefreshResultsSubmitDisabled(pending)}
      type="submit"
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700"
        />
      ) : null}
      {refreshResultsSubmitButtonLabel(pending)}
    </button>
  );
}

export function refreshResultsSubmitButtonLabel(pending: boolean): string {
  return pending ? "Refreshing..." : "Refresh results";
}

export function isRefreshResultsSubmitDisabled(pending: boolean): boolean {
  return pending;
}
