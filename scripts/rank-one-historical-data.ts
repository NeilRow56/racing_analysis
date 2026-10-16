import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { getHistoricalTargetRunnerMetrics, type HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { settleSelection, isVoidBetResultStatus } from "@/lib/racing/backtest";
import { loadFrozenTissueModel, TISSUE_V2_CONFIG, buildTissueForwardRace } from "@/lib/racing/tissue-forward";
import { loadJumpTissueModel, predictJumpTissue } from "@/lib/racing/jump-tissue-model";
import { loadAwTissueModel, predictAwTissue } from "@/lib/racing/aw-tissue-model";
import { loadJumpTissueCommentsForRaces } from "@/lib/racing/jump-tissue-sync";
import { loadAwTissuePriorStarts } from "@/lib/racing/aw-tissue-forward";
import { rankOneFamily } from "@/lib/racing/rank-one-forward";
import type { TodayRace } from "@/lib/racing/todays-racing";
export type Entry = {
  family: "FLAT TURF" | "HURDLE" | "CHASE" | "ALL WEATHER";
  year: string;
  raceId: string;
  runnerId: string;
  horseName: string;
  raceDate: string;
  sp: number;
  won: boolean;
  probability: number;
  rank: number;
  spProfit: number;
  qualifyingPrice: null;
  qualifyingProfit: null;
};
// The checkpoint belongs only to this diagnostic, never to the production cache/tracker population.
const checkpoint = "/tmp/rank-one-current-historical-population.json";
const modelPaths = [TISSUE_V2_CONFIG.modelPath, "data/research/jump-tissue-model-v1.json", "data/research/aw-tissue-model-v1.json"];
export async function historicalInputHashes() { return Object.fromEntries(await Promise.all(modelPaths.map(async (p) => [p, createHash("sha256").update(await readFile(p)).digest("hex")]))); }
export async function loadRankOneHistoricalData() {
  const hashes = await historicalInputHashes();
  // Allows report formatting to be rerun without repeating the expensive canonical reconstruction.
  if (process.env.RANK_ONE_REUSE_DIAGNOSTIC === "1") {
    const saved = JSON.parse(await readFile(checkpoint, "utf8")) as HistoricalData;
    if (JSON.stringify(saved.modelHashes) !== JSON.stringify(hashes))
      throw new Error("Diagnostic model checkpoint mismatch");
    return saved;
  }
  const connection = createDbConnection();
  connection.client.options.connection.default_transaction_read_only = true;
  try {
    const [turf, jump, aw] = await Promise.all([loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion), loadJumpTissueModel(), loadAwTissueModel()]);
    const data: HistoricalData = { entries: [], coverage: [], models: [{ family: "TURF", version: turf.version, checksum: turf.checksum }, { family: "HURDLE", version: jump.version, checksum: jump.checksum }, { family: "CHASE", version: jump.version, checksum: jump.checksum }, { family: "AW", version: aw.version, checksum: aw.checksum }], modelHashes: hashes, generatedAt: new Date().toISOString() };
    for (const year of ["2025", "2026"]) {
      const targets = await connection.client<{
        id: string;
        raceName: string | null;
        raceType: string | null;
        raceTypeCode: string | null;
        surface: string | null;
        going: string | null;
      }[]> `
    select r.id,r.race_name as "raceName",r.race_type as "raceType",r.race_type_code as "raceTypeCode",r.going,
     si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface
    from races r left join source_imports si on si.source=r.source and si.source_id=r.source_id and si.source_type='full-result-next-data'
    where r.source='sporting_life' and r.race_date>=${`${year}-01-01`} and r.race_date<=${`${year}-12-31`}`;
      for (const code of ["turf", "jump", "aw"] as const) {
        const ids = [...new Set(targets.filter(t => { const f = rankOneFamily(t); return code === "jump" ? (f === "HURDLE" || f === "CHASE") : code === "turf" ? f === "TURF" : f === "AW"; }).map(t => t.id))];
        console.log(`Current ${year} ${code}: ${ids.length} target races, canonical read-only reconstruction`);
        if (!ids.length)
          continue;
        const rows = await getHistoricalTargetRunnerMetrics(connection.db, { targetRaceIds: ids, ratingFamily: code, onTiming: (name, ms) => console.log(`${year} ${code} ${name}: ${Math.round(ms)}ms`) });
        const groups = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
        for (const r of rows)
          groups.set(r.features.targetRaceId, [...(groups.get(r.features.targetRaceId) ?? []), r]);
        const raceFrom = (field: HistoricalTargetRunnerMetricsRow[]): TodayRace => {
          const f = field[0]!.features;
          return { ...f, raceId: f.targetRaceId, sourceId: null, scheduledTime: "12:00", raceDateTime: f.raceDateTime, courseCountry: null, distance: null, winningTime: null,
            runners: field.filter(r => !isVoidBetResultStatus(r.outcome.resultStatus)).map(({ features: x }) => ({ ...x, runnerId: x.targetRunnerId, runnerSourceId: null, saddleclothNumber: null, horseSex: null, weight: null, odds: null, oddsDecimal: null,
              metrics: { ...x, latestAwPerformanceRating: x.latestPerformanceRating, averageAwPerformanceLast3: x.averagePerformanceLast3 } as unknown as TodayRace["runners"][number]["metrics"],
              trainerMetrics: x, jockeyMetrics: x, resultStatus: null, finishingPosition: null })) } as TodayRace;
        };
        const raceList = [...groups.values()].map(raceFrom);
        const comments = await loadJumpTissueCommentsForRaces(connection.client, raceList);
        const starts = code === "aw" ? await loadAwTissuePriorStarts(connection.client, raceList) : new Map<string, number>();
        for (const [id, field] of groups) {
          const f = field[0]!.features;
          const race = raceFrom(field), family = rankOneFamily(race);
          if (!family || (code === "turf" && family !== "TURF") || (code === "aw" && family !== "AW") || (code === "jump" && family !== "HURDLE" && family !== "CHASE"))
            continue;
          let coverage = data.coverage.find(c => c.family === family && c.year === year);
          if (!coverage) {
            coverage = { family, year, inputRaces: 0, scoredRaces: 0, missingSpStarters: 0, dateFrom: null, dateTo: null, exclusions: {} };
            data.coverage.push(coverage);
          }
          coverage.inputRaces++;
          const active = field.filter(r => !isVoidBetResultStatus(r.outcome.resultStatus));
          const winners = active.filter(r => r.outcome.finishingPosition === 1);
          const reason = active.length < 2 ? "small_field" : new Set(field.map(r => r.features.targetRunnerId)).size !== field.length ? "duplicate" :
            field.some(r => r.features.targetRaceId !== r.outcome.targetRaceId || r.features.targetRunnerId !== r.outcome.targetRunnerId) ? "identity_mismatch" :
              (race.actualRunnerCount !== active.length && race.actualRunnerCount !== field.length) ? "incomplete_field" :
                !winners.length || active.some(r => settleSelection({ ...r.outcome, startingPriceDecimal: "2" }) === null) ? "unresolved_outcome" : null;
          if (reason) {
            coverage.exclusions[reason] = (coverage.exclusions[reason] ?? 0) + 1;
            continue;
          }
          if (active.some(r => r.features.odds !== null || r.features.oddsDecimal !== null || (r.features.latestRunDate !== null && r.features.latestRunDate >= r.features.raceDate)))
            throw new Error(`Unsafe feature ${id}`);
          const book = family === "TURF" ? buildTissueForwardRace({ race, raceDate: f.raceDate, course: "Historical", model: turf, commentsByHorse: comments, recordedAt: new Date("2026-10-17"), config: { ...TISSUE_V2_CONFIG, forwardStart: "2025-01-01", forwardStartAt: undefined } })?.runners.map(r => ({ runnerId: r.runnerId, rank: r.tissueRank, probability: r.probability })) :
            family === "AW" ? predictAwTissue(race, starts, aw).runners : predictJumpTissue(race, comments, jump).runners;
          if (!book || book.some(r => r.rank === null || r.probability === null)) {
            coverage.exclusions.model_unavailable = (coverage.exclusions.model_unavailable ?? 0) + 1;
            continue;
          }
          coverage.scoredRaces++;
          coverage.dateFrom = coverage.dateFrom === null || f.raceDate < coverage.dateFrom ? f.raceDate : coverage.dateFrom;
          coverage.dateTo = coverage.dateTo === null || f.raceDate > coverage.dateTo ? f.raceDate : coverage.dateTo;
          const leader = book.filter(r => r.rank === 1).sort((a, b) => a.runnerId.localeCompare(b.runnerId))[0]!.runnerId;
          for (const row of active) {
            const prediction = book.find(p => p.runnerId === row.features.targetRunnerId)!;
            const won = row.outcome.finishingPosition === 1;
            const settlement = settleSelection({ ...row.outcome, won, deadHeatDivisor: won ? winners.length : 1 });
            if (!settlement) {
              coverage.missingSpStarters++;
              continue;
            }
            data.entries.push({ family: family === "TURF" ? "FLAT TURF" : family === "AW" ? "ALL WEATHER" : family, year, raceId: id, runnerId: row.features.targetRunnerId, horseName: row.features.horseName, raceDate: f.raceDate,
              sp: settlement.settlementOddsDecimal, won, probability: prediction.probability!, rank: row.features.targetRunnerId === leader ? 1 : 2, spProfit: settlement.profitLoss, qualifyingPrice: null, qualifyingProfit: null });
          }
        }
        console.log(JSON.stringify(data.coverage.filter(c => c.year === year)));
      }
    }
    if (JSON.stringify(hashes) !== JSON.stringify(await historicalInputHashes()))
      throw new Error("Production models changed during diagnostic");
    await writeFile(checkpoint, JSON.stringify(data));
    return data;
  }
  finally {
    await connection.client.end();
  }
}
type HistoricalData = {
  entries: Entry[];
  coverage: {
    family: string;
    year: string;
    inputRaces: number;
    scoredRaces: number;
    missingSpStarters: number;
    dateFrom: string | null;
    dateTo: string | null;
    exclusions: Record<string, number>;
  }[];
  models: {
    family: string;
    version: string;
    checksum: string;
  }[];
  modelHashes: Record<string, string>;
  generatedAt: string;
};
