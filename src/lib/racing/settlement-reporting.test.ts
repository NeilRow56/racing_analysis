import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderForwardValueRecordedVersions } from "../../../scripts/report-forward-value";
import type { ForwardValueData } from "./forward-value";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { settlementReportGroups, settlementReportDisclosure } from "./settlement-reporting";
import { CANONICAL_SETTLEMENT_VERSION as v3, LEGACY_SETTLEMENT_VERSION as v2 } from "./research-settlement-version";
import { renderAwForwardReport, summarizeAwForward, type AwForwardData } from "./aw-forward-comparisons";
import { createRecord, renderSummary, renderReport, renderTprSummary, TRACKER_VERSION } from "../../../scripts/diagnose-tpr-vs-timewise-forward";

test("recorded V2, V3, unversioned and unknown outcomes remain separate without relabelling", () => {
  const rows = [{ settlementVersion: v2, money: 2 }, { settlementVersion: v3, money: 1.5 }, { money: 2 }];
  const before = JSON.stringify(rows), groups = settlementReportGroups(rows);
  assert.deepEqual(groups.map(g => g.rows.reduce((sum, r) => sum + r.money, 0)), [2, 1.5, 2]);
  assert.match(settlementReportDisclosure(rows), /MIXED SETTLEMENT VERSIONS/);
  assert.match(groups[0].label, /Legacy recorded V2/); assert.match(groups[1].label, /Corrected V3/);
  assert.match(groups[2].label, /unversioned/); assert.equal(JSON.stringify(rows), before);
});

test("AW mixed summary fails closed and CLI exposes separate original/V3 tables", async () => {
  const data: AwForwardData = JSON.parse(await readFile("data/research/aw-forward-comparisons.json", "utf8"));
  assert.ok(data.records.length);
  const base = { ...data.records[0], recordedPreRace: true, finalSp: 5, won: true, settledAt: "2026-11-11T12:00:00Z" };
  const mixed = { ...data, records: [{ ...base, settlementVersion: v2, uncappedReturn: 3, capped20Return: 3 }, { ...base, settlementVersion: v3, uncappedReturn: 2.5, capped20Return: 2.5 }] };
  const before = JSON.stringify(mixed);
  assert.throws(() => summarizeAwForward(mixed, true), /Mixed settlement versions/);
  const text = renderAwForwardReport(mixed);
  assert.match(text, /Legacy recorded V2/); assert.match(text, /Corrected V3/); assert.match(text, /MIXED SETTLEMENT/);
  assert.equal(summarizeAwForward({ ...data, records: [mixed.records[0]] }, true).find(s => s.id === base.comparisonIds[0])?.uncappedRoi, 2);
  assert.equal(summarizeAwForward({ ...data, records: [mixed.records[1]] }, true).find(s => s.id === base.comparisonIds[0])?.uncappedRoi, 1.5);
  assert.equal(JSON.stringify(mixed), before);
});

test("all TPR/Timewise text entrypoints split mixed versions and keep legacy arithmetic", () => {
  const base = createRecord({ raceDate: "2026-09-17", course: "Sandown", raceTime: "14:20", winner: "Alpha", winnerSp: 5,
    tprRank1: "Alpha", tprRank2: "Bravo", timewiseRank1: "Charlie", timewiseRank2: "Alpha", w50Rank1: "Bravo", orRank1: "Alpha", winnerOrRank: 1 });
  const data = { version: TRACKER_VERSION, races: [{ ...base, settlementVersion: v2 }, { ...base, settlementVersion: v3 }] };
  const before = JSON.stringify(data);
  for (const render of [renderReport, renderSummary, renderTprSummary]) {
    const text = render(data); assert.match(text, /MIXED SETTLEMENT VERSIONS/);
    assert.match(text, /Legacy recorded V2/); assert.match(text, /Corrected V3 recorded outcomes/);
  }
  assert.equal(JSON.stringify(data), before);
});

test("Rating CLI summaries disclose the recorded settlement basis", async () => {
  for (const name of ["aw", "jump"]) {
    const { stdout } = await promisify(execFile)(process.execPath, [`scripts/track-${name}-rating-forward.ts`, "summary"]);
    assert.match(stdout, /Settlement basis: retained recorded figures/);
    assert.match(stdout, /Legacy recorded|Corrected V3/);
    assert.match(stdout, /settled, non-void|rank-1/);
  }
});

test("Forward Value prints distinct retained monetary totals for V2 and V3", async () => {
  const data: ForwardValueData = JSON.parse(await readFile("data/research/forward-value-v1.json", "utf8"));
  const base = data.races.find(r => r.settledAt !== null && r.phase2ExclusionReason == null && r.recordedPreRace);
  assert.ok(base);
  const records = [{ ...base, settlementVersion: v2, capturedPriceProfitLoss: 2 }, { ...base, settlementVersion: v3, capturedPriceProfitLoss: 1.5 }];
  const before = JSON.stringify(records), text = renderForwardValueRecordedVersions(records);
  assert.match(text, /MIXED SETTLEMENT VERSIONS/);
  assert.match(text, /Legacy recorded V2.*settled stakes=1; captured-price P\/L=2/);
  assert.match(text, /Corrected V3.*settled stakes=1; captured-price P\/L=1.5/);
  assert.equal(JSON.stringify(records), before);
});
