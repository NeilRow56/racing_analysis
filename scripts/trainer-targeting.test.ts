import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import fixtures from "./fixtures/trainer-targeting-cards.json";
import { activateTrainerTargeting, appendTrainerCapture, captureTrainerImport, readTrainerCaptures } from "./trainer-targeting";
import {
  evidenceHash, makeTrainerCapture, observationPeriod, settleTrainerCapture, type ImportedCard,
} from "../src/lib/racing/trainer-targeting";
import { compareTrainerControl, renderTrainerTargetingReport, summarizeTrainerRows } from "../src/lib/racing/trainer-targeting-report";

const activation = new Date("2026-10-30T07:00:00Z");
const period = observationPeriod(activation);
type Fixture = typeof fixtures.punchestownCard | typeof fixtures.newmarketCard | typeof fixtures.punchestownResult | typeof fixtures.newmarketResult;
const race = <T extends Fixture>(fixture: T): T["props"]["pageProps"]["race"] => fixture.props.pageProps.race;
const course = (fixture: Fixture) => fixture.props.pageProps.meeting[0].meeting_summary.course;
const punchestown = () => structuredClone(fixtures.punchestownCard);
const newmarket = () => structuredClone(fixtures.newmarketCard);
const clock = (fixture: Fixture) => new Date(`${race(fixture).race_summary.date}T08:30:00Z`);
const card = (fixture: Fixture): ImportedCard => ({
  raceId: String(race(fixture).race_summary.race_summary_reference.id), sourceImportId: "fixture-import",
  sourceUrl: "https://www.sportinglife.com/fixture", importedAt: clock(fixture).toISOString(), payload: fixture,
});
const capture = (fixture: Fixture, now = clock(fixture)) =>
  makeTrainerCapture(card(fixture), period, race(fixture).race_summary.date, now);
const decided = (fixture: Fixture) => capture(fixture)?.runners.flatMap(row => row.eligibility ? [row.eligibility] : []) ?? [];

function mullins() {
  const fixture = punchestown();
  const result = structuredClone(fixtures.punchestownResult);
  const sourceRides = race(result).rides.slice(0, 3);
  fixture.props.pageProps.race.rides = sourceRides.map(source => {
    const ride = race(fixture).rides.find(ride => ride.ride_reference.id === source.ride_reference.id)!;
    return { ...ride, trainer: { business_reference: { id: 414 }, name: "Fixture Mullins" } };
  });
  result.props.pageProps.race.rides = sourceRides;
  for (const payload of [fixture, result]) {
    Object.assign(race(payload).race_summary, {
      name: "Fixture Grade 1 Hurdle", race_summary_reference: { id: 900001 }, race_class: "1", has_handicap: false, ride_count: 3,
    });
  }
  sourceRides[0].betting.current_odds = "1/1";
  sourceRides[1].betting.current_odds = "EVS";
  sourceRides[2].betting.current_odds = "5/1";
  return { fixture, result };
}

test("Haggas uses exact trainer ID, explicit handicap and published native first prize", () => {
  const fixture = newmarket();
  const source = race(fixture);
  for (const [purse, group] of [["24999.99 GBP", "control"], ["25000 GBP", "target"],
    ["24999.99 EUR", "control"], ["25000 EUR", "target"], ["25000 USD", undefined], ["25000", undefined]]) {
    source.prizes.prize[0].prize = purse!;
    assert.equal(decided(fixture)[0]?.group, group);
  }
  source.prizes.prize[0].prize = "25000 GBP";
  source.race_summary.course_surface.surface = "ALLWEATHER";
  assert.equal(capture(fixture)?.conditions.family, "aw");
  assert.deepEqual(decided(fixture), [{ hypothesis: "haggas", group: "target" }]);
  source.race_summary.has_handicap = false;
  assert.equal(capture(fixture), null);
  Reflect.deleteProperty(source.race_summary, "has_handicap");
  assert.equal(capture(fixture), null);
  source.race_summary.has_handicap = true;
  Reflect.deleteProperty(source.race_summary, "course_surface");
  Reflect.deleteProperty(source.race_summary, "going");
  assert.equal(capture(fixture), null);
  source.race_summary.course_surface = { surface: "TURF" };
  source.rides.find(ride => ride.trainer.business_reference.id === 193)!.trainer.business_reference.id = 1930;
  assert.equal(capture(fixture), null);
});

