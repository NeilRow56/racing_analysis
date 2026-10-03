import { awTissueValueAgreement, cleanAwTissueRace, type AwTissueForwardData } from "@/lib/racing/aw-tissue-forward";
import type { ForwardValueRecord, ForwardValuePriceSnapshot } from "@/lib/racing/forward-value";
import { cleanJumpTissueRace, jumpTissueValueAgreement, type JumpTissueForwardData } from "@/lib/racing/jump-tissue-forward";
import { formatRaceTimeForDisplay } from "@/lib/racing/todays-racing";
import type React from "react";

export function AwTissueValueSection({ data, ratings }: { data: AwTissueForwardData; ratings: ForwardValueRecord[] }) {
  const agreement = awTissueValueAgreement(data, ratings);
  const races = data.races.filter(cleanAwTissueRace).sort(newestFirst).slice(0, 100);
  return <DiagnosticDetails
    headingId="aw-tissue-value-heading"
    title="AW Tissue (diagnostic)"
    summaryItems={[
      ["Comparable AW-D races", agreement.comparable], ["Same leader", agreement.sameLeader], ["Different leader", agreement.differentLeader],
      ["Both positive", agreement.bothPositive], ["AW-D positive only", agreement.awDPositiveOnly],
      ["AW Tissue positive only", agreement.tissuePositiveOnly], ["Neither positive", agreement.neitherPositive],
    ]}
  >
    <TissueTable
      emptyText="No prospective AW Tissue observations."
      probabilityHeading="AW Tissue probability"
      rows={races.map((race) => {
        const leader = race.runners.find((runner) => runner.runnerId === race.top1);
        return {
          key: race.raceId,
          raceDate: race.raceDate,
          currentOffAt: race.currentOffAt,
          scheduledTime: race.scheduledTime,
          course: race.course,
          horseName: leader?.horseName ?? "-",
          probability: leader?.probability ?? null,
          prices: race.prices,
          finalSp: leader?.outcome?.finalSp ?? null,
          profit: race.prices.t60 ? race.selectedPriceProfitLoss.t60 : race.prices.t180 ? race.selectedPriceProfitLoss.t180 : race.selectedPriceProfitLoss.early,
          status: statusLabel(race.settledAt, leader?.outcome?.won ?? null),
        };
      })}
    />
  </DiagnosticDetails>;
}

export function JumpTissueValueSection({ data, ratings }: { data: JumpTissueForwardData; ratings: ForwardValueRecord[] }) {
  const agreement = jumpTissueValueAgreement(data, ratings);
  const races = data.races.filter(cleanJumpTissueRace).sort(newestFirst).slice(0, 100);
  return <DiagnosticDetails
    headingId="jump-tissue-value-heading"
    title="Jump Tissue (diagnostic)"
    summaryItems={[
      ["Comparable JPR-A races", agreement.comparable], ["Same leader", agreement.sameLeader], ["Different leader", agreement.differentLeader],
      ["Both positive", agreement.bothPositive], ["JPR-A positive only", agreement.jprAPositiveOnly],
      ["Jump Tissue positive only", agreement.tissuePositiveOnly], ["Neither positive", agreement.neitherPositive],
    ]}
  >
    <TissueTable
      emptyText="No prospective Jump Tissue observations yet."
      probabilityHeading="Jump Tissue probability"
      rows={races.map((race) => {
        const leader = race.runners.find((runner) => runner.runnerId === race.top1);
        return {
          key: race.raceId,
          raceDate: race.raceDate,
          currentOffAt: race.currentOffAt,
          scheduledTime: race.scheduledTime,
          course: race.course,
          horseName: leader?.horseName ?? "-",
          probability: leader?.probability ?? null,
          prices: race.prices,
          finalSp: leader?.outcome?.finalSp ?? null,
          profit: race.prices.t60 ? race.selectedPriceProfitLoss.t60 : race.prices.t180 ? race.selectedPriceProfitLoss.t180 : race.selectedPriceProfitLoss.early,
          status: statusLabel(race.settledAt, leader?.outcome?.won ?? null),
        };
      })}
    />
  </DiagnosticDetails>;
}

