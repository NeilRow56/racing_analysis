import { trainerTargetingProtocol, type ObservationPeriod, type TrainerHypothesis, type settleTrainerCapture } from "./trainer-targeting";

type Row = ReturnType<typeof settleTrainerCapture>[number];
type MarketRow = Row & { profit: number; expected: number; credit: number; rank: number };
const isMarketRow = (row: Row): row is MarketRow => row.expected !== null;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const divide = (value: number, divisor: number) => divisor ? value / divisor : null;
const decimal = (value: number | null) => value === null ? "—" : value.toFixed(2);
const percent = (value: number | null) => value === null ? "—" : `${(100 * value).toFixed(1)}%`;
const pounds = (value: number | null) => value === null ? "—" : `${value < 0 ? "−" : ""}£${Math.abs(value).toFixed(2)}`;

function dateClusterInterval(rows: MarketRow[]) {
  const dates = [...Map.groupBy(rows, row => row.date).values()].map(group => ({
    credit: sum(group.map(row => row.credit)), expected: sum(group.map(row => row.expected)),
  }));
  let seed = 42;
  const samples = Array.from({ length: 2_000 }, () => {
    let credit = 0;
    let expected = 0;
    for (let draw = 0; draw < dates.length; draw++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const day = dates[Math.floor(seed / 2 ** 32 * dates.length)];
      credit += day.credit;
      expected += day.expected;
    }
    return credit / expected;
  }).sort((a, b) => a - b);
  return [samples[50], samples[1950]];
}

export function summarizeTrainerRows(rows: Row[]) {
  const settled = rows.filter(row => row.started);
  const market = settled.filter(isMarketRow);
  const raceStakes = [...Map.groupBy(market, row => row.raceId).entries()].map(([id, stakes]) => ({
    id, gross: sum(stakes.filter(row => row.won).map(row => row.profit + 1)),
    profit: sum(stakes.map(row => row.profit)),
  }));
  const winningRaces = raceStakes.filter(race => race.gross > 0).sort((a, b) => b.gross - a.gross || a.id.localeCompare(b.id));
  const expected = sum(market.map(row => row.expected));
  const profit = sum(market.map(row => row.profit));
  const winners = settled.filter(row => row.won).length;
  const dates = new Set(settled.map(row => row.date)).size;
  const horses = new Set(settled.map(row => row.horseId)).size;
  const floors = trainerTargetingProtocol.floors;
  const inconclusive = market.length < floors.stakes || expected < floors.expected ||
    new Set(market.map(row => row.date)).size < floors.dates || new Set(market.map(row => row.horseId)).size < floors.horses;
  const trimmed = (count: number) => winningRaces.length >= count && raceStakes.length > count
    ? sum(raceStakes.filter(race => !winningRaces.slice(0, count).includes(race)).map(race => race.profit)) : null;
  return {
    captured: rows.length, settled: settled.length, winners, strike: divide(winners, settled.length), market: market.length,
    expected: market.length ? expected : null, ae: divide(sum(market.map(row => row.credit)), expected),
    profit: market.length ? profit : null, roi: divide(profit, market.length), dates, horses,
    pending: rows.filter(row => row.state === "unresolved").length,
    nonRunners: rows.filter(row => row.state === "NR").length, voids: rows.filter(row => row.state === "void").length,
    incomplete: settled.length - market.length,
    incompleteRaces: new Set(settled.filter(row => !isMarketRow(row)).map(row => row.raceId)).size,
    afterOne: trimmed(1), afterTwo: trimmed(2), inconclusive,
    interval: inconclusive ? null : dateClusterInterval(market),
  };
}

function matchCell(row: MarketRow, hypothesis: TrainerHypothesis) {
  const { family, countryId, firstPrize, handicap, raceClass } = row.conditions;
  if (!countryId || !firstPrize || handicap === null) return null;
  const field = row.fieldSize <= 8 ? "≤8" : row.fieldSize <= 12 ? "9–12" : "13+";
  const quarter = Math.ceil(Number(row.date.slice(5, 7)) / 3);
  const classBand = raceClass === null ? "unavailable" : raceClass <= 3 ? "1–3" : "4–7";
  const prizeBand = firstPrize.amount >= trainerTargetingProtocol.definitions.haggas.firstPrizeMinimum ? "valuable" : "ordinary";
  return JSON.stringify([family, countryId, firstPrize.currency, handicap, field, quarter,
    hypothesis === "mullins" ? null : classBand, hypothesis === "haggas" ? null : prizeBand]);
}

export function compareTrainerControl(target: Row[], control: Row[], hypothesis: TrainerHypothesis) {
  const group = (rows: Row[]) => Map.groupBy(rows.filter(isMarketRow), row => matchCell(row, hypothesis));
  const targets = group(target);
  const controls = group(control);
  let stakes = 0;
  const a = { actual: 0, expected: 0, profit: 0 };
  const b = { actual: 0, expected: 0, profit: 0 };
  for (const [cell, selections] of targets) {
    const other = cell === null ? undefined : controls.get(cell);
    if (!other?.length) continue;
    const support = Math.min(selections.length, other.length);
    stakes += support;
    for (const [rows, total] of [[selections, a], [other, b]] as const) {
      const weight = support / rows.length;
      total.actual += sum(rows.map(row => row.credit)) * weight;
      total.expected += sum(rows.map(row => row.expected)) * weight;
      total.profit += sum(rows.map(row => row.profit)) * weight;
    }
  }
  return { stakes, targetAe: divide(a.actual, a.expected), controlAe: divide(b.actual, b.expected),
    targetRoi: divide(a.profit, stakes), controlRoi: divide(b.profit, stakes) };
}

