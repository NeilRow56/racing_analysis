import type { ChaseShadowMetrics, ChaseShadowSummary } from "@/lib/racing/chase-shadow-summary";
const num = (n: number | null, digits = 3) => n === null ? "—" : n.toFixed(digits);
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
function MetricsTable({ rows }: { rows: { label: string; metrics: ChaseShadowMetrics }[] }) {
  return <div className="overflow-x-auto"><table className="mt-3 w-full text-left text-xs tabular-nums">
    <thead><tr>{["Model / selection", "Captured", "Settled", "Winners", "Strike", "Expected", "A/M", "Runner log loss", "Calibration", "Price n", "P/L (£1)", "ROI"].map(h => <th className="border-b p-2" key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(({ label, metrics: m }) => <tr key={label}><th className="p-2 font-medium">{label}</th>
      <td>{m.captured}</td><td>{m.settled}</td><td>{m.winners}</td><td>{pct(m.strike)}</td><td>{num(m.expected)}</td><td>{num(m.actualModel)}</td><td>{num(m.logLoss, 4)}</td><td>{pct(m.calibrationError)}</td><td>{m.priceN}</td><td>{num(m.profit, 2)}</td><td>{pct(m.roi)}</td>
    </tr>)}</tbody>
  </table></div>;
}
function Groups({ title, rows }: { title: string; rows: { label: string; current: ChaseShadowMetrics; shadow: ChaseShadowMetrics }[] }) {
  return <div className="mt-4"><h3 className="text-sm font-semibold">{title}</h3><MetricsTable rows={rows.flatMap(r => [
    { label: `${r.label} · CURRENT`, metrics: r.current }, { label: `${r.label} · SHADOW`, metrics: r.shadow },
  ])} /></div>;
}
export function ChaseShadowPanel({ summary: s }: { summary: ChaseShadowSummary }) {
  return <section aria-label="Prospective Chase Shadow" className="mt-5 border border-amber-300 bg-white p-4">
    <h2 className="font-semibold">Prospective Chase · CURRENT vs SHADOW</h2>
    <p className="mt-1 text-sm font-bold text-amber-800">SHADOW ONLY · NOT USED FOR TODAY RANKINGS</p>
    <p className="mt-2 text-xs text-slate-600">{s.epoch.name} · declared {s.epoch.declaredAt}. Historical 2026 holdout is diagnostic only. No backfill or automatic promotion.</p>
    <p className="mt-1 break-all text-xs text-slate-500">Model hash: {s.epoch.modelHash} · {s.epoch.featureSchema} · {s.epoch.settlementVersion}</p>
    <p className="mt-2 text-xs">Captured races {s.capturedRaces} · paired {s.pairedRaces} · settled paired {s.settledRaces} · unavailable {s.unavailableRaces} · excluded {s.excludedRaces}. Runner coverage Current {s.coverage.currentRunners}/{s.coverage.totalRunners}, Shadow {s.coverage.shadowRunners}/{s.coverage.totalRunners}.</p>
    <p className="mt-1 text-xs text-slate-500">Both models below use identical complete primary books. NR/void runners are excluded from settled selection denominators; started non-finishers lose. Original probabilities stay frozen. Top 2 strike counts winning selections per runner; race strike is shown separately. Price n is the smaller genuine bookmaker subset, captured with these books; no forecast or SP fallback.</p>
    <p className="mt-3 text-sm">Race log loss: Current {num(s.current.logLoss, 4)} / Shadow {num(s.shadow.logLoss, 4)} · Calibration: Current {pct(s.current.calibrationError)} / Shadow {pct(s.shadow.calibrationError)}</p>
    <p className="mt-1 text-xs">Top 2 race strike: Current {pct(s.current.top2RaceStrike)} / Shadow {pct(s.shadow.top2RaceStrike)}. Small samples are descriptive; no decisions before separate review.</p>
    <MetricsTable rows={([['Top1', 'top1'], ['Rank2', 'rank2'], ['Top2', 'top2']] as const).flatMap(([label, key]) => [
      { label: `CURRENT JUMP_TISSUE_V1 ${label}`, metrics: s.current[key] }, { label: `CHASE_SHADOW_V1 ${label}`, metrics: s.shadow[key] },
    ])} />
    <h3 className="mt-4 text-sm font-semibold">Rank 1 disagreement / agreement</h3>
    {s.disagreement.map(d => <div key={d.label}><p className="mt-2 text-xs">{d.label} races: {d.races} · Current Rank1 winners {d.current.top1.winners} / Shadow Rank1 winners {d.shadow.top1.winners}</p><MetricsTable rows={[{ label: `${d.label} CURRENT Rank1`, metrics: d.current.top1 }, { label: `${d.label} SHADOW Rank1`, metrics: d.shadow.top1 }]} /></div>)}
    <div className="grid gap-x-6 xl:grid-cols-2">
      <Groups title="Known weakness · prior Chase starts" rows={s.newChasers} />
      <Groups title="Known weakness · latest run completed / PU or non-completion" rows={s.completion} />
    </div>
    <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Reliability, handicap, calibration, longer prices and checkpoints</summary>
      <p className="mt-2 text-xs text-slate-500">Group log loss is binary runner log loss. Overall and checkpoint log loss is mean race winner log loss, with fractional dead-heat contribution. Calibration error uses fixed-band absolute winner-minus-expected differences divided by settled runners. No calibration fitting. MEDIUM/LOW overlaps MEDIUM and LOW.</p>
      <Groups title="Existing Chase Speed Reliability" rows={s.reliability} />
      <Groups title="Handicap status" rows={s.handicap} />
      <h3 className="mt-4 text-sm font-semibold">Fixed probability bands · all settled paired runners</h3>
      <div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><thead><tr>{["Band / model", "Runners", "Expected", "Actual", "A/M"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {s.current.calibration.flatMap((_, i) => (['current', 'shadow'] as const).map(model => { const b = s[model].calibration[i]!; return <tr key={`${model}-${b.band}`}><th className="p-2 text-left font-medium">{b.band} · {model.toUpperCase()}</th><td>{b.runners}</td><td>{num(b.expected)}</td><td>{b.winners}</td><td>{num(b.actualModel)}</td></tr>; }))}
      </tbody></table></div>
      <h3 className="mt-4 text-sm font-semibold">Longer-price context · genuine price &gt;6.00 · descriptive only</h3>
      <MetricsTable rows={[{ label: "SHADOW Rank1/2", metrics: s.shadow.longerPrice }, { label: "CURRENT Rank1/2", metrics: s.current.longerPrice }]} />
      <h3 className="mt-4 text-sm font-semibold">Descriptive checkpoints · fixed first settled paired races</h3>
      <div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><thead><tr>{["Checkpoint / model", "State", "Log loss", "Calibration", "Top1 winners", "Top2 winners"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {s.checkpoints.flatMap(c => (['current', 'shadow'] as const).map(model => <tr key={`${c.target}-${model}`}><th className="p-2 text-left font-medium">{c.target} · {model.toUpperCase()}</th><td>{c.reached ? c.recordedAt : "Pending"}</td><td>{num(c[model].logLoss, 4)}</td><td>{pct(c[model].calibrationError)}</td><td>{c.reached ? c[model].top1.winners : "—"}</td><td>{c.reached ? c[model].top2.winners : "—"}</td></tr>))}
      </tbody></table></div>
      <h3 className="mt-4 text-sm font-semibold">Through time · monthly settled paired races</h3>
      {s.chronology.map(c => <p key={c.month} className="mt-2 text-xs">{c.month} · races {c.current.races} · log loss Current {num(c.current.logLoss, 4)} / Shadow {num(c.shadow.logLoss, 4)} · calibration Current {pct(c.current.calibrationError)} / Shadow {pct(c.shadow.calibrationError)}</p>)}
      <p className="mt-3 text-xs text-slate-500">Any replacement requires a separate review: better prospective log loss, better or comparable calibration, stable improvement through time, no material coverage regression, and acceptable new-chaser/non-completer behaviour. ROI alone is insufficient.</p>
    </details>
  </section>;
}
