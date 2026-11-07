import { latestContextWeightShadows, validContextWeightShadow, type ContextShadowData, type ContextShadowObservation } from "./context-weight-shadow-forward";
import { CONTEXT_SHADOW_CANDIDATES, CONTEXT_SHADOW_EPOCH } from "./context-weight-shadow-config";
import { tissueProspectiveMetrics } from "./tissue-prospective-summary";
import { validGenerationCapture, type GenerationData } from "./tissue-generation-forward";
import { captureIdentity, latestPreOffCaptures } from "./frozen-capture-selection";

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const ordered = (book: ContextShadowObservation, shadow: boolean) => [...(shadow ? book.runners : book.production.runners)]
  .sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));

function modelMetrics(books: ContextShadowObservation[], shadow: boolean) {
  const losses: number[] = [], briers: number[] = [], winnerRanks: number[] = [];
  const bands = Array.from({ length: 10 }, (_, i) => ({ band: `${i * 10}–${(i + 1) * 10}%`, runners: 0, actual: 0, expected: 0 }));
  let runners = 0, top1 = 0, top3 = 0;
  const pricedSelections = [];
  let marketExpected = 0;
  for (const book of books) {
    const rows = book.production.runners, predictions = new Map((shadow ? book.runners : rows).map(r => [r.runnerId, r]));
    const winners = rows.filter(r => r.outcome!.winner === true), order = ordered(book, shadow), leader = rows.find(r => r.runnerId === order[0].runnerId)!;
    top1 += Number(leader.outcome!.winner === true);
    top3 += Number(winners.some(r => predictions.get(r.runnerId)!.rank <= 3));
    losses.push(-winners.reduce((s, r) => s + Math.log(Math.max(predictions.get(r.runnerId)!.probability, 1e-300)), 0) / winners.length);
    briers.push(rows.reduce((s, r) => s + (predictions.get(r.runnerId)!.probability - (r.outcome!.winner ? 1 / winners.length : 0)) ** 2, 0));
    winnerRanks.push(winners.reduce((s, r) => s + predictions.get(r.runnerId)!.rank, 0) / winners.length);
    for (const row of rows) {
      const p = predictions.get(row.runnerId)!.probability, band = bands[Math.min(9, Math.floor(p * 10))];
      band.runners++; band.expected += p; band.actual += row.outcome!.winner ? 1 / winners.length : 0; runners++;
    }
    if (book.production.completeMarket && leader.capturedPrice !== null) {
      pricedSelections.push({ family: book.family, tissueRank: 1, probability: predictions.get(leader.runnerId)!.probability,
        capturedPrice: leader.capturedPrice, outcome: leader.outcome });
      marketExpected += 1 / leader.capturedPrice;
    }
  }
  const value = tissueProspectiveMetrics(pricedSelections);
  return { races: books.length, runners, logLoss: mean(losses), brier: mean(briers),
    calibrationError: runners ? bands.reduce((s, b) => s + Math.abs(b.actual - b.expected), 0) / runners : null,
    bands: bands.map(b => ({ ...b, actualRate: b.runners ? b.actual / b.runners : null, predictedRate: b.runners ? b.expected / b.runners : null })),
    rank1Winners: top1, rank1StrikeRate: books.length ? top1 / books.length : null, top3Winners: top3,
    top3StrikeRate: books.length ? top3 / books.length : null, meanWinnerRank: mean(winnerRanks),
    capturedPriceRank1: { races: value.priceN, roi: value.roi, profitLoss: value.profitLoss,
      actualExpectedMarket: marketExpected > 0 ? value.winners / marketExpected : null, note: "Canonical frozen-price settlement; no SP fallback. No tuning." } };
}
export function summarizeContextWeightShadow(data: ContextShadowData, source?: GenerationData) {
  const selected = latestContextWeightShadows(data);
  return { header: "Prospective evidence only — candidate selected from prior retrospective diagnostic.", epoch: CONTEXT_SHADOW_EPOCH,
    automaticPromotion: false, candidates: (["AW", "TURF"] as const).map(family => {
      const definition = CONTEXT_SHADOW_CANDIDATES[family], all = data.observations.filter(r => r.family === family), valid = all.filter(validContextWeightShadow);
      const books = selected.filter(r => r.family === family);
      const expected = source?.races.filter(r => r.family === family && validGenerationCapture(r) && Date.parse(r.capturedAt) >= Date.parse(CONTEXT_SHADOW_EPOCH));
      const observed = new Set(valid.map(captureIdentity));
      const coverage = { expectedProductionCaptures: expected?.length ?? null,
        unpairedProductionCaptures: expected?.filter(r => !observed.has(captureIdentity(r))).length ?? null,
        missingLatestProductionRaces: expected ? latestPreOffCaptures(expected).filter(r => !observed.has(captureIdentity(r))).length : null,
        note: "Coverage only: missed captures are counted, never reconstructed. Null means production coverage source unavailable. Proper scores pair the frozen predictions within each shadow book." };
      const clean = books.filter(r => r.production.runners.every(x => x.outcome?.status === "settled") && r.production.runners.some(x => x.outcome?.winner === true));
      const production = modelMetrics(clean, false), shadow = modelMetrics(clean, true);
      const rankMovements = books.flatMap(r => r.runners.map(x => x.rank - r.production.runners.find(p => p.runnerId === x.runnerId)!.rank));
      const changedRank1 = books.filter(r => ordered(r, false)[0].runnerId !== ordered(r, true)[0].runnerId).length;
      const winnerChanged = clean.filter(r => {
        const won = (shadow: boolean) => r.production.runners.find(p => p.runnerId === ordered(r, shadow)[0].runnerId)!.outcome!.winner;
        return won(false) !== won(true);
      }).length;
      const sampleRows = clean.map(r => ({ family, tissueRank: 1, probability: ordered(r, false)[0].probability, capturedPrice: null,
        outcome: r.production.runners.find(p => p.runnerId === ordered(r, false)[0].runnerId)!.outcome }));
      const sample = tissueProspectiveMetrics(sampleRows).sample;
      const delta = (a: number | null, b: number | null) => a === null || b === null ? null : b - a;
      return { family, candidateVersion: definition.id, productionModelVersion: definition.productionVersion, productionModelHash: definition.productionHash, multiplier: definition.multiplier, sampleBand: sample,
        status: sample === "MEANINGFUL" ? "DESCRIPTIVE MONITORING ONLY — NO AUTOMATIC PROMOTION" : "INSUFFICIENT PROSPECTIVE SAMPLE",
        firstObservation: valid.length ? valid.map(r => r.capturedAt).sort()[0] : null, observations: valid.length, races: books.length,
        runners: books.reduce((s, r) => s + r.runners.length, 0), cleanPairedRaces: clean.length, cleanPairedRunners: production.runners,
        pendingRaces: books.filter(r => r.production.runners.some(x => x.outcome === null)).length,
        nonRunnerRaces: books.filter(r => r.production.runners.some(x => x.outcome?.status === "NR")).length,
        voidRaces: books.filter(r => r.production.runners.some(x => x.outcome?.status === "void")).length,
        incompleteSettlements: books.length - clean.length - books.filter(r => r.production.runners.some(x => x.outcome === null || x.outcome?.status === "NR" || x.outcome?.status === "void")).length,
        invalidOrVersionMismatch: all.length - valid.length, coverage, production, shadow,
        delta: { logLoss: delta(production.logLoss, shadow.logLoss), brier: delta(production.brier, shadow.brier), calibrationError: delta(production.calibrationError, shadow.calibrationError) },
        ranking: { changedRunnerRanks: rankMovements.filter(n => n !== 0).length, meanAbsoluteRankMovement: mean(rankMovements.map(Math.abs)),
          changedRank1Races: changedRank1, changedRank1WinnerRaces: winnerChanged },
        methodology: "Latest whole pre-off capture per race/candidate; identical complete all-starter settled fields for proper scores. NR/void races excluded, not renormalised. Started non-finishers remain losses. Rank-1 uses a unique probability/UUID leader; top-3 and winner rank use canonical stored ranks, including Turf ties. Ten fixed calibration bins. Existing 300 rank-1-observation meaningful-sample convention; no automatic promotion." };
    }) };
}