function tableRow(label: string, rows: Row[]) {
  const m = summarizeTrainerRows(rows);
  return `| ${[label, m.captured, m.settled, m.winners, percent(m.strike), m.market, decimal(m.expected), decimal(m.ae),
    m.interval ? m.interval.map(decimal).join("–") : "—", pounds(m.profit), percent(m.roi), m.dates, m.horses, m.pending,
    m.nonRunners, m.voids, `${m.incomplete} / ${m.incompleteRaces}`, pounds(m.afterOne), pounds(m.afterTwo),
    m.inconclusive ? "INCONCLUSIVE" : "Floors met"].join(" | ")} |`;
}

export function renderTrainerTargetingReport(rows: Row[], period: ObservationPeriod | null, fixture = false) {
  const hypotheses = [
    ["haggas", "William Haggas", "Valuable AW/Turf handicaps"],
    ["mullins", "Willie Mullins", "All Grade 1 declarations"],
    ["cromwell", "Gavin Cromwell", "Punchestown Chase/Hurdle"],
  ] as const;
  const lines = [
    "# TRAINER TARGETING — PROSPECTIVE MONITORING", "",
    ...(fixture ? ["**FIXTURE EXAMPLE.** Historical test inputs with simulated capture times and edited scenarios.", ""] : []),
    period ? `London racing dates **${period.from}** to **${period.until}** (end exclusive). Activated ${period.activatedAt}.`
      : "**Collection inactive.** The observation period will be frozen at activation.",
    "", `Protocol \`${trainerTargetingProtocol.version}\` · Settlement \`${trainerTargetingProtocol.settlement}\`.`, "",
    "Market A/E and £1 win returns use the same complete final-SP books. A/E uses fractional dead-heat credit. Independent dates are distinct London racing dates. The comparison floors require 30 complete-book stakes, 3 expected winners, 10 dates and 15 horses. Meeting the floors only establishes reporting coverage.",
    "",
    "The sensitivity columns remove every stake in the one or two races with the largest gross winning payouts. An em dash indicates unavailable evidence.",
    "",
    "| Cohort | Captured | Settled starters | Winners | Strike rate | Market stakes | SP-expected winners | Market A/E | Date-cluster 95% A/E | £1 SP P/L | ROI | Dates | Horses | Pending | NR | Void | Incomplete starters / races | P/L excl. 1 race | P/L excl. 2 races | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  const comparisons = [];
  for (const [key, name, label] of hypotheses) {
    const target = rows.filter(row => row.eligibility?.hypothesis === key && row.eligibility.group === "target");
    const control = rows.filter(row => row.eligibility?.hypothesis === key && row.eligibility.group === "control");
    lines.push(tableRow(`${name} · ${label}`, target));
    if (key === "mullins") {
      lines.push(tableRow("Mullins · Final-SP favourites", target.filter(row => row.rank === 1)));
      lines.push(tableRow("Mullins · Final-SP non-favourites", target.filter(row => row.rank !== null && row.rank > 1)));
    }
    const rankScope = (row: Row) => key !== "mullins" || (row.rank !== null && row.rank > 1);
    const matched = compareTrainerControl(target.filter(rankScope), control.filter(rankScope), key);
    const races = new Set(target.filter(rankScope).filter(isMarketRow).map(row => row.raceId));
    const rivals = summarizeTrainerRows(rows.filter(row => races.has(row.raceId) && row.trainerId &&
      row.trainerId !== trainerTargetingProtocol.definitions[key].trainerId && rankScope(row)));
    comparisons.push(`| ${name} | ${control.length} | ${matched.stakes} | ${decimal(matched.targetAe)} / ${decimal(matched.controlAe)} | ${percent(matched.targetRoi)} / ${percent(matched.controlRoi)} | ${rivals.market} | ${decimal(rivals.ae)} | ${percent(rivals.roi)} |`);
  }
  return [...lines, "",
    "Mullins's final-SP categories include ranked starters only. Joint favourites share rank 1. Pending, refunded and unranked declarations are included in the all-declarations row.",
    "", "## Controls", "",
    "Common-support cells share race family, country, currency, handicap flag, final starter-count band, calendar quarter, class band and first-prize band. Matching drops prize band for Haggas and class band for Mullins. Each side uses the smaller cell count as its weight. Mullins comparisons use final-SP non-favourites. Rivals are other identified trainers in the same target races.",
    "",
    "| Trainer | Own controls captured | Matched stakes per side | Own A/E target / control | Own ROI target / control | Rival market stakes | Rival A/E | Rival ROI |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...comparisons, "",
  ].join("\n");
}
