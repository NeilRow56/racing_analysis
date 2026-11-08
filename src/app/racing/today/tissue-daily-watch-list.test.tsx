import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TISSUE_GENERATION, TISSUE_GENERATION_EPOCH, GENERATION_MODEL_HASHES } from "@/lib/racing/tissue-generation-config";
import { VALUE_RANK_VERSION } from "@/lib/racing/value-rank-v2";
import { buildTissueDailyWatchList, formatTissueDailyWatchList, isActiveTissueWatchCandidate } from "@/lib/racing/tissue-daily-watch-list";
import { attachTissueGeneration, emptyTissueGeneration, type GenerationRace } from "@/lib/racing/tissue-generation-forward";
import type { TodayMeeting, TodayRunner } from "@/lib/racing/todays-racing";
import { TissueDailyWatchList } from "./non-red-tissue-daily-list";
import { FrozenRacecardRanks } from "./tissue-cells";
import { AwTissueCell, JumpTissueCell } from "./tissue-cells";
import { RunnerResultRow, RunnerNonRunnerBadge } from "./runner-result-display";
import { isActiveValueOne } from "@/lib/racing/value-rank-v2";
import { isTissue1Value1Agreement } from "@/lib/racing/tissue-value-agreement";
import { isLongerPriceTissueTop2 } from "@/lib/racing/longer-price-tissue-watch";
import { isTissueTop2SpeedRankWatch } from "@/lib/racing/tissue-speed-rank-watch";
import { isLiveRunnerEligible } from "@/lib/racing/live-runner-eligibility";

function runner(id = "horse", rank = 1, price: number | null = 4.5): TodayRunner {
  return { runnerId: id, horseId: id, horseName: id, finishingPosition: null, resultStatus: null, oddsDecimal: "100",
    activeTissue: { generation: TISSUE_GENERATION, family: "CHASE", modelVersion: "CHASE_TISSUE_V2", rank, probability: .3,
      capturedAt: "2026-11-05T08:00:00.000Z", capturedPrice: price },
    tissueValue: { family: "CHASE", modelVersion: "JUMP_TISSUE_V1", valueTrackerVersion: "old-source", capturedAt: "2026-11-05T08:00:00.000Z",
      tissueRank: 99, probability: .2, valueRank: 99, activeValue1: false, valueSelectionVersion: VALUE_RANK_VERSION,
      marketPrice: 100, marketProbability: .01, marketRank: 10, modelMarketRatio: 20, bestL3SpeedRank: 2,
      inputReliability: { level: "CAUTION", reasons: ["Legacy annotation"] } },
  } as TodayRunner;
}
function meeting(course = "Worcester", time = "14:30", runners = [runner()]): TodayMeeting {
  return { courseName: course, races: [{ raceId: `${course}-${time}`, scheduledTime: time, raceDateTime: null, courseCountry: "ENG", winningTime: null, runners }] } as TodayMeeting;
}
function agree(r: TodayRunner, active = true, version: "VALUE_RANK_V1" | "VALUE_RANK_V2" = VALUE_RANK_VERSION) {
  Object.assign(r.tissueValue!, { valueRank: 1, activeValue1: active, valueSelectionVersion: version }); return r;
}

for (const [rank, price, expected] of [
  [1, 2.99, false], [1, 3, true], [1, 5.99, true], [1, 6, false],
  [2, 5.99, false], [2, 6, true], [2, 10.99, true], [2, 11, false],
  [3, 4.5, false], [1, null, false], [2, NaN, false],
] as const) test(`new-generation T${rank}, captured price ${price}: ${expected}`, () => {
  assert.equal(buildTissueDailyWatchList([meeting("Test", "14:00", [runner("Horse", rank, price)])]).length, expected ? 1 : 0);
});