test("Mullins requires provider Grade 1 with Class 1 and captures every declaration without odds", () => {
  const { fixture } = mullins();
  const summary = race(fixture).race_summary;
  assert.deepEqual(decided(fixture), Array(3).fill({ hypothesis: "mullins", group: "target" }));
  for (const wrongClass of ["", "2"]) {
    summary.race_class = wrongClass;
    assert.deepEqual(decided(fixture), []);
  }
  summary.race_class = "1";
  summary.name = "Fixture Grade 1 or Grade 2 Hurdle";
  assert.deepEqual(decided(fixture), []);
  summary.name = "Fixture Grade 2 Hurdle";
  assert.deepEqual(decided(fixture), Array(3).fill({ hypothesis: "mullins", group: "control" }));
  Reflect.deleteProperty(summary, "has_handicap");
  assert.deepEqual(decided(fixture), []);
});

test("Cromwell uses exact course and trainer IDs, with every Punchestown Chase or Hurdle in scope", () => {
  const fixture = punchestown();
  assert.deepEqual(decided(fixture), [{ hypothesis: "cromwell", group: "target" }]);
  course(fixture).course_reference.id = 999;
  assert.deepEqual(decided(fixture), [{ hypothesis: "cromwell", group: "control" }]);
  course(fixture).course_reference.id = 341;
  race(fixture).race_summary.name = "Punchestown Gold Cup (Grade 1)";
  assert.equal(capture(fixture)?.conditions.family, "chase");
  assert.deepEqual(decided(fixture), [{ hypothesis: "cromwell", group: "target" }]);
  race(fixture).race_summary.name = "Punchestown Open NH Flat Race";
  assert.equal(capture(fixture), null);
});

test("one frozen 12-month window and a valid same-day morning before scheduled off", () => {
  assert.deepEqual([period.from, period.until], ["2026-10-31", "2027-10-31"]);
  assert.throws(() => observationPeriod(activation, "2026-10-30"));
  assert.throws(() => observationPeriod(activation, "2027-02-30"));
  assert.equal(observationPeriod(new Date("2028-02-27T20:00Z"), "2028-02-29").until, "2029-02-28");
  const fixture = punchestown();
  const date = race(fixture).race_summary.date;
  assert.equal(capture(fixture)?.scheduledOff, `${date}T14:38:00.000Z`);
  assert.equal(capture(fixture)?.capturedAt, `${date}T08:30:00.000Z`);
  assert.equal(capture(fixture, new Date(`${date}T12:00:00Z`)), null);
  assert.equal(capture(fixture, new Date("2026-11-08T08:30:00Z")), null);
  assert.equal(capture(fixture, new Date(`${date}T08:29:59Z`)), null);
  assert.equal(makeTrainerCapture({ ...card(fixture), raceId: "000" }, period, date, clock(fixture)), null);
  race(fixture).race_summary.time = "08:30";
  assert.equal(capture(fixture), null);
  race(fixture).race_summary.time = "09:00";
  for (const stage of ["", "OFF", "WEIGHEDIN"]) {
    race(fixture).race_summary.race_stage = stage;
    assert.equal(capture(fixture), null);
  }
  race(fixture).race_summary.race_stage = "DORMANT";
  const rides = race(fixture).rides;
  rides[1].ride_reference.id = rides[0].ride_reference.id;
  assert.equal(capture(fixture), null);
});

