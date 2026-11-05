"use client";

import { useState } from "react";
import type { TissueDailyWatchRow } from "@/lib/racing/tissue-daily-watch-list";
import { TISSUE_SPEED_RANK_WATCH_TOOLTIP } from "@/lib/racing/tissue-speed-rank-watch";
import { TissueValueAgreementBadge } from "./tissue-value-agreement-badge";

type ListProps = {
  date: string;
  rows: Array<TissueDailyWatchRow & { speedWatch?: boolean }>;
  clipboardText: string;
};
export function TissueDailyWatchList(props: ListProps) {
  return <NonRedTissueDailyList {...props} legacy={false} />;
}
export function NonRedTissueDailyList({ date, rows, clipboardText, legacy = true }: ListProps & { legacy?: boolean }) {
  const [copyStatus, setCopyStatus] = useState("");
  const raceCount = new Set(rows.map(row => row.raceId)).size;
  const hasSettledResult = rows.some(row => row.result?.settled);
  const winnerCount = rows.filter(row => row.result?.winner).length;

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
          <p className="mt-1 text-xs text-slate-500">{legacy
            ? "Research watch list · non-red T1 3.00–<6.00 · non-red T2 6.00–<11.00 · T1=V1 at any captured price, including pale-red"
            : "Research watch list · active T1 3.00–<6.00 · active T2 6.00–<11.00 · active T1=V1 at any captured price"}</p>
          <p className="mt-1 text-xs text-slate-500">Agreement sample remains small; this is not a proven betting signal.</p>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} {rows.length === 1 ? "selection" : "selections"} · {raceCount} {raceCount === 1 ? "race" : "races"}
            {hasSettledResult ? ` · ${winnerCount} ${winnerCount === 1 ? "winner" : "winners"}` : null}
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
              {legacy && row.speedWatch ? <span className="ml-1 inline-flex rounded-sm border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] text-slate-900"
                aria-label="Pale-red Speed watch" title={TISSUE_SPEED_RANK_WATCH_TOOLTIP}>Speed watch</span> : null}
              {row.result ? <> — <span aria-label={`Result: ${row.result.label}`}
                className={row.result.winner
                  ? "inline-flex rounded-sm border border-emerald-800 bg-emerald-700 px-1 py-0.5 text-[10px] font-bold text-white"
                  : "inline-flex rounded-sm border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-600"}>
                {row.result.label}
              </span></> : null}
            </p>)}
          </div>
        </details>
      )}
    </section>
  );
}