test("active new T1 + active V2 agreement qualifies at any price, once", () => {
  for (const price of [null, 2, 4.5, 8, 35, 100]) {
    const input = [meeting("Test", "14:00", [agree(runner("Agreement", 1, price))])];
    const rows = buildTissueDailyWatchList([...input, ...input]);
    assert.equal(rows.length, 1); assert.equal(rows[0].agreement, true);
    assert.equal(formatTissueDailyWatchList(rows), "Test 14:00 Agreement — T1 — T1=V1");
  }
});

test("agreement never borrows legacy V1, rejected V2, Value 2, or old Tissue rank", () => {
  for (const r of [agree(runner("V1", 1, 35), true, "VALUE_RANK_V1"), agree(runner("Rejected", 1, 35), false),
    agree(runner("New T2", 2, 35))]) assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [r])]), []);
  const value2 = agree(runner("Value 2", 1, 35)); value2.tissueValue!.valueRank = 2;
  assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [value2])]), []);
  const missingFlag = agree(runner("Missing V2 flag", 1, 35)); delete missingFlag.tissueValue!.activeValue1;
  assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [missingFlag])]), []);
  const unknownVersion = agree(runner("Unknown version", 1, 35)); delete unknownVersion.tissueValue!.valueSelectionVersion;
  assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [unknownVersion])]), []);
  const t2 = agree(runner("New T2", 2, 8)); t2.tissueValue!.tissueRank = 1;
  const row = buildTissueDailyWatchList([meeting("Test", "14:00", [t2])])[0];
  assert.equal(row.tissueRank, 2); assert.equal(row.agreement, false);
});

test("retired Speed, Shadow and reliability annotations never change active membership or text", () => {
  for (const rank of [1, 2]) for (const speed of [1, 2, 3, 4, null, undefined]) for (const level of ["GOOD", "CAUTION", "UNKNOWN"] as const) {
    const r = runner("Horse", rank, rank === 1 ? 4.5 : 8);
    Object.assign(r.tissueValue!, { tissueRank: rank, bestL3SpeedRank: speed, inputReliability: { level, reasons: [] } });
    Object.assign(r, { chaseShadow: { rank: 1 }, jumpTissue: { rank: 1 }, awTissue: { rank: 2 } });
    const rows = buildTissueDailyWatchList([meeting("Test", "14:00", [r])]);
    assert.equal(rows.length, 1);
    assert.equal(formatTissueDailyWatchList(rows), `Test 14:00 Horse — T${rank}`);
  }
});

test("missing active-generation provenance never falls back to an old model or current odds", () => {
  for (const kind of ["absent", "missing provenance", "old generation"] as const) {
    const r = agree(runner("Legacy", 1, 4.5)); r.tissueValue!.tissueRank = 1; r.tissueValue!.marketPrice = 4.5;
    if (kind === "absent") delete r.activeTissue;
    else if (kind === "missing provenance") delete r.activeTissue!.generation;
    else r.activeTissue!.generation = "JUMP_TISSUE_V1";
    assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [r])]), []);
  }
  assert.equal(isActiveTissueWatchCandidate({ generation: "old", tissueRank: 1, capturedPrice: 4.5 }), false);
});

test("frozen generation price is used; later odds, SP, legacy Value price and current metrics cannot change membership", () => {
  const input = [meeting("Test", "14:00", [runner("Frozen", 1, 4.5)])], before = buildTissueDailyWatchList(input);
  for (const price of [2, 8, 100]) {
    const r = input[0].races[0].runners[0];
    Object.assign(r, { oddsDecimal: String(price), startingPriceDecimal: price, forecastDecimalOdds: price, bookmakerQuotes: [{ decimalOdds: price }], metrics: { priorRuns: 10 } });
    r.tissueValue!.marketPrice = price;
    assert.deepEqual(buildTissueDailyWatchList(input), before);
  }
});

