import { cleanShadowValue, isProspectiveShadow, SHADOW_PRICE_STAGES, type ShadowData, type ShadowRace, type ShadowRunner } from "./aw-tissue-shadow-forward";

const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const BANDS = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]] as const;
const EDGE_BANDS = [[">0pp", 0, false], [">=2.5pp", 2.5, true], [">=5pp", 5, true], [">=7.5pp", 7.5, true], [">=10pp", 10, true]] as const;
const probability = (r: ShadowRunner, model: "v1" | "candidate") => model === "v1" ? r.v1Probability : r.candidateProbability;
const leader = (race: ShadowRace, model: "v1" | "candidate") => race.runners.find(r => (model === "v1" ? r.v1Rank : r.candidateRank) === 1)!;

export function summarizeAwShadow(data: ShadowData) {
  const prospective = data.races.filter(isProspectiveShadow);
  const settled = prospective.filter(r => r.settledAt !== null);
  const quality = settled.filter(r => r.runners.every(s => s.outcome?.won != null) && r.winners.length > 0);
  const observations = quality.flatMap(r => r.runners);
  const metrics = (["v1", "candidate"] as const).map(model => ({
    model, races: quality.length, runners: observations.length,
    logLoss: mean(quality.map(r => -Math.log(r.runners.filter(s => s.outcome!.won).reduce((sum, s) => sum + probability(s, model), 0)))),
    brier: mean(quality.map(r => r.runners.reduce((sum, s) => sum + (probability(s, model) - (s.outcome!.won ? 1 / r.winners.length : 0)) ** 2, 0))),
    top1: mean(quality.map(r => leader(r, model).outcome!.won ? 1 : 0)),
    calibration: BANDS.map(([band, low, high]) => {
      const rows = observations.filter(s => probability(s, model) >= low && probability(s, model) < high);
      return { band, runners: rows.length, predicted: mean(rows.map(s => probability(s, model))), actual: mean(rows.map(s => s.outcome!.won ? 1 : 0)) };
    }),
  }));
  const changed = prospective.filter(r => leader(r, "v1").runnerId !== leader(r, "candidate").runnerId);
  const runners = prospective.flatMap(r => r.runners);
  const movement = { runners: runners.length, meanSignedPp: mean(runners.map(r => (r.candidateProbability - r.v1Probability) * 100)),
    meanAbsolutePp: mean(runners.map(r => Math.abs(r.candidateProbability - r.v1Probability) * 100)),
    maximumAbsolutePp: runners.length ? Math.max(...runners.map(r => Math.abs(r.candidateProbability - r.v1Probability) * 100)) : null,
    bands: [["<2.5pp", 0, 2.5], ["2.5-4.99pp", 2.5, 5], ["5-9.99pp", 5, 10], ["10pp+", 10, Infinity]].map(([band, low, high]) => ({ band,
      runners: runners.filter(r => { const d = Math.abs(r.candidateProbability - r.v1Probability) * 100; return d >= (low as number) && d < (high as number); }).length })),
  };
  const value = SHADOW_PRICE_STAGES.flatMap(stage => (["all_priced_runners", "own_rank1"] as const).flatMap(population => (["v1", "candidate"] as const).flatMap(model => {
    const available = prospective.flatMap(race => race.runners.flatMap(runner => {
      if (population === "own_rank1" && runner.runnerId !== leader(race, model).runnerId) return [];
      const observation = cleanShadowValue(race, runner, stage, probability(runner, model));
      return observation ? [{ race, runner, ...observation }] : [];
    }));
    return EDGE_BANDS.map(([band, threshold, inclusive]) => {
      const selections = available.filter(r => inclusive ? r.edgePp >= threshold : r.edgePp > threshold);
      const resolved = selections.filter(r => r.race.settledAt !== null && r.profit !== null);
      return { stage, population, model, band, pricedCoverage: available.length, selections: selections.length, settled: resolved.length,
        pending: selections.length - resolved.length, winners: resolved.filter(r => r.runner.outcome!.won).length,
        strike: mean(resolved.map(r => r.runner.outcome!.won ? 1 : 0)), profit: resolved.reduce((s, r) => s + r.profit!, 0),
        roi: mean(resolved.map(r => r.profit!)) };
    });
  })));
  return {
    modelHash: data.modelHash, implementedAt: data.implementedAt,
    tracked: data.races.length, prospectiveRaces: prospective.length, prospectiveRunners: runners.length,
    retrospectiveRaces: data.races.filter(r => r.captureMode !== "live_sync").length,
    excludedRaces: data.races.length - prospective.length, settledRaces: settled.length, pendingRaces: prospective.length - settled.length,
    probabilityExcludedVoidOrIncomplete: settled.length - quality.length, metrics, movement, value,
    changedTop1: changed.map(r => ({ raceId: r.raceId, raceDate: r.raceDate, course: r.course,
      v1: leader(r, "v1").horseName, candidate: leader(r, "candidate").horseName,
      v1Won: leader(r, "v1").outcome?.won ?? null, candidateWon: leader(r, "candidate").outcome?.won ?? null })),
    details: data.races.map(r => ({ ...r, runners: r.runners.map(s => ({ ...s, movementPp: (s.candidateProbability - s.v1Probability) * 100,
      markets: SHADOW_PRICE_STAGES.map(stage => {
        const p = s.prices[stage]?.snapshot;
        return { stage, price: p?.decimalPrice ?? null, implied: p?.impliedProbability ?? null, capturedAt: p?.capturedAt ?? null,
          v1EdgePp: p ? (s.v1Probability - p.impliedProbability) * 100 : null,
          candidateEdgePp: p ? (s.candidateProbability - p.impliedProbability) * 100 : null,
          v1CleanSettlement: cleanShadowValue(r, s, stage, s.v1Probability)?.profit ?? null,
          candidateCleanSettlement: cleanShadowValue(r, s, stage, s.candidateProbability)?.profit ?? null };
      }) })) })),
  };
}

