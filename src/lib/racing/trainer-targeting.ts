import { createHash } from "node:crypto";
import { classifyCurrentRaceFamily } from "./current-race-classification";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isVoidRaceOutcome, settlementOutcomeState } from "./settlement-outcome";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { normalizeCompleteMarket, valueCompetitionRanks } from "./tissue-value-metrics";
import { parseSportingLifeEstimatedPrice } from "./tissue-forward";
import { getLocalRacingDate } from "./todays-racing";
import { winGrossReturn } from "./win-settlement";

export const trainerTargetingProtocol = {
  version: "trainer_targeting_prospective_v1",
  settlement: CANONICAL_SETTLEMENT_VERSION,
  source: "sporting_life",
  cardSource: "racecard-next-data",
  resultSource: "full-result-next-data",
  zone: "Europe/London",
  morningEndHour: 12,
  floors: { stakes: 30, expected: 3, dates: 10, horses: 15 },
  definitions: {
    haggas: { trainerId: "193", families: ["aw", "turf"], handicap: true, firstPrizeMinimum: 25_000, currencies: ["GBP", "EUR"], control: "ordinary flat handicaps" },
    mullins: { trainerId: "414", families: ["chase", "hurdle"], handicap: false, grade: 1, raceClass: 1, control: "other non-handicap jumps" },
    cromwell: { trainerId: "1287", families: ["chase", "hurdle"], courseId: "341", control: "jumps at other courses" },
  },
} as const;

export type TrainerHypothesis = keyof typeof trainerTargetingProtocol.definitions;
export type ObservationPeriod = { activatedAt: string; from: string; until: string; protocol: typeof trainerTargetingProtocol };
type Reference = { id?: number | string };
type Ride = {
  ride_reference?: Reference;
  horse?: { horse_reference?: Reference; name?: string };
  trainer?: { business_reference?: Reference; name?: string };
  ride_status?: string;
  finish_position?: number;
  casualty?: { type?: string; short_name?: string; name?: string; reason?: string };
  betting?: { current_odds?: string };
};
type Payload = { props?: { pageProps?: {
  meeting?: Array<{ meeting_summary?: {
    date?: string;
    meeting_reference?: Reference;
    course?: { course_reference?: Reference; country?: { country_reference?: Reference; long_name?: string } };
  } }>;
  race?: {
    race_summary?: {
      race_summary_reference?: Reference; meeting_summary_reference?: Reference;
      date?: string; time?: string; race_stage?: string; off_time?: string; winning_time?: string; hidden?: boolean;
      name?: string; race_type?: string; course_name?: string; going?: string; distance?: string; age?: string;
      course_surface?: { surface?: string }; race_class?: string | number; has_handicap?: boolean; ride_count?: number;
    };
    rides?: Ride[];
    prizes?: { prize?: Array<{ position?: number; prize?: string }> };
  };
} } };