test("chronological sorting, course tie break, BST display and copy text remain unchanged", () => {
  const input = [meeting("Kempton", "18:30"), meeting("Newbury", "13:50"), meeting("Cheltenham", "13:50")], original = structuredClone(input);
  assert.equal(formatTissueDailyWatchList(buildTissueDailyWatchList(input)), "Cheltenham 13:50 horse — T1\nNewbury 13:50 horse — T1\nKempton 18:30 horse — T1");
  assert.deepEqual(input, original);
  input[0].races[0].raceDateTime = new Date("2026-10-24T12:50:00Z");
  assert.equal(buildTissueDailyWatchList(input)[0].time, "13:50");
});

test("result updates decorate frozen qualifiers; canonical NRs leave active membership", () => {
  const input = [meeting("Test", "14:00", [agree(runner("Winner")), runner("PU", 2, 8), runner("NR", 2, 8)])];
  const before = buildTissueDailyWatchList(input); assert.ok(before.every(r => r.result === null));
  const race = input[0].races[0];
  race.runners[0].finishingPosition = 1; race.runners[0].resultStatus = "finished";
  race.runners[1].resultStatus = "pulled_up"; race.runners[2].resultStatus = "non_runner";
  const partial = buildTissueDailyWatchList(input); assert.equal(partial[0].result, null); assert.equal(partial.length, 2);
  race.winningTime = "1m 40s";
  const ended = buildTissueDailyWatchList(input);
  assert.deepEqual(ended.map(r => [r.runnerId, r.tissueRank, r.agreement]), before.slice(0, 2).map(r => [r.runnerId, r.tissueRank, r.agreement]));
  assert.deepEqual(ended.map(r => r.result!.label), ["WIN", "PU"]);
  assert.ok(formatTissueDailyWatchList(ended).includes("Winner — T1 — T1=V1 — WIN"));
});

test("active UI retains Copy/empty state/agreements and never renders retired markers", () => {
  const rows = buildTissueDailyWatchList([meeting("Test", "14:00", [agree(runner("Agreement"))])]);
  const html = renderToStaticMarkup(<TissueDailyWatchList date="5 November 2026" rows={rows} clipboardText={formatTissueDailyWatchList(rows)} />);
  assert.match(html, /Copy daily list/); assert.match(html, /active T1 3.00–&lt;6.00/); assert.match(html, /active T2 6.00–&lt;11.00/);
  assert.match(html, />T1=V1<\/span>/); assert.match(html, /1 selection · 1 race/);
  assert.doesNotMatch(html, /non-red|pale-red|Speed watch|Old research/);
  assert.match(renderToStaticMarkup(<TissueDailyWatchList date="5 November 2026" rows={[]} clipboardText="" />), /disabled=""/);
  const old = agree(runner("Old V1", 1, 35), true, "VALUE_RANK_V1");
  assert.ok(!renderToStaticMarkup(<FrozenRacecardRanks runner={old} />).includes(">T1=V1<"));
});

test("projection reads generation/rank/price from a frozen ledger without recreating captures", () => {
  const book: GenerationRace = {
    family: "CHASE", modelVersion: "CHASE_TISSUE_V2", modelHash: GENERATION_MODEL_HASHES.CHASE,
    raceId: "frozen-race", raceDate: "2026-11-05", course: "Test", scheduledOff: "2026-11-05T14:00:00.000Z",
    capturedAt: TISSUE_GENERATION_EPOCH, featureCutoffAt: TISSUE_GENERATION_EPOCH,
    featureNames: [], adjustmentFeatureNames: [], completeMarket: true, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: [1, 2].map(rank => ({ runnerId: `horse-${rank}`, horseId: `horse-${rank}`, horseName: `Horse ${rank}`,
      rank, probability: rank === 1 ? .6 : .4, modelInputs: [], adjustmentInputs: [], capturedPrice: 4.5,
      quotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: 4.5 }], outcome: null })),
  };
  const data = { ...emptyTissueGeneration(), races: [book] }, before = structuredClone(data);
  const card = meeting("Test", "14:00", [runner(book.runners[0].runnerId)]);
  card.races[0].raceId = book.raceId;
  const attached = attachTissueGeneration([card], data)[0].races[0].runners[0].activeTissue!;
  assert.equal(attached.generation, TISSUE_GENERATION); assert.equal(attached.rank, book.runners[0].rank);
  assert.equal(attached.capturedPrice, book.runners[0].capturedPrice); assert.equal(attached.capturedAt, book.capturedAt);
  assert.deepEqual(data, before);
  card.races[0].runners[0].resultStatus = "non_runner";
  const projected = attachTissueGeneration([card], data);
  assert.deepEqual(buildTissueDailyWatchList(projected), []);
  assert.equal(projected[0].races[0].runners[0].activeTissue!.rank, book.runners[0].rank);
  assert.deepEqual(data, before, "NR projection cannot rewrite a generation capture");
});

