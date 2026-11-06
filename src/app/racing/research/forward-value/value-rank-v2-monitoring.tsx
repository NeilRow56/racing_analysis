import type { DisplayValueRace } from "@/lib/racing/tissue-value-view";
import { summarizeValueRankV2 } from "@/lib/racing/value-rank-v2";
import type { summarizeValueRunners } from "@/lib/racing/tissue-value-metrics";

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
const num = (n: number | null) => n === null ? "—" : n.toFixed(2);
type Row = { label: string } & ReturnType<typeof summarizeValueRunners>;

export function ValueRankV2Monitoring({ races, summary = summarizeValueRankV2(races) }: { races: DisplayValueRace[]; summary?: ReturnType<typeof summarizeValueRankV2> }) {
  return <section className="mt-5 border border-slate-300 p-3" aria-labelledby="value-rank-v2-heading">
    <h4 id="value-rank-v2-heading" className="text-sm font-semibold">Complete-market cohort · Value 1 V2 / Legacy V1 shadow</h4>
    <p className="mt-1 text-xs text-slate-600">Counts frozen observations in the family Value research JSON, including superseded captures; not Today’s latest-book population. Requires a complete pre-race field, valid family model probabilities and a bookmaker price for every runner (one valid quote suffices per runner). V2 requires a frozen post-epoch policy. Since {summary.epoch}. At captured prices 21.00–&lt;51.00, the original leader needs 5–9 prior career runs. Failed or missing experience means no Value 1; no promotion. From {summary.priceCapEpoch}, a frozen price above 67.00 also means no Value 1 and no promotion; 67.00 is included. Earlier captures retain their original policy.</p>
    <p className="mt-1 text-xs text-slate-500">Retrospective discovery, not independent validation. Only new post-epoch captures enter this comparison; previously frozen races remain V1 history. Exact original rank-1 ties are gated individually.</p>
    <p className="mt-1 text-xs text-slate-500">Policy epochs: {summary.policyEpochs.map(p => `${p.epoch}: ${p.races} captures`).join(" · ")}</p>
    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
      <div><dt>Races evaluated</dt><dd>{summary.racesEvaluated}</dd></div>
      <div><dt>Races with Value 1 V2</dt><dd>{summary.racesWithValue1}</dd></div>
      <div><dt>Races with no Value 1 V2</dt><dd>{summary.racesWithoutValue1}</dd></div>
    </dl>
    <MetricsTable title="Prospective selections (same races and frozen prices)" rows={[
      { label: "ACTIVE VALUE 1 V2", ...summary.active },
      { label: "LEGACY VALUE 1 V1 SHADOW · research only", ...summary.legacyShadow },
      { label: "Rejected V1 selections", ...summary.rejected },
    ]} />
    <MetricsTable title="Rejected legacy selections by reason" rows={summary.rejectionReasons} />
    <MetricsTable title="Target band: 21.00–<51.00" rows={summary.targetBand.map(r => ({ ...r, label: r.group }))} />
    <p className="mt-2 text-xs text-slate-500">Count includes pending/NR/void; performance uses settled £1 selections only. Canonical outcomes and frozen probabilities are shared with the legacy record. With ties, selection counts may exceed race counts. Shadow and active selections overlap and must not be added together.</p>
  </section>;
}

function MetricsTable({ title, rows }: { title: string; rows: Row[] }) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
    <caption className="mb-1 text-left font-medium">{title}</caption>
    <thead><tr>{["Cohort / reason", "Count", "Settled", "Winners", "Strike", "£1 P/L", "ROI", "Actual/Model", "Actual/Market"].map(h => <th key={h} scope="col" className="border-b p-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.label}><th scope="row" className="p-2 font-normal">{r.label}</th>
      <td className="p-2">{r.tracked}</td><td className="p-2">{r.runners}</td><td className="p-2">{r.winners}</td><td className="p-2">{pct(r.strikeRate)}</td>
      <td className="p-2">{num(r.profitLoss)}</td><td className="p-2">{pct(r.roi)}</td><td className="p-2">{num(r.actualModelExpected)}</td><td className="p-2">{num(r.actualMarketExpected)}</td>
    </tr>)}</tbody>
  </table></div>;
}
