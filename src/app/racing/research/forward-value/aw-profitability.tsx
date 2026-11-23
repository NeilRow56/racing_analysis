import type { ReactNode } from "react";
import { matchedAwDecisions, summarizeAwDecisions, type buildAwProfitabilityReport } from "@/lib/racing/aw-profitability-report";

type Report = ReturnType<typeof buildAwProfitabilityReport>;
type Policy = Report["policies"][number];
type Pick = NonNullable<Report["races"][number]["original"][number]>;

export const profitMoney = (amount: number | null) =>
  amount === null ? "—" : `${amount < 0 ? "−" : amount > 0 ? "+" : ""}£${Math.abs(amount).toFixed(2)}`;
export const profitPercent = (ratio: number | null) => ratio === null ? "—" : `${(100 * ratio).toFixed(1)}%`;
const offTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
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

function outcomeStatus(pick: Pick) {
  return pick.final?.status === "settled" ? "SETTLED" : pick.final?.status === "NR" ? "NON-RUNNER"
    : pick.final?.status === "void" ? "VOID" : pick.result ? "RESULT RECORDED" : "PENDING";
}

function SelectionEvidence({ pick }: { pick: Pick }) {
  const settled = pick.final?.status === "settled" ? pick.final : null;
  const result = pick.result ?? (settled ? settled.won ? "Won" : "Lost" : null);
  return <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
    <Chip>{outcomeStatus(pick)}</Chip>
    <span>Captured market rank {pick.marketRank ?? "unverified"}</span>
    <span>Bookmaker median {pick.price?.toFixed(2) ?? "unavailable"}</span>
    {result && <span>{result}</span>}
    {settled ? <span>Final SP {settled.startingPrice ?? settled.decimalSP.toFixed(2)} · {profitMoney(settled.profitLoss)}</span>
      : pick.result && !pick.final && <span>Verified final SP unavailable</span>}
  </div>;
}

const raceCard = "rounded-md border border-slate-200 bg-white";
const cell = "px-2 py-2";
const dailyColumns = ["Eligible", "Recorded", "Bets", "No bet", "Settled", "Wins", "P/L", "ROI"];

export function AwDailyProfitability({ report }: { report: Report }) {
  const shownPolicies = report.policies.filter(policy => policy.armedAt || policy.unavailable);
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
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-medium text-emerald-800">Cumulative results since activation · verified final SP</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {shownPolicies.map(policy => {
          const s = summarizeAwDecisions(policy.decisions.map(d => d.pick));
          return <li key={policy.id} className={`${raceCard} p-2 tabular-nums`}>
            <strong>{policy.name}</strong>
            <p className="mt-1">{s.recorded ? `${s.settled} settled stakes · ${profitMoney(s.profit)} · ${profitPercent(s.roi)} ROI` : "NO DATA"}</p>
          </li>;
        })}
      </ul>
    </details>
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Frozen race decisions</h3>
      {report.races.length ? <div className="mt-2 grid gap-2">
        {report.races.map(race => <details key={race.raceId} className={raceCard}>
          <summary className="cursor-pointer px-3 py-2 text-sm">
            <span className="inline font-semibold">{offTime.format(new Date(race.scheduledOff))} {race.course}</span>
            {" "}<Chip>{race.decisions.some(d => d.decision) ? "CAPTURED" : "NO CAPTURE"}</Chip>
            {race.decisions.some(d => d.decision?.pick) && <>
              {" "}<Chip>{race.decisions.some(d => d.decision?.pick && !d.decision.pick.final) ? "PENDING" : "RESOLVED"}</Chip>
            </>}
            <span className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 pl-4 text-xs sm:flex sm:flex-wrap">
              {race.original.map((pick, i) => <span key={i}><strong>T{i + 1}</strong> {pick?.horse ?? "NO CAPTURE"}</span>)}
              {race.decisions.filter(d => shownPolicies.includes(d.policy)).map(({ policy, decision }) =>
                <span key={policy.id}><strong>{policy.name.replace(/^AW /, "")}</strong> {decision ? decision.pick?.horse ?? "NO BET" : "NO CAPTURE"}</span>)}
            </span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 px-3 text-sm">
            {race.original.map((pick, i) => <li key={i} className="py-2">
              <strong>Original Tissue T{i + 1}</strong> · {pick?.horse ?? "NO CAPTURE"}
              {pick && <SelectionEvidence pick={pick} />}
            </li>)}
            {race.decisions.filter(d => shownPolicies.includes(d.policy)).map(({ policy, decision }) =>
              <li key={policy.id} className="py-2">
                <strong>{policy.name}</strong> · {decision ? decision.pick?.horse ?? "NO BET" : "NO CAPTURE"}
                {decision ? <>
                  <p className="mt-1 text-xs text-slate-600">{decision.reason}</p>
                  {decision.pick ? <SelectionEvidence pick={decision.pick} /> : <div className="mt-1 text-xs text-slate-600">
                    Reference {decision.reference.horse} · Market rank {decision.reference.marketRank ?? "unverified"} · Bookmaker median {decision.reference.price?.toFixed(2) ?? "unavailable"}
                  </div>}
                  <p className="mt-1 text-xs text-slate-500">Book <CaptureTime value={decision.capturedAt} exact /> · Decision <CaptureTime value={decision.decidedAt} exact /></p>
                </> : <p className="mt-1 text-xs text-slate-600">{policy.noCapture}</p>}
              </li>)}
          </ul>
        </details>)}
      </div> : <p className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600"><strong>NO CAPTURE</strong> · No frozen AW race rows for this date. Check the policy statuses above.</p>}
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