export function renderAwShadowReport(data: ShadowData, sourceRacesWithoutShadow = 0): string {
  const s = summarizeAwShadow(data);
  const number = (v: number | null) => v === null ? "-" : v.toFixed(4);
  const pct = (v: number | null) => v === null ? "-" : `${(v * 100).toFixed(2)}%`;
  const table = (headers: string[], rows: Array<Array<string | number | null>>) => [
    `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.map(v => String(v ?? "-").replaceAll("|", "\\|")).join(" | ")} |`), "",
  ].join("\n");
  return ["# AW V1 / Frozen Shadow Prospective Comparison", "", `Diagnostic only. Shadow start: ${s.implementedAt}; model SHA-256 ${s.modelHash}.`, "",
    `True prospective: ${s.prospectiveRaces} races / ${s.prospectiveRunners} runners; settled ${s.settledRaces}; pending ${s.pendingRaces}; retrospective ${s.retrospectiveRaces}; excluded ${s.excludedRaces}.`,
    `Existing V1 records without a paired capture: ${sourceRacesWithoutShadow}. These are not reconstructed or counted as prospective shadow observations.`, "",
    table(["Model", "Quality races", "Runners", "Log loss", "Race Brier", "Top-1 strike"], s.metrics.map(m => [m.model, m.races, m.runners, number(m.logLoss), number(m.brier), pct(m.top1)])),
    `Full-field probability exclusions (void/incomplete): ${s.probabilityExcludedVoidOrIncomplete}. Frozen probabilities are never renormalized after non-runners. Dead heats use winner probability mass for log loss and equal winner shares for Brier; calibration and strike count a dead-heat winner as a winner.`, "",
    "## Calibration", "", table(["Model", "Band", "Runners", "Predicted", "Actual strike"], s.metrics.flatMap(m => m.calibration.map(b => [m.model, b.band, b.runners, pct(b.predicted), pct(b.actual)]))),
    "## Probability Movement", "", `Mean signed ${number(s.movement.meanSignedPp)} pp; mean absolute ${number(s.movement.meanAbsolutePp)} pp; maximum absolute ${number(s.movement.maximumAbsolutePp)} pp.`, "",
    table(["Absolute movement", "Runners"], s.movement.bands.map(b => [String(b.band), b.runners])),
    `Changed top-1: ${s.changedTop1.length}/${s.prospectiveRaces} races.`, "",
    table(["Date", "Course", "V1 leader", "Candidate leader", "V1 won", "Candidate won"], s.changedTop1.map(r => [r.raceDate, r.course, r.v1, r.candidate, String(r.v1Won ?? "pending/void"), String(r.candidateWon ?? "pending/void")])),
    "## Frozen-Price Value Diagnostics", "",
    "Edge uses probability percentage points: (model probability - 1/decimal price) * 100. Thresholds are fixed, cumulative and overlapping; price stages are reported separately and must not be pooled as independent bets. Both models use exactly the same frozen price for any compared runner. No optimum threshold is selected.", "",
    table(["Stage", "Population", "Model", "Edge", "Clean priced", "Selected", "Settled", "Pending", "Winners", "Strike", "P/L", "ROI"], s.value.map(v => [v.stage, v.population, v.model, v.band, v.pricedCoverage, v.selections, v.settled, v.pending, v.winners, pct(v.strike), number(v.profit), pct(v.roi)])),
    "Only existing AW Tissue / Forward Value median-bookmaker snapshots captured at or after shadow prediction and strictly before off are eligible. No new price capture, forecast fallback or final-SP substitution occurs. Existing infrastructure prices selected leaders, not the whole field: all_priced_runners is that restricted observed population, not all eligible runners. own_rank1 can have different price coverage when the candidate changes leader. Missing prices remain missing. Non-runners are excluded by the existing Forward Value clean-observation predicate; started non-finishers lose and dead heats use canonical settlement at the frozen price.", "",
    "## Runner Observations", "", table(["Capture mode", "Date", "Course", "Horse", "V1 p", "Shadow p", "V1 rank", "Shadow rank", "Stage", "Price", "Implied p", "V1 edge pp", "Shadow edge pp", "Outcome", "Frozen-price P/L"],
      s.details.flatMap(r => r.runners.flatMap(x => x.markets.map(p => [r.captureMode, r.raceDate, r.course, x.horseName, pct(x.v1Probability), pct(x.candidateProbability), x.v1Rank, x.candidateRank,
        p.stage, number(p.price), pct(p.implied), number(p.v1EdgePp), number(p.candidateEdgePp), x.outcome?.resultStatus ?? "pending", number(p.v1CleanSettlement)])))),
    "No production probabilities are generated from the shadow. Historical reconstruction is not performed; new captures require matching frozen V1 base inputs, the same active field, available depth metadata, no result evidence and a pre-off timestamp. Run the separate sync command prospectively to collect observations; summary is read-only. This report does not recommend promotion.", "",
  ].join("\n");
}