test("first capture is atomic under concurrent writes and immutable across refreshes", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainer-evidence-test-"));
  const handoff = await mkdtemp(join(tmpdir(), "trainer-handoff-test-"));
  try {
    const original = punchestown();
    const refreshed = punchestown();
    Object.assign(race(refreshed).race_summary, { going: "Changed on refresh" });
    const date = race(original).race_summary.date;
    const path = join(handoff, "947809.json");
    await writeFile(path, JSON.stringify(card(original)));
    assert.equal(await captureTrainerImport(date, handoff, root, () => clock(original)), 0);
    assert.deepEqual(await activateTrainerTargeting(root, activation), period);
    await assert.rejects(activateTrainerTargeting(root, activation, "2026-11-01"), /already/);
    const results = await Promise.all(Array.from({ length: 12 }, () => captureTrainerImport(date, handoff, root, () => clock(original))));
    assert.equal(results.reduce((a, b) => a + b), 1);
    const stored = join(root, "sporting-life-947809.json");
    const before = await readFile(stored);
    await writeFile(path, JSON.stringify(card(refreshed)));
    assert.equal(await captureTrainerImport(date, handoff, root, () => clock(refreshed)), 0);
    assert.deepEqual(await readFile(stored), before);
    const [evidence] = await Array.fromAsync(readTrainerCaptures(root, period));
    assert.deepEqual(evidence.payload, original);
    assert.equal(evidence.payloadHash, evidenceHash(original));
    await chmod(stored, 0o644);
    await writeFile(stored, before.toString().replace("DORMANT", "FINISHED"));
    await assert.rejects(Array.fromAsync(readTrainerCaptures(root, period)), /evidence mismatch/);
  } finally {
    await Promise.all([root, handoff].map(path => rm(path, { recursive: true, force: true })));
  }
});