function DiagnosticDetails({ children, headingId, summaryItems, title }: {
  children: React.ReactNode;
  headingId: string;
  summaryItems: Array<[string, number]>;
  title: string;
}) {
  return <section className="mt-8" aria-labelledby={headingId}>
    <details className="border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-lg font-semibold text-slate-950" id={headingId}>{title}</summary>
      <div className="border-t border-slate-200 px-4 py-4">
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {summaryItems.map(([label, count]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{count}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs text-slate-600">Newest first. Showing up to 100 observations.</p>
        {children}
      </div>
    </details>
  </section>;
}

type TissueTableRow = {
  key: string;
  raceDate: string;
  currentOffAt: string;
  scheduledTime: string;
  course: string;
  horseName: string;
  probability: number | null;
  prices: { early: ForwardValuePriceSnapshot | null; t180: ForwardValuePriceSnapshot | null; t60: ForwardValuePriceSnapshot | null };
  finalSp: number | null;
  profit: number | null;
  status: string;
};

function TissueTable({ emptyText, probabilityHeading, rows }: { emptyText: string; probabilityHeading: string; rows: TissueTableRow[] }) {
  return <div className="mt-3 overflow-x-auto border border-slate-200 bg-white">
    <table className="w-full min-w-[1260px] text-left text-xs">
      <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr>
        {["Date / time", "Course / horse", probabilityHeading, "Median bookmaker", "Implied", "Edge", "Best", "Forecast", "Quotes", "Early", "T-180", "T-60", "Final SP", "Median P/L", "Settlement/status"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-200">
        {!rows.length ? <tr><td colSpan={15} className="px-2 py-5 text-slate-500">{emptyText}</td></tr> : rows.map((row) => {
          const price = row.prices.t60 ?? row.prices.t180 ?? row.prices.early;
          return <tr key={row.key}>
            <td className="whitespace-nowrap px-2 py-2">{row.raceDate}<br />{formatRaceTimeForDisplay({ raceDateTime: new Date(row.currentOffAt), scheduledTime: row.scheduledTime })}</td>
            <td className="px-2 py-2"><span className="font-medium">{row.course}</span><br />{row.horseName}</td>
            <td className="px-2 py-2 tabular-nums">{pct(row.probability)}</td>
            <td className="px-2 py-2 tabular-nums">{decimal(price?.decimalPrice)}</td>
            <td className="px-2 py-2 tabular-nums">{pct(price?.impliedProbability)}</td>
            <td className="px-2 py-2 tabular-nums">{price ? `${price.ratingEdgePercentagePoints.toFixed(2)}pp` : "-"}</td>
            <td className="px-2 py-2 tabular-nums" title={price?.bestBookmakerName ?? undefined}>{decimal(price?.bestBookmakerPriceDecimal)}</td>
            <td className="px-2 py-2">{price?.forecastPrice ?? "-"}</td>
            <td className="px-2 py-2 tabular-nums">{price?.bookmakerQuoteCount ?? 0}</td>
            <TissueSnapshot snapshot={row.prices.early} /><TissueSnapshot snapshot={row.prices.t180} /><TissueSnapshot snapshot={row.prices.t60} />
            <td className="px-2 py-2 tabular-nums">{decimal(row.finalSp)}</td>
            <td className="px-2 py-2 tabular-nums">{decimal(row.profit)}</td>
            <td className="px-2 py-2 font-medium">{row.status}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function TissueSnapshot({ snapshot }: { snapshot: ForwardValuePriceSnapshot | null }) {
  return <td className="px-2 py-2 tabular-nums">{snapshot ? <details>
    <summary className="cursor-pointer">{snapshot.decimalPrice.toFixed(2)}</summary>
    <div className="mt-1 whitespace-nowrap text-[11px] text-slate-600">
      <p>{snapshot.capturedAt}</p>
      <p>Edge {snapshot.ratingEdgePercentagePoints.toFixed(2)}pp</p>
      {(snapshot.bookmakerQuotes ?? []).map((quote, index) => <p key={`${quote.bookmakerId}:${index}`}>{quote.bookmakerName ?? "Bookmaker"}: {quote.decimalOdds.toFixed(2)}</p>)}
    </div>
  </details> : "-"}</td>;
}

function newestFirst(left: { recordedAt: string }, right: { recordedAt: string }) {
  return right.recordedAt.localeCompare(left.recordedAt);
}

function statusLabel(settledAt: string | null, won: boolean | null) {
  if (settledAt === null) return "Pending";
  return won === null ? "Settled" : won ? "Won" : "Lost";
}

function decimal(value: number | null | undefined) { return value == null ? "-" : value.toFixed(2); }
function pct(value: number | null | undefined) { return value == null ? "-" : `${(value * 100).toFixed(1)}%`; }
