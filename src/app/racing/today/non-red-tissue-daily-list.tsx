"use client";

import { useState } from "react";
import type { NonRedTissueDailyRow } from "@/lib/racing/non-red-tissue-daily-list";
import { TISSUE_SPEED_RANK_WATCH_TOOLTIP } from "@/lib/racing/tissue-speed-rank-watch";
import { TissueValueAgreementBadge } from "./tissue-value-agreement-badge";

export function NonRedTissueDailyList({ date, rows, clipboardText }: {
  date: string;
  rows: NonRedTissueDailyRow[];
  clipboardText: string;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const raceCount = new Set(rows.map(row => row.raceId)).size;

  async function copyList() {
    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopyStatus("Copied daily list.");
    } catch {
      setCopyStatus("Copy failed. Select and copy the list below.");
    }
  }

  return (
    <section aria-label="Tissue Watch List" className="mt-4 border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tissue Watch List — {date}</h2>
          <p className="mt-1 text-xs text-slate-500">Research watch list · non-red T1 3.00–&lt;6.00 · non-red T2 6.00–&lt;11.00 · T1=V1 at any captured price, including pale-red</p>
          <p className="mt-1 text-xs text-slate-500">Agreement sample remains small; this is not a proven betting signal.</p>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} {rows.length === 1 ? "selection" : "selections"} · {raceCount} {raceCount === 1 ? "race" : "races"}
          </p>
        </div>
        <button type="button" onClick={copyList} disabled={rows.length === 0}
          className="border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
          Copy daily list
        </button>
      </div>
      <p role="status" className="text-xs text-slate-600">{copyStatus}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-slate-600">No Tissue Watch List selections for today.</p>
      ) : (
        <details className="mt-3" open={copyStatus.startsWith("Copy failed")}>
          <summary className="cursor-pointer text-slate-600">Show daily list</summary>
          <div className="mt-2 select-text space-y-1">
            {rows.map(row => <p key={`${row.raceId}|${row.runnerId}`}>
              {row.course} {row.time} {row.horseName} — T{row.tissueRank}
              {row.agreement ? <> — <TissueValueAgreementBadge /></> : null}
              {row.speedWatch ? <span className="ml-1 inline-flex rounded-sm border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-slate-900"
                aria-label="Pale-red Speed watch" title={TISSUE_SPEED_RANK_WATCH_TOOLTIP}>Speed watch</span> : null}
            </p>)}
          </div>
        </details>
      )}
    </section>
  );
}