test("deadline is checked again at append publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "trainer-deadline-test-"));
  try {
    const fixture = punchestown();
    const date = race(fixture).race_summary.date;
    race(fixture).race_summary.time = "08:31";
    const times = [clock(fixture), new Date(`${date}T08:31:00Z`)];
    assert.equal(await appendTrainerCapture(root, period, date, card(fixture), () => times.shift()!), false);
    assert.deepEqual(await Array.fromAsync(readTrainerCaptures(root, period)), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settles a retained full result by race, ride and horse identity", () => {
  const evidence = capture(punchestown())!;
  const result = structuredClone(fixtures.punchestownResult);
  const settled = settleTrainerCapture(evidence, result);
  assert.equal(settled.length, 9);
  assert.equal(settled.filter(row => row.started).length, 9);
  const target = settled.find(row => row.eligibility?.hypothesis === "cromwell")!;
  assert.equal(target.profit, -1);
  assert.ok(Math.abs(settled.reduce((total, row) => total + row.expected!, 0) - 1) < 1e-12);
  const changed = race(result).rides.find(ride => String(ride.ride_reference.id) === target.rideId)!;
  changed.horse.horse_reference.id = 1;
  assert.equal(settleTrainerCapture(evidence, result).find(row => row.rideId === target.rideId)?.state, "unresolved");
});

test("joint favourites, dead heats, non-runners, void races and incomplete SP books", () => {
  const { fixture, result } = mullins();
  const evidence = capture(fixture)!;
  const summary = race(result).race_summary;
  const rides = race(result).rides;
  rides[1].finish_position = 1;
  const settled = settleTrainerCapture(evidence, result);
  assert.deepEqual(settled.map(row => row.rank), [1, 1, 3]);
  assert.deepEqual(settled.map(row => row.credit), [0.5, 0.5, 0]);
  assert.deepEqual(settled.map(row => row.profit), [0, 0, -1]);
  rides[1].betting.current_odds = "";
  const gaps = summarizeTrainerRows(settleTrainerCapture(evidence, result));
  assert.deepEqual([gaps.settled, gaps.winners, gaps.market, gaps.incomplete, gaps.profit], [3, 2, 0, 3, null]);
  rides[1].betting.current_odds = "EVS";
  summary.ride_count = 4;
  assert.ok(settleTrainerCapture(evidence, result).every(row => row.rank === null));
  rides[1].ride_status = "NONRUNNER";
  summary.ride_count = 2;
  assert.deepEqual(settleTrainerCapture(evidence, result).map(row => row.state), ["win", "NR", "loss"]);
  summary.race_stage = "ABANDONED";
  assert.deepEqual(settleTrainerCapture(evidence, result).map(row => row.state), ["void", "NR", "void"]);
  summary.race_stage = "OFF";
  assert.deepEqual(settleTrainerCapture(evidence, result).map(row => row.state), ["unresolved", "NR", "unresolved"]);
});

test("whole-race largest winner sensitivity and common-support weights", () => {
  const { fixture, result } = mullins();
  const [winner, , loser] = settleTrainerCapture(capture(fixture)!, result);
  const rows = [
    { ...winner, raceId: "1", profit: 9 }, { ...loser, raceId: "1", profit: -1 },
    { ...winner, raceId: "2", profit: 5 }, { ...loser, raceId: "3", profit: -1 },
  ];
  const stats = summarizeTrainerRows(rows);
  assert.deepEqual([stats.profit, stats.afterOne, stats.afterTwo, stats.inconclusive], [12, 4, -1, true]);
  const matched = compareTrainerControl([winner, loser], [winner], "mullins");
  assert.equal(matched.stakes, 1);
  assert.equal(matched.targetRoi, (winner.profit! + loser.profit!) / 2);
  assert.equal(compareTrainerControl([winner], [{ ...winner, conditions: { ...winner.conditions, countryId: "99" } }], "mullins").stakes, 0);
});

test("reporting floors use complete-book stakes, dates and horses", () => {
  const { fixture, result } = mullins();
  const [winner] = settleTrainerCapture(capture(fixture)!, result);
  const rows = Array.from({ length: 32 }, (_, index) => ({
    ...winner, raceId: String(index), date: `2026-11-${String(index % 10 + 1).padStart(2, "0")}`,
    horseId: String(index % 16), expected: 0.125,
  }));
  const eligible = summarizeTrainerRows(rows);
  assert.equal(eligible.inconclusive, false);
  assert.ok(eligible.interval);
  assert.equal(summarizeTrainerRows(rows.slice(0, 29)).inconclusive, true);
  assert.equal(summarizeTrainerRows(rows.map(row => ({ ...row, expected: 0.0625 }))).inconclusive, true);
  assert.equal(summarizeTrainerRows(rows.map(row => ({ ...row, date: rows[0].date }))).inconclusive, true);
  assert.equal(summarizeTrainerRows(rows.map(row => ({ ...row, horseId: rows[0].horseId }))).inconclusive, true);
  assert.equal(summarizeTrainerRows(rows.map((row, index) => index < 3
    ? { ...row, expected: null, credit: null, profit: null, rank: null } : row)).inconclusive, true);
});

test("frozen epoch's morning entry point and package scripts retain their recorded hashes", async () => {
  const manifest = JSON.parse(await readFile("data/research/prospective-epochs-2026-11-11/activation.json", "utf8"));
  const { createHash } = await import("node:crypto");
  for (const path of ["scripts/run-research-workflow.ts", "package.json"]) {
    assert.equal(createHash("sha256").update(await readFile(path)).digest("hex"), manifest.sourceHashes[path]);
  }
});

test("fixture report shows the three cohorts and Mullins's final-SP split", async () => {
  const haggas = newmarket();
  race(haggas).prizes.prize[0].prize = "25000 GBP";
  const jump = mullins();
  const rows = [
    ...settleTrainerCapture(capture(haggas)!, fixtures.newmarketResult),
    ...settleTrainerCapture(capture(jump.fixture)!, jump.result),
    ...settleTrainerCapture(capture(punchestown())!, fixtures.punchestownResult),
  ];
  const markdown = renderTrainerTargetingReport(rows, period, true);
  assert.equal(markdown.trimEnd(), (await readFile("docs/trainer-targeting-fixture-report.md", "utf8")).trimEnd());
  assert.match(markdown, /FIXTURE EXAMPLE/);
  assert.match(markdown, /Willie Mullins · All Grade 1 declarations \| 3 \| 3 \|/);
  assert.match(markdown, /Final-SP favourites \| 2 \| 2 \|/);
  assert.match(markdown, /Final-SP non-favourites \| 1 \| 1 \|/);
  assert.equal((markdown.match(/INCONCLUSIVE/g) ?? []).length, 5);
});
