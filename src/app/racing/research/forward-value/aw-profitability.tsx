import type { ReactNode } from "react";
import { matchedAwDecisions, summarizeAwDecisions, type buildAwProfitabilityReport } from "@/lib/racing/aw-profitability-report";

type Report = ReturnType<typeof buildAwProfitabilityReport>;
type Policy = Report["policies"][number];

export const profitMoney = (amount: number | null) =>
  amount === null ? "—" : `${amount < 0 ? "−" : amount > 0 ? "+" : ""}£${Math.abs(amount).toFixed(2)}`;
export const profitPercent = (ratio: number | null) => ratio === null ? "—" : `${(100 * ratio).toFixed(1)}%`;
const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "medium" });

export function CaptureTime({ value, exact }: { value: string | null; exact?: boolean }) {
  if (!value) return <>—</>;
  const instant = new Date(value);
  return <time dateTime={value} title={value}>{localTime.format(instant)}{exact && `.${String(instant.getUTCMilliseconds()).padStart(3, "0")}`}</time>;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{children}</span>;
}

function policyStatus(policy: Policy) {
  return policy.unavailable ? "UNAVAILABLE" : policy.armedAt ? "ARMED" : "UNARMED";
}

const raceCard = "rounded-md border border-slate-200 bg-white";
const cell = "px-2 py-2";
const dailyColumns = ["Eligible", "Recorded", "Bets", "No bet", "Settled", "Wins", "P/L", "ROI"];

export function AwDailyProfitability({ report }: { report: Report }) {
  return <>
    <div className="mt-3 rounded-lg border border-slate-200 bg-white">
      <table className="block w-full text-left text-xs tabular-nums sm:table">
        <caption className="block px-3 pt-3 text-left font-semibold text-slate-700 sm:table-caption">Daily AW policy results · £1 at verified final SP</caption>
        <thead className="sr-only border-b border-slate-200 text-slate-600 sm:not-sr-only"><tr>
          {["Policy", ...dailyColumns].map(h => <th key={h} scope="col" className={cell} title={h === "Eligible"
            ? "Post-activation pre-off source books, within the collection window when recorded." : undefined}>{h}</th>)}
        </tr></thead>
        <tbody className="block divide-y divide-slate-100 sm:table-row-group">
          {report.policies.map(policy => {
            const s = summarizeAwDecisions(policy.day.map(d => d.pick));
            const counts = policy.armedAt ? [policy.eligible ?? "—", s.recorded, s.bets, s.abstentions, s.settled, s.winners]
              : Array<string>(6).fill("—");
            return <tr key={policy.id} className="grid grid-cols-4 px-2 pb-2 sm:table-row sm:p-0">
              <th scope="row" className={`${cell} col-span-4 font-medium`}>
                {policy.name} <Chip>{policyStatus(policy)}</Chip>
                {!s.recorded && <span className="mt-1 block font-normal text-slate-600">NO DATA · {policy.noCapture}</span>}
                {s.recorded > 0 && policy.eligible !== null && s.recorded < policy.eligible && <span className="mt-1 block font-normal text-slate-600">
                  {policy.eligible - s.recorded} without a frozen decision · {policy.noCapture}
                </span>}
              </th>
              {[...counts, profitMoney(s.profit), profitPercent(s.roi)].map((value, i) =>
                <td key={dailyColumns[i]} className="whitespace-nowrap px-2 py-1 sm:py-2">
                  <span aria-hidden="true" className="block text-[11px] text-slate-500 sm:hidden">{dailyColumns[i]}</span>{value}
                </td>)}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </>;
}

export function AwCumulativeProfitability({ policies }: { policies: Policy[] }) {
  return <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
    {policies.filter(policy => policy.armedAt || policy.unavailable).map(policy => {
      const s = summarizeAwDecisions(policy.decisions.map(d => d.pick));
      const paired = matchedAwDecisions(policy);
      return <article key={policy.id} className={`${raceCard} p-3 text-sm`}>
        <h3 className="font-semibold">{policy.name} <Chip>{policyStatus(policy)}</Chip></h3>
        <p className="mt-1 text-xs text-slate-600">Activated <CaptureTime value={policy.armedAt} exact /><br />Latest frozen decision <CaptureTime value={policy.latest} exact /></p>
        <p className="mt-2 tabular-nums">{s.recorded ? `${s.recorded} races · ${s.bets} bets · ${s.abstentions} no bet` : "NO DATA"}</p>
        {s.recorded > 0 && <p className="mt-1 text-xs tabular-nums text-slate-600">
          {s.pending} pending · {s.settled} settled · {s.winners} winners · {s.voids} NR / void
        </p>}
        <p className="mt-2 font-semibold tabular-nums">{profitMoney(s.profit)} <span className="text-xs font-normal text-slate-600">final-SP P/L · {profitPercent(s.roi)} ROI</span></p>
        <details className="mt-2 border-t border-slate-100 pt-2 text-xs">
          <summary className="cursor-pointer font-medium text-emerald-800">Matched original Tissue · {paired.races} resolved races</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([["Policy", paired.policy], [policy.id.endsWith("-2") ? "Original T2" : "Original T1", paired.reference]] as const).map(([name, stats]) =>
              <div key={name}><strong>{name}</strong><br />{stats.settled} stakes · {stats.winners} wins<br />{profitMoney(stats.profit)} · {profitPercent(stats.roi)}</div>)}
          </div>
        </details>
      </article>;
    })}
  </div>;
}
