import { EPOCHS } from "./prospective-epoch-config";
import { loadEpochManifest, assertEpochSources } from "./prospective-epoch-integrity";
import { loadPositiveNeutral, matchingPositiveNeutralCapture, type PositiveNeutralData } from "./tissue-positive-neutral";
import { loadHurdleV3Shadow, type HurdleV3ShadowData } from "./hurdle-v3-shadow";
import { loadHurdleMarketEdge, matchingMarketEdgeShadow, type HurdleMarketEdgeData } from "./hurdle-v3-market-edge";
import { loadTissueGeneration, type GenerationData } from "./tissue-generation-forward";
import { recordedSettlementBasis } from "./settlement-reporting";
import type { ValueOutcome } from "./tissue-value-metrics";
import type { SettlementVersionedSnapshot } from "./research-settlement-version";

type Outcome = (ValueOutcome & SettlementVersionedSnapshot) | null;
export type EpochReportRow = { epoch: string; programme: string; family: string; model: string; cohort: string; settlement: string;
  captured: number; settled: number; priced: number; profitLoss: number | null; roi: number | null };
export function summarizeCollectionEpoch(epoch: string, positive: PositiveNeutralData | null, shadow: HurdleV3ShadowData | null,
  edge: HurdleMarketEdgeData | null, generation: GenerationData): EpochReportRow[] {
  const rows = new Map<string, EpochReportRow>();
  function add(programme: string, family: string, model: string, cohort: string, outcome: Outcome, matched = true, money = true) {
    const settlement = outcome ? recordedSettlementBasis(outcome) : matched ? "pending" : "source unavailable";
    const key = JSON.stringify([epoch, programme, family, model, cohort, settlement]);
    const row = rows.get(key) ?? { epoch, programme, family, model, cohort, settlement, captured: 0, settled: 0, priced: 0, profitLoss: null, roi: null };
    row.captured++;
    if (outcome?.status === "settled") {
      row.settled++;
      if (money && outcome.profitLoss !== null) { row.priced++; row.profitLoss = (row.profitLoss ?? 0) + outcome.profitLoss; row.roi = row.profitLoss / row.priced; }
    }
    rows.set(key, row);
  }
  for (const o of positive?.observations ?? []) {
    const source = matchingPositiveNeutralCapture(o, generation.races);
    for (const r of o.selections) add("Positive/Neutral", o.family, o.modelVersion, `T${r.tissueRank} ${r.badgeState} / ${r.edgeBand ?? "no edge band"} / ${r.priceBand ?? "no price band"}`,
      source?.runners.find(p => p.runnerId === r.runnerId)?.outcome ?? null, !!source);
  }
  for (const o of shadow?.observations ?? []) for (const r of o.runners) {
    const production = o.production.runners.find(p => p.runnerId === r.target.runnerId)!;
    const outcome = production.outcome;
    if (production.rank <= 2) add("Shadow", "HURDLE", shadow!.v2Version, `T${production.rank}`, outcome, true, false);
    if (r.official.rank <= 2) add("Shadow", "HURDLE", shadow!.v3Version, `T${r.official.rank}`, outcome, true, false);
    if (r.ledCounterfactual.rank <= 2) add("Shadow", "HURDLE", `${shadow!.v3Version} LED counterfactual`, `T${r.ledCounterfactual.rank}`, outcome, true, false);
  }
  for (const o of edge?.observations ?? []) {
    const source = matchingMarketEdgeShadow(o, shadow?.observations ?? []);
    for (const r of o.runners.filter(r => r.v3Rank <= 2)) add("Market Edge", "HURDLE", shadow?.v3Version ?? "HURDLE_V3_CHALLENGER",
      `T${r.v3Rank} ${r.edgeBand ?? "incomplete market"} / ${r.speedDepth} / ${r.marketRankBand ?? "no market rank"} / ${o.form}`,
      source?.production.runners.find(p => p.runnerId === r.runnerId)?.outcome ?? null, !!source);
  }
  return [...rows.values()];
}
export async function collectionEpochReport() {
  const [manifest, generation, oldPositive, oldShadow, oldEdge, positive, shadow, edge] = await Promise.all([
    loadEpochManifest(), loadTissueGeneration(), loadPositiveNeutral(), loadHurdleV3Shadow(), loadHurdleMarketEdge(),
    loadPositiveNeutral(EPOCHS.positiveNeutral.ledger), loadHurdleV3Shadow(EPOCHS.shadow.ledger), loadHurdleMarketEdge(EPOCHS.marketEdge.ledger),
  ]);
  let sourceStatus = "NOT ARMED";
  if (manifest) {
    try {
      await assertEpochSources(manifest);
      if (!positive || !shadow || !edge || [positive, shadow, edge].some(d => d.armedAt !== manifest.activatedAt)) throw new Error("Missing or misaligned epoch ledger");
      sourceStatus = "ACTIVE";
    }
    catch (error) { sourceStatus = `BLOCKED: ${error instanceof Error ? error.message : String(error)}`; }
  }
  // Distinct calls and explicit IDs; no combined profitability total exists.
  return { activatedAt: manifest?.activatedAt ?? null, sourceStatus, collectionSemantics: manifest?.collectionSemantics ?? null,
    settlementVersion: manifest?.settlementVersion ?? null, historicalBackfill: false,
    epochs: EPOCHS, counts: { positiveNeutral: positive?.observations.length ?? 0, shadow: shadow?.observations.length ?? 0, marketEdge: edge?.observations.length ?? 0 },
    rows: [
      ...summarizeCollectionEpoch("ORIGINAL_V1", oldPositive, oldShadow, oldEdge, generation),
      ...summarizeCollectionEpoch(EPOCHS.positiveNeutral.id, positive, null, null, generation),
      ...summarizeCollectionEpoch(EPOCHS.shadow.id, null, shadow, null, generation),
      ...summarizeCollectionEpoch(EPOCHS.marketEdge.id, null, shadow, edge, generation).filter(r => r.programme === "Market Edge"),
    ] };
}
