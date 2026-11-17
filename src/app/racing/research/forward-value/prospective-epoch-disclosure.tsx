import { collectionEpochReport } from "@/lib/racing/prospective-epoch-report";

// The original monitor is source-pinned. Keep this presentation outside that provenance graph.
export async function ProspectiveEpochDisclosure() {
  const report = await collectionEpochReport().catch(() => null);
  if (!report) return <p className="mt-4 text-sm text-amber-800">Collection epoch report unavailable; collection fails closed on invalid provenance.</p>;
    return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="collection-epochs-heading">
      <details className="group">
      <summary className="cursor-pointer list-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-600 [&::-webkit-details-marker]:hidden">
        <h3 id="collection-epochs-heading" className="text-base font-semibold">
          <span className="flex items-start gap-2">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-5 w-5 shrink-0 transition-transform group-open:rotate-90"><path d="m7 4 6 6-6 6" /></svg>
            <span>Prospective collection epochs
              <span className="mt-1 block text-sm font-normal tabular-nums">{report.sourceStatus} — Positive/Neutral: {report.counts.positiveNeutral} | Hurdle V3 Shadow: {report.counts.shadow} | Market Edge: {report.counts.marketEdge}</span>
            </span>
          </span>
        </h3>
      </summary>
      <p className="mt-1 text-sm">{report.sourceStatus}. Activation: {report.activatedAt ?? "pending verification"}. Historical backfill: none.</p>
      <p className="mt-1 text-xs text-slate-600">Collection semantics: {report.collectionSemantics ?? "not armed"}. Settlement: {report.settlementVersion ?? "not armed"}. Each epoch, family, model, cohort and recorded settlement version is reported separately. Original monitors below retain their original ledgers. Low Form retains its original settlement route; new collection is suspended.</p>
      <ul className="mt-2 text-xs">{Object.entries(report.epochs).map(([key, epoch]) => <li key={key}>{epoch.id}: {report.counts[key as keyof typeof report.counts]} captures — {epoch.ledger}</li>)}</ul>
      <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
        <caption className="text-left">Epoch comparison — retained recorded outcomes; no combined profitability total</caption>
        <thead><tr>{["Epoch", "Programme", "Family", "Model", "Cohort", "Settlement", "Captured", "Settled", "Price N", "£1 P/L", "ROI"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead>
        <tbody>{report.rows.map((r, i) => <tr key={i}>{[r.epoch, r.programme, r.family, r.model, r.cohort, r.settlement, r.captured, r.settled, r.priced, r.profitLoss === null ? "—" : `£${r.profitLoss.toFixed(2)}`, r.roi === null ? "—" : `${(100 * r.roi).toFixed(2)}%`].map((v, j) => <td key={j} className="p-2">{v}</td>)}</tr>)}</tbody>
      </table></div>
      </details>
    </section>;
}
