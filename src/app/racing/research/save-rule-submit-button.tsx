"use client";

import { useFormStatus } from "react-dom";

export function SaveRuleSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex items-center justify-center gap-2 bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-400"
      disabled={isSaveRuleSubmitDisabled(pending)}
      type="submit"
    >
      {pending ? (
        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : null}
      {saveRuleSubmitButtonLabel(pending)}
    </button>
  );
}

export function saveRuleSubmitButtonLabel(pending: boolean): string {
  return pending ? "Saving..." : "Save & freeze rule";
}

export function isSaveRuleSubmitDisabled(pending: boolean): boolean {
  return pending;
}
