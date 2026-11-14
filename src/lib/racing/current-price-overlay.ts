import { sql } from "drizzle-orm";
import type { createDbConnection } from "@/db";
import { getLocalRacingDate, parseSportingLifeBookmakerQuotes, type TodayMeeting, type TodayRace, type TodayRunner, type SportingLifeBookmakerQuote } from "./todays-racing";

// Display-only extensions: never add overlay fields to pinned collection types.
export type CurrentPriceRunner = TodayRunner & {
  currentBookmakerPrices?: { quotes: SportingLifeBookmakerQuote[]; retrievedAt: string };
};
export type CurrentPriceMeeting = Omit<TodayMeeting, "races"> & {
  races: (Omit<TodayRace, "runners"> & { runners: CurrentPriceRunner[] })[];
};

const PRE_RACE = new Set(["DORMANT", "PRE_RACE", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
export type CurrentPriceOverlay = {
  race_id: string;
  source_id: string;
  retrieved_at: string | Date;
  scheduled_off: string | Date;
  payload: unknown;
};

export function applicableCurrentPrices(race: TodayRace, overlay: CurrentPriceOverlay, now: Date) {
  const retrieved = new Date(overlay.retrieved_at);
  const off = new Date(overlay.scheduled_off);
  if (race.raceId !== overlay.race_id || race.sourceId !== overlay.source_id || !race.raceDateTime ||
      off.getTime() !== race.raceDateTime.getTime() || !(off > now) ||
      !(retrieved <= now) || now.getTime() - retrieved.getTime() > 300_000 ||
      !PRE_RACE.has(race.raceStage ?? "") || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || ![null, "non_runner"].includes(r.resultStatus))) return null;
  const p = overlay.payload as { raceSourceId?: string; raceDate?: string; off?: string; raceStage?: string;
    runners?: { runnerSourceId: string; horseSourceId: string; runnerStatus: string | null; available: boolean; bookmakerOdds: unknown }[] } | null;
  if (!p || p.raceSourceId !== race.sourceId || p.raceDate !== getLocalRacingDate(now) ||
      new Date(p.off ?? "").getTime() !== off.getTime() || !PRE_RACE.has(p.raceStage ?? "") ||
      !Array.isArray(p.runners) || p.runners.length !== race.runners.length) return null;
  const prices = new Map<string, { quotes: ReturnType<typeof parseSportingLifeBookmakerQuotes>; retrievedAt: string }>();
  for (const runner of p.runners) {
    if (!runner || !runner.horseSourceId || prices.has(runner.runnerSourceId) ||
        !race.runners.some(r => r.runnerSourceId === runner.runnerSourceId && r.resultStatus === runner.runnerStatus) || !Array.isArray(runner.bookmakerOdds)) return null;
    const quotes = parseSportingLifeBookmakerQuotes(runner.bookmakerOdds);
    const books = quotes.map(q => q.bookmakerId ?? q.bookmakerName);
    if (quotes.length !== runner.bookmakerOdds.length || runner.available !== (quotes.length > 0) ||
        books.some(book => book === null || book === "") || new Set(books).size !== books.length) return null;
    prices.set(runner.runnerSourceId, { quotes, retrievedAt: retrieved.toISOString() });
  }
  return prices;
}

/** Called only by the Today page after all frozen prediction/capture work is complete. */
export async function attachCurrentPriceOverlays(db: ReturnType<typeof createDbConnection>["db"], meetings: TodayMeeting[], raceDate: string, now = new Date()): Promise<CurrentPriceMeeting[]> {
  if (raceDate !== getLocalRacingDate(now)) return meetings;
  let rows;
  try {
    rows = await db.execute<CurrentPriceOverlay>(sql`
      select p.race_id, p.source_id, p.retrieved_at, p.scheduled_off, p.payload
      from race_current_prices p
      join races r on r.id = p.race_id and r.source = p.source and r.source_id = p.source_id
      join source_imports si on si.id = p.original_import_id and si.source = p.source
        and si.source_id = p.source_id and si.source_type = 'racecard-next-data'
        and si.fetched_at = p.original_fetched_at and md5(si.payload::text) = p.original_payload_hash
      where p.source = 'sporting_life' and r.race_date = ${raceDate}
        and r.race_datetime = p.scheduled_off and r.race_datetime > clock_timestamp()
        and r.off_time is null and nullif(trim(r.winning_time), '') is null
        and p.retrieved_at >= si.fetched_at and p.retrieved_at <= clock_timestamp() and p.retrieved_at >= clock_timestamp() - interval '5 minutes'
        and not exists (select 1 from source_imports result where result.source = r.source
          and result.source_id = r.source_id and result.source_type = 'full-result-next-data')
        and jsonb_array_length(p.payload->'runners') = (select count(*) from race_runners rr where rr.race_id = r.id)
        and not exists (
          select 1 from race_runners rr join horses h on h.id = rr.horse_id
          where rr.race_id = r.id and (rr.finishing_position is not null
            or (rr.result_status is not null and rr.result_status <> 'non_runner')
            or rr.source is distinct from p.source or h.source is distinct from p.source
            or not exists (select 1 from jsonb_array_elements(p.payload->'runners') runner
              where runner->>'runnerSourceId' = rr.source_id and runner->>'horseSourceId' = h.source_id
                and runner ? 'runnerStatus' and (runner->>'runnerStatus') is not distinct from rr.result_status))
        )
    `);
  } catch (error) {
    // Deployment may precede the additive migration. Only a missing table permits fallback.
    const cause = (error as { cause?: { code?: string }; code?: string });
    if ((cause.cause?.code ?? cause.code) === "42P01") return meetings;
    throw error;
  }
  return meetings.map(meeting => ({ ...meeting, races: meeting.races.map(race => {
    const overlay = rows.find(row => row.race_id === race.raceId);
    const prices = overlay && applicableCurrentPrices(race, overlay, now);
    return !prices ? race : { ...race, runners: race.runners.map(runner => ({ ...runner,
      currentBookmakerPrices: prices.get(runner.runnerSourceId ?? ""),
    })) };
  }) }));
}
