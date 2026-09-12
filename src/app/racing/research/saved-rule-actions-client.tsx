"use client";

import {
  deleteSavedResearchRuleAction,
  freezeSavedResearchRuleAction,
} from "./actions";

export function SavedRuleActionForms({
  id,
  status,
}: {
  id: string;
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