export type ImportedCard = { raceId: string; sourceImportId: string; sourceUrl: string; importedAt: string; payload: unknown };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const preOff = new Set(["DORMANT", "PRE_RACE", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
const finalStages = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
const morningHour = new Intl.DateTimeFormat("en-GB", { timeZone: trainerTargetingProtocol.zone, hour: "2-digit", hourCycle: "h23" });
const id = (ref?: Reference) => /^\d+$/.test(String(ref?.id ?? "")) ? String(ref?.id) : null;
export const evidenceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function calendarDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return datePattern.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function observationPeriod(now: Date, start?: string): ObservationPeriod {
  const today = getLocalRacingDate(now);
  const tomorrow = calendarDate(today)!;
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const from = start ?? tomorrow.toISOString().slice(0, 10);
  const anniversary = calendarDate(from);
  if (!anniversary || from <= today) throw new Error("Choose a valid first London racing date after activation day.");
  const month = anniversary.getUTCMonth();
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
  return { activatedAt: now.toISOString(), from, until: anniversary.toISOString().slice(0, 10), protocol: trainerTargetingProtocol };
}

export function canCaptureMorning(period: ObservationPeriod, raceDate: string, now: Date) {
  return Number.isFinite(now.getTime()) && now >= new Date(period.activatedAt) &&
    raceDate >= period.from && raceDate < period.until && raceDate === getLocalRacingDate(now) &&
    Number(morningHour.format(now)) < trainerTargetingProtocol.morningEndHour;
}

function readSource(payload: unknown) {
  const props = (payload as Payload | null)?.props?.pageProps;
  const race = props?.race;
  const summary = race?.race_summary;
  const meeting = props?.meeting?.[0]?.meeting_summary;
  const raceId = id(summary?.race_summary_reference);
  const meetingId = id(summary?.meeting_summary_reference);
  const courseId = id(meeting?.course?.course_reference);
  if (!summary || !raceId || !courseId || !meetingId || meetingId !== id(meeting?.meeting_reference) ||
      !summary.date || (meeting?.date && meeting.date !== summary.date)) return null;
  return { race, summary, meeting, raceId, meetingId, courseId };
}

function identity(ride: Ride) {
  return {
    rideId: id(ride.ride_reference), horseId: id(ride.horse?.horse_reference), horseName: ride.horse?.name ?? null,
    trainerId: id(ride.trainer?.business_reference), trainerName: ride.trainer?.name ?? null,
    declaredStatus: ride.ride_status ?? null,
  };
}

function firstPrize(source: NonNullable<ReturnType<typeof readSource>>) {
  const prizes = source.race?.prizes?.prize;
  const entries = Array.isArray(prizes) ? prizes.filter(prize => prize?.position === 1) : [];
  const published = entries.length === 1 ? entries[0].prize : null;
  const match = typeof published === "string" && /^(\d+(?:\.\d+)?)\s+(GBP|EUR)$/.exec(published.trim());
  return match && Number.isFinite(Number(match[1])) ? { amount: Number(match[1]), currency: match[2] } : null;
}

function raceConditions(source: NonNullable<ReturnType<typeof readSource>>) {
  const { summary, courseId, meeting } = source;
  const classification = {
    raceName: summary.name, raceType: summary.race_type, courseName: summary.course_name,
    courseSourceId: courseId, surface: summary.course_surface?.surface, going: summary.going,
  };
  const subtype = classifyJumpRaceSubtype(classification);
  const classified = classifyCurrentRaceFamily(classification);
  const knownChaseTitle = /\b(?:irish gold cup|punchestown gold cup|willowwarm gold cup)\b/i.test(summary.name ?? "");
  const family = subtype === "hurdle" || subtype === "chase" ? subtype
    : classified === "jump" && knownChaseTitle ? "chase"
    : classified === "all_weather_flat" ? "aw"
    : classified === "turf_flat" && (classification.surface || classification.going || summary.race_type === "FLAT") ? "turf" : null;
  const grades = [...(summary.name ?? "").matchAll(/\bGrade\s+([1-3])\b/gi)].map(match => Number(match[1]));
  const classNumber = /^[1-7]$/.test(String(summary.race_class ?? "")) ? Number(summary.race_class) : null;
  return {
    family, name: summary.name ?? null, courseName: summary.course_name ?? null,
    countryId: id(meeting?.course?.country?.country_reference),
    country: meeting?.course?.country?.long_name ?? null,
    surface: classification.surface ?? null, going: summary.going ?? null,
    distance: summary.distance ?? null, age: summary.age ?? null, declaredCount: summary.ride_count ?? null,
    handicap: typeof summary.has_handicap === "boolean" ? summary.has_handicap : null,
    raceClass: classNumber,
    grades: [...new Set(grades)], firstPrize: firstPrize(source), stage: summary.race_stage,
  };
}

function placement(conditions: ReturnType<typeof raceConditions>, courseId: string, trainerId: string | null) {
  const { haggas, mullins, cromwell } = trainerTargetingProtocol.definitions;
  const { family, handicap, firstPrize, raceClass, grades } = conditions;
  if (trainerId === haggas.trainerId && (family === "aw" || family === "turf") && handicap === haggas.handicap && firstPrize) {
    return { hypothesis: "haggas", group: firstPrize.amount >= haggas.firstPrizeMinimum ? "target" : "control" } as const;
  }
  if (family !== "chase" && family !== "hurdle") return null;
  if (trainerId === mullins.trainerId && handicap === mullins.handicap) {
    if (grades.includes(mullins.grade)) {
      return raceClass === mullins.raceClass && grades.length === 1 ? { hypothesis: "mullins", group: "target" } as const : null;
    }
    return { hypothesis: "mullins", group: "control" } as const;
  }
  if (trainerId === cromwell.trainerId) return { hypothesis: "cromwell", group: courseId === cromwell.courseId ? "target" : "control" } as const;
  return null;
}

const unique = (values: (string | null)[]) => !values.includes(null) && new Set(values).size === values.length;
const nonRunner = (status?: string | null) => settlementOutcomeState({ resultStatus: status ?? null, finishingPosition: null }) === "NR";

export function makeTrainerCapture(card: ImportedCard, period: ObservationPeriod, raceDate: string, now: Date) {
  const source = readSource(card.payload);
  const summary = source?.summary;
  if (!source || !summary || source.raceId !== card.raceId || summary.date !== raceDate ||
      !card.sourceImportId || !card.sourceUrl || !summary.race_stage || !preOff.has(summary.race_stage) ||
      summary.hidden || summary.off_time || summary.winning_time || !canCaptureMorning(period, raceDate, now)) return null;
  const off = summary.time && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(summary.time)
    ? new Date(`${raceDate}T${summary.time.length === 5 ? summary.time + ":00" : summary.time}Z`) : null;
  const imported = new Date(card.importedAt);
  if (!off || !(now < off && imported <= now) || !canCaptureMorning(period, raceDate, imported)) return null;
  const rides = source.race?.rides;
  if (!Array.isArray(rides) || !rides.length || rides.some(ride => !ride || (ride.finish_position ?? 0) > 0 ||
      (ride.ride_status !== "RUNNER" && !nonRunner(ride.ride_status))) ||
      rides.filter(ride => !nonRunner(ride.ride_status)).length !== summary.ride_count) return null;
  const conditions = raceConditions(source);
  const runners = rides.map(ride => ({ ...identity(ride), eligibility: placement(conditions, source.courseId, id(ride.trainer?.business_reference)) }));
  if (!unique(runners.map(r => r.rideId)) || !unique(runners.map(r => r.horseId))) return null;
  if (!runners.some(r => r.eligibility)) return null;
  return {
    periodHash: evidenceHash(period), source: trainerTargetingProtocol.source, sourceType: trainerTargetingProtocol.cardSource,
    raceId: source.raceId, raceDate, courseId: source.courseId, meetingId: source.meetingId, conditions, runners,
    capturedAt: now.toISOString(), scheduledOff: off.toISOString(), importedAt: card.importedAt,
    sourceImportId: card.sourceImportId, sourceUrl: card.sourceUrl, payloadHash: evidenceHash(card.payload), payload: card.payload,
  };
}
export type TrainerCapture = NonNullable<ReturnType<typeof makeTrainerCapture>>;

function outcome(ride: Ride, stage: string) {
  const casualty = ride.casualty;
  const code = casualty?.type || casualty?.short_name || casualty?.name || casualty?.reason;
  return settlementOutcomeState({
    raceStage: stage, finishingPosition: (ride.finish_position ?? 0) > 0 ? ride.finish_position! : null,
    resultStatus: nonRunner(code) ? code! : ride.ride_status ?? null, outcomeCode: code,
  });
}

export function settleTrainerCapture(capture: TrainerCapture, resultPayload: unknown) {
  const source = readSource(resultPayload);
  const matched = source && source.raceId === capture.raceId && source.summary.date === capture.raceDate &&
    source.courseId === capture.courseId && source.meetingId === capture.meetingId;
  const stage = matched ? source.summary.race_stage ?? "" : "";
  const voidRace = isVoidRaceOutcome({ raceStage: stage, resultStatus: null, finishingPosition: null });
  const rides = matched && Array.isArray(source.race?.rides) && source.race.rides.every(Boolean) ? source.race.rides : [];
  const final = finalStages.has(stage);
  const results = rides.map(ride => {
    const price = parseSportingLifeEstimatedPrice(ride.betting?.current_odds ?? null);
    return { ...identity(ride), state: outcome(ride, stage), sp: price !== null && Number.isFinite(price) && price > 1 ? price : null };
  });
  const validRoster = unique(results.map(r => r.rideId)) && unique(results.map(r => r.horseId));
  const byRide = new Map(validRoster ? results.map(r => [r.rideId, r]) : []);
  const starters = results.filter(r => r.state === "win" || r.state === "loss");
  const winners = starters.filter(r => r.state === "win").length;
  const complete = final && validRoster && starters.length === source?.summary.ride_count && winners > 0 &&
    results.every(r => r.state === "NR" || r.state === "win" || r.state === "loss");
  const market = complete ? normalizeCompleteMarket(starters.map(r => r.sp)) : null;
  const ranks = market ? valueCompetitionRanks(starters.map(r => r.sp!), false) : [];
  const priced = new Map(market ? starters.map((r, i) => [r.rideId, { expected: market.probabilities[i], rank: ranks[i] }]) : []);

  return capture.runners.map(runner => {
    const result = byRide.get(runner.rideId);
    const state = result?.horseId === runner.horseId && result?.state === "NR" ? "NR" : voidRace ? "void"
      : final && result?.horseId === runner.horseId && result ? result.state : "unresolved";
    const started = state === "win" || state === "loss";
    const won = state === "win";
    const marketRow = started ? priced.get(runner.rideId) : undefined;
    const sp = marketRow ? result!.sp : null;
    return {
      ...runner, raceId: capture.raceId, date: capture.raceDate, conditions: capture.conditions,
      state, started, won, fieldSize: starters.length,
      rank: marketRow?.rank ?? null,
      expected: marketRow?.expected ?? null,
      credit: sp === null ? null : won ? 1 / winners : 0,
      profit: sp === null ? null : winGrossReturn({ won, decimalOdds: sp, deadHeatDivisor: winners }) - 1,
    };
  });
}
