import { createDbConnection } from "@/db";
import { settleSelection, type BacktestSettlement } from "./backtest";
import { matchingMarketEdgeShadow, type HurdleMarketEdgeData } from "./hurdle-v3-market-edge";
import type { HurdleV3ShadowData, HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { hurdleShadowBook, hurdleShadowOutcome } from "./hurdle-v3-shadow-metrics";
import { settlementOutcomeState } from "./settlement-outcome";
import { parseSportingLifeEstimatedPrice } from "./tissue-forward";

export type HurdleFinalSpResultRow = {
  raceId: string;
  runnerId: string;
  raceStage: string | null;
  actualRunnerCount: number | null;
  resultRideCount: number | null;
  resultRideId: string | null;
  resultPosition: string | null;
  resultPrice: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  outcomeCode: string | null;
  startingPriceDecimal: string | null;
};

type ReconciledRunner = HurdleFinalSpResultRow & {
  state: "win" | "loss";
  deadHeatDivisor: number;
};
export type HurdleFinalSpResults = ReadonlyMap<string, ReadonlyMap<string, ReconciledRunner>>;

export function indexHurdleFinalSpResults(rows: HurdleFinalSpResultRow[]): HurdleFinalSpResults {
  const results = new Map<string, Map<string, ReconciledRunner>>();
  for (const [raceId, field] of Map.groupBy(rows, row => row.raceId)) {
    const first = field[0];
    if (field.length !== first.resultRideCount || new Set(field.map(r => r.runnerId)).size !== field.length ||
        new Set(field.map(r => r.resultRideId)).size !== field.length || field.some(r => !r.resultRideId || !r.raceStage)) continue;

    const evaluated = field.map(row => ({ row, state: settlementOutcomeState(row) }));
    const starters = evaluated.filter(r => r.state === "win" || r.state === "loss");
    const winners = starters.filter(r => r.state === "win").length;
    if (!winners || (first.actualRunnerCount !== starters.length && first.actualRunnerCount !== field.length) ||
        evaluated.some(r => r.state !== "NR" && r.state !== "win" && r.state !== "loss") ||
        starters.some(({ row }) => {
          const position = Number(row.resultPosition);
          const rawFinish = Number.isInteger(position) && position > 0 ? position : null;
          return rawFinish !== row.finishingPosition || (rawFinish !== null && rawFinish > starters.length);
        })) continue;

    const runners = new Map<string, ReconciledRunner>();
    for (const { row, state } of starters) {
      if (state === "win" || state === "loss") {
        runners.set(row.runnerId, { ...row, state, deadHeatDivisor: state === "win" ? winners : 1 });
      }
    }
    results.set(raceId, runners);
  }
  return results;
}

export async function loadHurdleFinalSpResults(observations: readonly HurdleV3ShadowObservation[]) {
  return loadVerifiedFinalSpResults(observations.filter(o => hurdleShadowOutcome(o) === "settled").map(o => o.raceId));
}

export async function loadVerifiedFinalSpResults(raceIds: readonly string[]) {
  const ids = [...new Set(raceIds)];
  if (!ids.length) return indexHurdleFinalSpResults([]);
  const { client } = createDbConnection();
  try {
    const rows = await client.begin("read only", query => query<HurdleFinalSpResultRow[]>`
      select r.id as "raceId", rr.id as "runnerId", r.actual_runner_count as "actualRunnerCount",
        result.race #>> '{race_summary,race_stage}' as "raceStage",
        jsonb_array_length(result.rides) as "resultRideCount",
        ride #>> '{ride_reference,id}' as "resultRideId", ride ->> 'finish_position' as "resultPosition",
        ride #>> '{betting,current_odds}' as "resultPrice",
        rr.finishing_position as "finishingPosition", rr.result_status as "resultStatus",
        rr.outcome_code as "outcomeCode", rr.starting_price_decimal as "startingPriceDecimal"
      from races r
      join race_runners rr on rr.race_id = r.id and rr.source = r.source
      join source_imports si on si.source = r.source and si.source_id = r.source_id
        and si.source_type = 'full-result-next-data'
      cross join lateral (
        select si.payload #> '{props,pageProps,race}' as race,
          case when jsonb_typeof(si.payload #> '{props,pageProps,race,rides}') = 'array'
            then si.payload #> '{props,pageProps,race,rides}' end as rides
      ) result
      left join lateral jsonb_array_elements(result.rides) ride on ride #>> '{ride_reference,id}' = rr.source_id
      where r.source = 'sporting_life' and r.id in ${query(ids)}
    `);
    return indexHurdleFinalSpResults(rows);
  } finally {
    await client.end();
  }
}

type FrozenRank = 1 | 2;
type Model = "V2" | "V3";
type FrozenResult = { finishPosition: number | null; winner: boolean | null; deadHeatDivisor: number };
type Exclusion = "resultUnavailable" | "outcomeMismatch" | "missingPrice" | "priceMismatch";
export type HurdleFinalSpPick = {
  raceId: string;
  runnerId: string;
  model: Model;
  modelVersion: string;
  rank: FrozenRank;
  finalSp: string | null;
  won: boolean;
} & ({ settlement: BacktestSettlement; exclusion?: never } | { settlement: null; exclusion: Exclusion });

function finalSpPicks(
  observation: HurdleV3ShadowObservation, model: Model, modelVersion: string, results: HurdleFinalSpResults,
): HurdleFinalSpPick[] {
  if (hurdleShadowOutcome(observation) !== "settled") return [];
  const field = results.get(observation.raceId);
  const book = hurdleShadowBook(observation, model);
  return ([1, 2] as const).flatMap((rank): HurdleFinalSpPick[] => {
    const runnerId = book.find(r => r.rank === rank)?.runnerId;
    const frozen = observation.production.runners.find(r => r.runnerId === runnerId)?.outcome;
    if (!runnerId || frozen?.status !== "settled") return [];
    const r = field?.get(runnerId);
    const pick = { raceId: observation.raceId, runnerId, model, modelVersion, rank, won: frozen.winner === true, finalSp: r?.resultPrice ?? null };
    return [{ ...pick, ...verifyFrozenFinalSp(field, runnerId, frozen) }];
  });
}

export function verifyFrozenFinalSp(
  field: ReadonlyMap<string, ReconciledRunner> | undefined,
  runnerId: string, frozen: FrozenResult,
): { settlement: BacktestSettlement; exclusion?: never } | { settlement: null; exclusion: Exclusion } {
  if (!field) return { settlement: null, exclusion: "resultUnavailable" };
  const r = field.get(runnerId);
  if (!r || r.finishingPosition !== frozen.finishPosition || (r.state === "win") !== frozen.winner ||
      r.deadHeatDivisor !== frozen.deadHeatDivisor) return { settlement: null, exclusion: "outcomeMismatch" };

  const price = parseSportingLifeEstimatedPrice(r.resultPrice);
  if (price === null || price <= 1 || !r.startingPriceDecimal) return { settlement: null, exclusion: "missingPrice" };
  // The database decimal is rounded to three places. Use the original fractional SP for settlement.
  const storedPrice = Number(r.startingPriceDecimal);
  if (!Number.isFinite(storedPrice) || Math.abs(price - storedPrice) > 0.0005000001) {
    return { settlement: null, exclusion: "priceMismatch" };
  }
  const settlement = settleSelection({
    ...r, targetRaceId: r.raceId, targetRunnerId: r.runnerId, won: frozen.winner === true, placed: null,
    startingPrice: r.resultPrice, startingPriceDecimal: String(price),
  });
  return settlement ? { settlement } : { settlement: null, exclusion: "outcomeMismatch" };
}

export function summarizeHurdleFinalSp(picks: readonly HurdleFinalSpPick[]) {
  const unique = [...new Map(picks.map(p => [`${p.model}|${p.raceId}|${p.runnerId}`, p])).values()];
  const settled = unique.flatMap(p => p.settlement ? [{ ...p, settlement: p.settlement }] : []);
  const sum = (rows: typeof settled) => rows.reduce((total, row) => total + row.settlement.profitLoss, 0);
  const stakes = settled.length, profit = stakes ? sum(settled) : null;
  // Rank each winning race by its largest individual return, then drop every stake in that race.
  const winningRaces = [...new Set(settled.filter(p => p.won)
    .sort((a, b) => b.settlement.grossReturn - a.settlement.grossReturn || a.raceId.localeCompare(b.raceId))
    .map(p => p.raceId))];
  const without = (count: number) => {
    if (winningRaces.length < count) return null;
    const removed = new Set(winningRaces.slice(0, count));
    const remaining = settled.filter(p => !removed.has(p.raceId));
    return remaining.length ? sum(remaining) : null;
  };
  return { stakes, eligible: unique.length, profit, roi: profit === null ? null : profit / stakes,
    withoutLargest: without(1), withoutTwoLargest: without(2) };
}

export function hurdleShadowFinalSp(data: HurdleV3ShadowData | null, results: HurdleFinalSpResults) {
  return (["V2", "V3"] as const).map(model => {
    const modelVersion = (model === "V2" ? data?.v2Version : data?.v3Version) ?? "";
    const picks = (data?.observations ?? []).flatMap(o => finalSpPicks(o, model, modelVersion, results));
    return { model, picks, rows: ([1, 2, "TOP2"] as const).map(rank => ({
      rank, ...summarizeHurdleFinalSp(picks.filter(p => rank === "TOP2" || p.rank === rank)),
    })) };
  });
}

export function hurdleEdgeFinalSp(data: HurdleMarketEdgeData | null, shadows: HurdleV3ShadowData | null, results: HurdleFinalSpResults) {
  return (data?.observations ?? []).flatMap(observation => {
    if (!observation.completeMarket || !shadows) return [];
    const shadow = matchingMarketEdgeShadow(observation, shadows.observations);
    if (!shadow) return [];
    return finalSpPicks(shadow, "V3", shadows.v3Version, results).flatMap(pick => {
      const frozen = observation.runners.find(r => r.runnerId === pick.runnerId && r.v3Rank === pick.rank);
      return frozen?.edgeBand ? [{ ...pick, edgeBand: frozen.edgeBand, speedEvidence: frozen.speedEvidence,
        marketRankBand: frozen.marketRankBand, form: observation.form }] : [];
    });
  });
}
