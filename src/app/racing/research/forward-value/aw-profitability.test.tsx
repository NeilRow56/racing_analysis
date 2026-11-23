import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAwProfitabilityReport, matchedAwDecisions, profitabilityDate, readAwProfitabilityLedgers, summarizeAwDecisions } from "@/lib/racing/aw-profitability-report";
import { emptyTissueGeneration, loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { AwCumulativeProfitability, AwDailyProfitability } from "./aw-profitability";

const date = "2026-11-22";
const now = new Date("2026-11-23T07:00:00Z");
const loaded = await readAwProfitabilityLedgers();
const generation = await loadTissueGeneration();

test("Sunday shows the unchanged frozen Lingfield decisions and matched final-SP stakes", () => {
  const before = structuredClone(loaded);
  const report = buildAwProfitabilityReport(date, generation, loaded, now, {
    start: "2026-11-22T08:00:00.449Z", end: "2026-11-22T08:05:23.748Z", status: "success",
  });
  assert.equal(report.races.length, 9);
  assert.ok(report.races.every(r => r.course === "Lingfield" && r.original.every(Boolean)));
  const [v1, v3, sameOr, marketSupport] = report.policies;
  for (const policy of [v1, v3, sameOr]) {
    assert.equal(policy.eligible, 9);
    assert.equal(policy.day.length, 9);
    assert.ok(policy.day.every(d => d.capturedAt < d.decidedAt && d.decidedAt < d.scheduledOff));
    assert.equal(matchedAwDecisions({ ...policy, decisions: policy.day }).races, 9);
  }
  for (const policy of [v1, v3]) {
    const summary = summarizeAwDecisions(policy.day.map(d => d.pick));
    assert.deepEqual(summary, { recorded: 9, bets: 6, abstentions: 3, pending: 0, settled: 6, winners: 0, voids: 0, profit: -6, roi: -1 });
    assert.equal(matchedAwDecisions({ ...policy, decisions: policy.day }).reference.settled, 9);
  }
  const sameOrSummary = summarizeAwDecisions(sameOr.day.map(d => d.pick));
  assert.equal(sameOrSummary.settled, 9);
  assert.equal(sameOrSummary.winners, 1);
  assert.equal(sameOrSummary.abstentions, 0);
  assert.ok(Math.abs(sameOrSummary.profit! + 22 / 3) < 1e-12);
  assert.equal(sameOr.day.filter(d => d.pick?.runnerId !== d.reference.runnerId).length, 1);
  assert.equal(marketSupport.armedAt, null);
  const html = renderToStaticMarkup(<AwDailyProfitability report={report} />);
  for (const value of ["Lingfield", "UNARMED", "CAPTURED", "SETTLED", "NO BET", "Substituted the leader", "Captured market rank", "Bookmaker median", "Final SP 4/6", "−£7.33"]) {
    assert.ok(html.includes(value), value);
  }
  assert.deepEqual(loaded, before);
});

test("no-capture dates and an armed empty ledger show NO DATA with no monetary result", () => {
  assert.equal(profitabilityDate("2026-02-30", date), date);
  const [profit, sameOr, support] = loaded;
  assert.ok(profit.status === "fulfilled" && profit.value);
  const empty = { ...profit, value: { ...profit.value, races: [] } };
  const report = buildAwProfitabilityReport("2026-11-23", emptyTissueGeneration(), [empty, sameOr, support], now);
  assert.equal(report.races.length, 0);
  assert.equal(report.policies[0].eligible, 0);
  assert.equal(report.policies[0].latest, null);
  const html = renderToStaticMarkup(<><AwDailyProfitability report={report} /><AwCumulativeProfitability policies={report.policies.slice(0, 2)} /></>);
  assert.match(html, /ARMED/);
  assert.match(html, /UNARMED/);
  assert.match(html, /NO CAPTURE/);
  assert.match(html, /NO DATA/);
  assert.match(html, /Awaiting an eligible AW source book/);
  assert.doesNotMatch(html, /£0\.00|>0\.0%</);

  const missed = buildAwProfitabilityReport(date, emptyTissueGeneration(), [empty, sameOr, support], now, { status: "missed" });
  assert.match(missed.policies[0].noCapture, /window was missed/);
  const badLedger = buildAwProfitabilityReport(date, emptyTissueGeneration(), [{ status: "rejected", reason: new Error("invalid") }, sameOr, support], now);
  assert.match(renderToStaticMarkup(<AwDailyProfitability report={badLedger} />), /UNAVAILABLE/);
});

test("pending, NR, void and incomplete markets preserve decisions and keep stakes separate", () => {
  const [profit, sameOr, support] = structuredClone(loaded);
  assert.ok(profit.status === "fulfilled" && profit.value && sameOr.status === "fulfilled" && sameOr.value);
  const chosen = profit.value.races.filter(r => r.raceDate === date && r.picks.AW_PROFIT_V3 !== null).slice(0, 3);
  assert.equal(chosen.length, 3);
  const [pending, nr, voided] = chosen;
  pending.outcomes = {};
  for (const [race, status] of [[nr, "NR"], [voided, "void"]] as const) {
    const id = race.picks.AW_PROFIT_V3!;
    race.outcomes[id] = { status, settlementVersion: "canonical_settlement_v3", settledAt: "2026-11-22T17:00:00Z" };
  }
  pending.completeMarket = false;
  for (const runner of pending.runners) runner.medianBookmakerDecimal = null;
  profit.value.races = chosen;

  const unquoted = sameOr.value.observations.find(o => o.book.raceDate === date)!;
  unquoted.book.completeMarket = false;
  unquoted.decision = { ...unquoted.decision, selection: null, originalMarketRank: null, leaderWithoutSameOr: null, triggered: false };
  unquoted.outcomes = {};
  sameOr.value.observations = [unquoted];

  const report = buildAwProfitabilityReport(date, emptyTissueGeneration(), [profit, sameOr, support], now);
  assert.deepEqual(summarizeAwDecisions(report.policies[1].day.map(d => d.pick)),
    { recorded: 3, bets: 3, abstentions: 0, pending: 1, settled: 0, winners: 0, voids: 2, profit: null, roi: null });
  assert.equal(matchedAwDecisions(report.policies[2]).races, 0);
  const html = renderToStaticMarkup(<AwDailyProfitability report={report} />);
  for (const value of ["PENDING", "NON-RUNNER", "VOID", "Captured market rank unverified", "Bookmaker median unavailable", "Incomplete bookmaker market"]) {
    assert.ok(html.includes(value), value);
  }
});
