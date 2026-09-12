"use client";

import { useFormStatus } from "react-dom";
import {
  deleteSavedResearchRuleAction,
  freezeSavedResearchRuleAction,
  validateSavedResearchRuleHoldoutAction,
} from "./actions";

export function SavedRuleActionForms({
  id,
  canValidateHoldout = false,
  status,
}: {
  id: string;
  canValidateHoldout?: boolean;
  status: "draft" | "frozen";
}) {
  return (
    <div className="flex flex-col gap-2">
      {status === "draft" ? (
        <form
          action={freezeSavedResearchRuleAction}
          onSubmit={(event) => {
            if (!window.confirm(
              "Freezing preserves this exact research rule for future holdout validation. The strategy definition cannot be changed afterwards.",
            )) {
              event.preventDefault();
            }
          }}
        >
          <input name="id" type="hidden" value={id} />
          <button
            className="border border-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
            type="submit"
          >
            Freeze
          </button>
        </form>
      ) : null}
      {canValidateHoldout ? (
        <form
          action={validateSavedResearchRuleHoldoutAction}
          onSubmit={(event) => {
            if (!window.confirm(
              "Run this frozen rule once against the 2026 holdout cache? This records the official holdout result and cannot be rerun from the normal Research UI.",
            )) {
              event.preventDefault();
            }
          }}
        >
          <input name="id" type="hidden" value={id} />
          <ValidateHoldoutButton />
        </form>
      ) : null}
      <form
        action={deleteSavedResearchRuleAction}
        onSubmit={(event) => {
          if (status === "frozen" && !window.confirm("Delete this frozen research rule?")) {
            event.preventDefault();
          }
        }}
      >
        <input name="id" type="hidden" value={id} />
        {status === "frozen" ? <input name="confirmFrozenDelete" type="hidden" value="yes" /> : null}
        <button
          className="border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          type="submit"
        >
          Delete
        </button>
      </form>
    </div>
  );
}

function ValidateHoldoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="border border-blue-700 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isValidateHoldoutSubmitDisabled(pending)}
      type="submit"
    >
      {validateHoldoutSubmitButtonLabel(pending)}
    </button>
  );
}

export function validateHoldoutSubmitButtonLabel(pending: boolean): string {
  return pending ? "Validating..." : "Validate on 2026 holdout";
}

export function isValidateHoldoutSubmitDisabled(pending: boolean): boolean {
  return pending;
}
