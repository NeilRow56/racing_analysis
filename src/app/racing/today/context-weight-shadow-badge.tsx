import type { ContextShadowView } from "@/lib/racing/context-weight-shadow-view";

export function ContextWeightShadowBadge({ observation }: { observation?: ContextShadowView }) {
  if (!observation) return null;
  const { family, productionRank, shadowRank, productionProbability, shadowProbability } = observation;
  const label = family === "AW" ? "AW SHADOW 75%" : "TURF SHADOW 25%";
  const help = `${family} context-weight shadow candidate: ${family === "AW" ? "75%" : "25%"} of the selected context influence. Observation only. Prospective shadow model — does not affect the live production selection.`;
  return <details className="mt-1 text-[10px] text-slate-500" data-context-shadow={observation.candidateVersion}>
    <summary className="cursor-pointer list-none" title={help} aria-label={help}>
      <span className="inline-flex rounded-sm border border-slate-300 bg-slate-50 px-1 py-0.5">{label}</span>
      {productionRank !== shadowRank ? <span className="ml-1 font-medium text-slate-600">Shadow: {productionRank} → {shadowRank}</span> : null}
    </summary>
    <div className="mt-1 space-y-0.5 text-slate-600">
      <p>Observation only — does not affect the live production selection.</p>
      <p>Production: {(productionProbability * 100).toFixed(2)}% · rank {productionRank}</p>
      <p>Shadow: {(shadowProbability * 100).toFixed(2)}% · rank {shadowRank}</p>
      <p>Probability difference: {((shadowProbability - productionProbability) * 100).toFixed(2)} pp</p>
      <p className="break-all">{observation.candidateVersion}</p>
      <p>Frozen {observation.capturedAt}</p>
    </div>
  </details>;
}