for (const name of ["Wal Buck's", "Cavalry Call", "Bethpage Theatre", "They're Chancers", "Baron Du Brizais", "Off The Jury"]) {
  test(`${name}: NR keeps frozen observations but loses all live selection emphasis`, () => {
    // Exercise both top ranks even where the actual horse had a lower captured rank.
    for (const rank of [1, 2]) {
      const r = agree(runner(name, rank, rank === 1 ? 4.5 : 8));
      r.tissueValue!.tissueRank = rank;
      const observations = structuredClone({ tissue: r.activeTissue, value: r.tissueValue });
      assert.equal(buildTissueDailyWatchList([meeting("Test", "14:00", [r])]).length, 1);
      r.resultStatus = "non_runner";
      assert.deepEqual(buildTissueDailyWatchList([meeting("Test", "14:00", [r])]), []);
      const html = renderToStaticMarkup(<table><tbody><RunnerResultRow runner={r} hasConclusiveResult={false}>
        <td>{name}<RunnerNonRunnerBadge runner={r} /><FrozenRacecardRanks runner={r} shadowRank={1} />
          <AwTissueCell runner={r} /><JumpTissueCell runner={r} /></td>
      </RunnerResultRow></tbody></table>);
      assert.match(html, /line-through/); assert.match(html, />NR<\/span>/);
      assert.match(html, new RegExp(`Frozen Tissue ${rank}`)); assert.match(html, /Frozen Value 1/);
      assert.doesNotMatch(html, /bg-slate-900|bg-blue-800|T1=V1|Longer-price Tissue watch|border-red-200|Shadow 1/);
      assert.deepEqual({ tissue: r.activeTissue, value: r.tissueValue }, observations);
    }
  });
}

test("live helper guards cannot qualify a canonical NR and do not promote a replacement", () => {
  const candidate = { resultStatus: "non_runner", generation: TISSUE_GENERATION, tissueRank: 1, activeTissueRank: 1,
    valueRank: 1, activeValue1: true, valueSelectionVersion: VALUE_RANK_VERSION, capturedPrice: 8, bestL3SpeedRank: 2 };
  assert.equal(isLiveRunnerEligible(candidate), false);
  assert.equal(isActiveTissueWatchCandidate(candidate), false);
  assert.equal(isActiveValueOne(candidate), false);
  assert.equal(isTissue1Value1Agreement(candidate), false);
  assert.equal(isLongerPriceTissueTop2(candidate), false);
  assert.equal(isTissueTop2SpeedRankWatch(candidate), false);
  const nr = agree(runner("Original T1")); nr.resultStatus = "non_runner";
  const second = runner("Original T2", 2, 8), before = structuredClone(second);
  assert.equal(isLiveRunnerEligible(second), true);
  const rows = buildTissueDailyWatchList([meeting("Test", "14:00", [nr, second])]);
  assert.deepEqual(rows.map(r => [r.runnerId, r.tissueRank]), [["Original T2", 2]]);
  assert.deepEqual(second, before);
});
