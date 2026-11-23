import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleV3MarketEdgeMonitor } from "@/app/racing/research/forward-value/hurdle-v3-market-edge-monitor";
import { HurdleV3ShadowMonitor } from "@/app/racing/research/forward-value/hurdle-v3-shadow-monitor";
import {
  hurdleEdgeFinalSp, hurdleShadowFinalSp, indexHurdleFinalSpResults, summarizeHurdleFinalSp,
  type HurdleFinalSpResultRow,
} from "./hurdle-final-sp";
import { loadHurdleMarketEdge } from "./hurdle-v3-market-edge";
import { summarizeHurdleMarketEdge } from "./hurdle-v3-market-edge-metrics";
import { loadHurdleV3Shadow, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { hurdleShadowOutcome, summarizeHurdleV3Shadow } from "./hurdle-v3-shadow-metrics";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";

function terminalRows(observation: HurdleV3ShadowObservation): HurdleFinalSpResultRow[] {
  return observation.production.runners.map(runner => ({
    raceId: observation.raceId,
    runnerId: runner.runnerId,
    raceStage: "WEIGHEDIN",
    actualRunnerCount: observation.production.runners.filter(r => r.outcome?.status === "settled").length,
    resultRideCount: observation.production.runners.length,
    resultRideId: `ride:${runner.runnerId}`,
    resultPosition: runner.outcome?.finishPosition?.toString() ?? null,
    resultPrice: "EVS",
    finishingPosition: runner.outcome?.finishPosition ?? null,
    resultStatus: runner.outcome?.resultStatus ?? null,
    // The archive can record "other" after a legacy settlement. Full results also carry a casualty code.
    outcomeCode: runner.outcome?.resultStatus === "other" ? "RANOUT" : runner.outcome?.resultStatus ?? null,
    startingPriceDecimal: "2.000",
  }));
}

test("terminal result lookup excludes provisional, incomplete, ambiguous and void fields", async () => {
  const archive = (await loadHurdleV3Shadow())!;
  const o = archive.observations.find(o => hurdleShadowOutcome(o) === "settled")!;
  const rows = terminalRows(o);
  assert.ok(indexHurdleFinalSpResults(rows).get(o.raceId)?.size);
  for (const stage of ["RESULT", "RACEVOID", null]) {
    assert.equal(indexHurdleFinalSpResults(rows.map(r => ({ ...r, raceStage: stage }))).size, 0);
  }
  assert.equal(indexHurdleFinalSpResults(rows.slice(1)).size, 0);
  assert.equal(indexHurdleFinalSpResults([rows[0], ...rows.slice(0, -1)]).size, 0);
  assert.equal(indexHurdleFinalSpResults(rows.map((r, i) => i === 0 ? { ...r, resultRideId: null } : r)).size, 0);
  assert.equal(indexHurdleFinalSpResults(rows.map(r => r.finishingPosition === 1 ? { ...r, resultPosition: "2" } : r)).size, 0);
});

test("comparison keeps frozen ranks, excludes NR and void, and reconciles signed P/L and Top2 stakes", async () => {
  const archive = (await loadHurdleV3Shadow())!;
  const differing = archive.observations.find(o => hurdleShadowOutcome(o) === "settled" &&
    o.production.runners.some(r => r.rank === 1 && r.outcome?.winner) &&
    o.runners.some(r => r.official.rank === 1 && !o.production.runners.find(p => p.runnerId === r.official.runnerId)?.outcome?.winner))!;
  const rows = terminalRows(differing);
  const winner = rows.find(r => r.finishingPosition === 1)!;
  winner.resultPrice = "4/6";
  winner.startingPriceDecimal = "1.667";
  const data = { ...archive, observations: [differing] };
  const [v2, v3] = hurdleShadowFinalSp(data, indexHurdleFinalSpResults(rows));
  assert.notEqual(v2.picks.find(p => p.rank === 1)?.runnerId, v3.picks.find(p => p.rank === 1)?.runnerId);
  assert.equal(v2.picks[0].modelVersion, archive.v2Version);
  assert.equal(v3.picks[0].modelVersion, archive.v3Version);
  assert.equal(v2.picks[0].finalSp, "4/6");
  assert.equal(v2.picks[0].settlement?.settlementVersion, CANONICAL_SETTLEMENT_VERSION);
  assert.ok(Math.abs(v2.rows[0].profit! - 2 / 3) < 1e-12);
  assert.equal(v3.rows[0].profit, -1);

  const snapshot = JSON.stringify(archive);
  const results = indexHurdleFinalSpResults(archive.observations.flatMap(terminalRows));
  const prediction = summarizeHurdleV3Shadow(archive);
  for (const [i, cohort] of hurdleShadowFinalSp(archive, results).entries()) {
    const [t1, t2, top2] = cohort.rows;
    assert.equal(t1.eligible, prediction.rows[i].selections[0].eligible);
    assert.equal(t2.eligible, prediction.rows[i].selections[1].eligible);
    assert.equal(top2.stakes, t1.stakes + t2.stakes);
    assert.equal(top2.profit, t1.profit! + t2.profit!);
    assert.equal(top2.roi, top2.profit! / top2.stakes);
    assert.ok(cohort.picks.every(p => p.settlement));
    assert.equal(new Set(cohort.picks.map(p => `${p.raceId}|${p.runnerId}`)).size, top2.stakes);
  }
  assert.equal(JSON.stringify(archive), snapshot);
});

test("canonical dead heat divides gross return, and missing or conflicting final prices never count as losses", async () => {
  const archive = (await loadHurdleV3Shadow())!;
  const o = structuredClone(archive.observations.find(o => hurdleShadowOutcome(o) === "settled" &&
    [1, 2].every(rank => o.production.runners.some(r => r.rank === rank && r.outcome?.status === "settled")))!);
  for (const runner of o.production.runners.filter(r => r.rank <= 2 || r.outcome?.winner)) {
    Object.assign(runner.outcome!, { winner: true, finishPosition: 1 });
  }
  const winners = o.production.runners.filter(r => r.outcome?.winner);
  for (const runner of winners) runner.outcome!.deadHeatDivisor = winners.length;
  const rows = terminalRows(o);
  const win = rows.find(r => r.runnerId === o.production.runners.find(r => r.rank === 1)!.runnerId)!;
  const second = rows.find(r => r.runnerId === o.production.runners.find(r => r.rank === 2)!.runnerId)!;
  Object.assign(win, { resultPrice: "9/1", startingPriceDecimal: "10.000" });
  Object.assign(second, { resultPrice: null, startingPriceDecimal: "2.000" });
  const data = { ...archive, observations: [o] };
  const [v2] = hurdleShadowFinalSp(data, indexHurdleFinalSpResults(rows));
  assert.equal(v2.picks[0].settlement?.profitLoss, 10 / winners.length - 1);
  assert.equal(v2.picks[1].exclusion, "missingPrice");
  assert.equal(v2.rows[2].stakes, 1);
  assert.equal(v2.rows[2].eligible, 2);
  assert.equal(v2.rows[1].roi, null);
  assert.equal(summarizeHurdleV3Shadow(data).rows[0].selections[1].winners, 1);
  const html = renderToStaticMarkup(<HurdleV3ShadowMonitor data={data} results={indexHurdleFinalSpResults(rows)} />);
  assert.match(html, /£1 SP P\/L/);
  assert.match(html, /\+£[\d.]+/);
  assert.match(html, /1 unverified/);
  second.resultPrice = "9/1";
  assert.equal(hurdleShadowFinalSp(data, indexHurdleFinalSpResults(rows))[0].picks[1].exclusion, "priceMismatch");
});

test("edge SP rows keep frozen bands and exact capture matching even when final prices reverse the market", async () => {
  const [edge, shadows] = await Promise.all([loadHurdleMarketEdge(), loadHurdleV3Shadow()]);
  assert.ok(edge && shadows);
  const before = JSON.stringify([edge, shadows]);
  const rows = shadows.observations.flatMap(terminalRows);
  for (const o of edge.observations.filter(o => o.completeMarket)) {
    const t1 = rows.find(r => r.raceId === o.raceId && r.runnerId === o.v3T1)!;
    Object.assign(t1, { resultPrice: "1/20", startingPriceDecimal: "1.050" });
  }
  const results = indexHurdleFinalSpResults(rows);
  const picks = hurdleEdgeFinalSp(edge, shadows, results);
  const original = summarizeHurdleMarketEdge(edge, shadows);
  for (const row of [...original.t1, ...original.t2]) {
    const band = picks.filter(p => p.rank === row.pickRank && p.edgeBand === row.label);
    assert.equal(summarizeHurdleFinalSp(band).stakes, row.settled);
  }
  const large = picks.filter(p => p.rank === 1 && p.edgeBand === "LARGE POSITIVE");
  for (const row of [...original.speed, ...original.marketRank, ...original.form]) {
    assert.equal(large.filter(p => p.speedEvidence === row.label || p.marketRankBand === row.label || p.form === row.label).length, row.settled);
  }
  assert.equal(JSON.stringify([edge, shadows]), before);
  assert.equal(hurdleEdgeFinalSp(edge, { ...shadows, observations: [] }, results).length, 0);
  const html = renderToStaticMarkup(<HurdleV3MarketEdgeMonitor data={edge} shadows={shadows} results={results} />);
  assert.equal((html.match(/£1 SP P\/L/g) ?? []).length, 7);
  assert.match(html, /−£[\d.]+/);
});

test("sensitivity ranks winning payouts and removes all stakes from those races once", async () => {
  const archive = (await loadHurdleV3Shadow())!;
  const picks = hurdleShadowFinalSp(archive, indexHurdleFinalSpResults(archive.observations.flatMap(terminalRows)))[0].picks;
  const win = picks.find(p => p.won && p.settlement)!;
  const loss = picks.find(p => !p.won && p.settlement)!;
  const winner = (raceId: string, grossReturn: number) => ({
    ...win, raceId, exclusion: undefined,
    settlement: { ...win.settlement!, grossReturn, profitLoss: grossReturn - 1 },
  });
  const largest = winner("first", 11);
  const stakes = [largest, largest, { ...loss, raceId: "first" }, winner("second", 7), { ...loss, raceId: "third" }];
  assert.deepEqual(summarizeHurdleFinalSp(stakes), {
    stakes: 4, eligible: 4, profit: 14, roi: 3.5, withoutLargest: 5, withoutTwoLargest: -1,
  });
});
