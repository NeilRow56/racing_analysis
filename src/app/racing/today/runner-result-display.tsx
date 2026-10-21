import type { ReactNode } from "react";
import type { TodayRunner } from "@/lib/racing/todays-racing";
import { isVoidBetResultStatus } from "@/lib/racing/backtest";

type ResultProps = {
  runner: Pick<TodayRunner, "resultStatus" | "finishingPosition">;
  hasConclusiveResult: boolean;
};

function isSettledWinner({ runner, hasConclusiveResult }: ResultProps): boolean {
  // Today settlement uses this stored numeric position, including every dead-heat winner.
  return hasConclusiveResult && !isVoidBetResultStatus(runner.resultStatus) && runner.finishingPosition === 1;
}

export function RunnerResultRow({ children, ...result }: ResultProps & { children: ReactNode }) {
  return (
    <tr className={result.runner.resultStatus === "non_runner"
      ? "bg-slate-100 text-slate-500 line-through"
      : isSettledWinner(result) ? "align-top bg-emerald-50" : "align-top"}>
      {children}
    </tr>
  );
}

export function RunnerWinnerBadge(result: ResultProps) {
  return isSettledWinner(result) ? (
    <span className="border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold leading-none text-emerald-800">
      WINNER
    </span>
  ) : null;
}
