import { isVoidBetResultStatus, settledWinValue } from "./backtest";

export const HURDLE_V3_SCHEMA = "hurdle_only_canonical_starters_mean_imputed_v1" as const;
export const HURDLE_V3_COMMENT_HALF_LIFE_DAYS = 90;
export const HURDLE_V3_COMMENT_MAX_AGE_DAYS = 180;
export type HurdleV3Prior = {
  runnerId: string; raceId: string; family: string; at: string;
  finishingPosition: number | null; resultStatus: string | null;
  speed: number | null; comment: string | null;
};
export type HurdleV3Participant = { starts: number; wins: number; latestAt: string | null };
export type HurdleV3Target = {
  runnerId: string; raceId: string; cutoff: string; scheduledOff: string;
  officialRating: number | null; age: number | null; weightLbs: number | null;
  trainer: HurdleV3Participant; jockey: HurdleV3Participant;
};
export const HURDLE_V3_CORE = [
  "official_rating", "latest_hurdle_speed", "best_l3_hurdle_speed", "average_l3_hurdle_speed",
  "trainer_starter_win_rate", "log_trainer_starters", "jockey_starter_win_rate", "log_jockey_starters",
  "completed_last3_hurdle_fraction", "official_rating_missing", "hurdle_history_missing",
  "hurdle_speed_missing_with_history", "trainer_history_missing", "jockey_history_missing",
] as const;
export const HURDLE_V3_SECONDARY = {
  recency: ["log_days_since_hurdle"], experience: ["log_prior_hurdle_starts"],
  latest_failure: ["latest_hurdle_pulled_up", "latest_hurdle_fell_unseated"],
  comments: ["hurdle_comment_jump_error_recent", "hurdle_comment_finish_recent", "hurdle_comment_weakened_recent"],
  age: ["age"], weight: ["weight_lbs"], speed_context: ["hurdle_speed_field_percentile"], or_context: ["or_field_percentile"],
} as const;
export const HURDLE_V3_ALL_FEATURES = [...HURDLE_V3_CORE, ...Object.values(HURDLE_V3_SECONDARY).flat()] as const;
export type HurdleV3Feature = typeof HURDLE_V3_ALL_FEATURES[number];
export type HurdleV3Raw = Record<HurdleV3Feature, number | null>;

/** A recorded outcome is required; NR/void are excluded before resolving a winner. */
export function canonicalHurdleV3Starter(run: Pick<HurdleV3Prior, "finishingPosition" | "resultStatus">): boolean {
  return !isVoidBetResultStatus(run.resultStatus) && settledWinValue({ ...run, won: null }) !== null;
}
export function hurdleV3PriorHistory(target: HurdleV3Target, history: readonly HurdleV3Prior[]): HurdleV3Prior[] {
  const cutoff = Date.parse(target.cutoff), off = Date.parse(target.scheduledOff);
  if (!Number.isFinite(cutoff) || !Number.isFinite(off) || cutoff > off) throw new Error("Invalid Hurdle V3 history cutoff");
  const seen = new Set<string>();
  return history.filter(run => {
    if (run.family !== "HURDLE" || run.raceId === target.raceId || !Number.isFinite(Date.parse(run.at)) ||
        Date.parse(run.at) >= cutoff || !canonicalHurdleV3Starter(run)) return false;
    if (seen.has(run.runnerId)) throw new Error("Duplicate Hurdle V3 source run");
    seen.add(run.runnerId); return true;
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.runnerId.localeCompare(b.runnerId));
}
function participant(input: HurdleV3Participant, cutoff: string) {
  if (!Number.isInteger(input.starts) || !Number.isInteger(input.wins) || input.wins < 0 || input.starts < input.wins ||
      (input.starts === 0 ? input.latestAt !== null : input.latestAt === null || !Number.isFinite(Date.parse(input.latestAt)) || Date.parse(input.latestAt) >= Date.parse(cutoff))) {
    throw new Error("Invalid or future Hurdle V3 participant prior");
  }
  return { rate: input.starts ? 100 * input.wins / input.starts : null, logStarts: Math.log1p(input.starts), missing: input.starts ? 0 : 1 };
}
const finite = (n: number | null) => n !== null && Number.isFinite(n) ? n : null;

/** No target result, odds, JPR, non-Hurdle speed, or preview text is accepted. */
export function buildHurdleV3Runner(target: HurdleV3Target, history: readonly HurdleV3Prior[]) {
  const prior = hurdleV3PriorHistory(target, history), last3 = prior.slice(0, 3), latest = prior[0];
  const speeds = last3.map(r => finite(r.speed)).filter((n): n is number => n !== null);
  const trainer = participant(target.trainer, target.cutoff), jockey = participant(target.jockey, target.cutoff);
  const commentRun = prior.find(r => Boolean(r.comment?.trim()) && (Date.parse(target.cutoff) - Date.parse(r.at)) / 86400000 <= HURDLE_V3_COMMENT_MAX_AGE_DAYS);
  const commentAge = commentRun ? (Date.parse(target.cutoff) - Date.parse(commentRun.at)) / 86400000 : null;
  const decay = commentAge === null ? 0 : Math.exp(-Math.LN2 * commentAge / HURDLE_V3_COMMENT_HALF_LIFE_DAYS);
  const text = commentRun?.comment ?? "";
  const weakened = /\b(?:weakened|faded|lost touch|never dangerous)\b/i.test(text);
  const strong = !weakened && /\b(?:stayed on|kept on (?:well|strongly)|ran on|finished strongly)\b/i.test(text);
  const jumpError = /\b(?:mistake|mistakes|not fluent|blunder|blundered|jumped left|jumped right)\b/i.test(text);
  const raw: HurdleV3Raw = {
    official_rating: finite(target.officialRating), latest_hurdle_speed: latest ? finite(latest.speed) : null,
    best_l3_hurdle_speed: speeds.length ? Math.max(...speeds) : null,
    average_l3_hurdle_speed: speeds.length ? speeds.reduce((a,b) => a+b,0)/speeds.length : null,
    trainer_starter_win_rate: trainer.rate, log_trainer_starters: trainer.logStarts,
    jockey_starter_win_rate: jockey.rate, log_jockey_starters: jockey.logStarts,
    completed_last3_hurdle_fraction: last3.length ? last3.filter(r => r.finishingPosition !== null).length / last3.length : null,
    official_rating_missing: finite(target.officialRating) === null ? 1 : 0,
    hurdle_history_missing: prior.length ? 0 : 1,
    hurdle_speed_missing_with_history: prior.length && !speeds.length ? 1 : 0,
    trainer_history_missing: trainer.missing, jockey_history_missing: jockey.missing,
    log_days_since_hurdle: latest ? Math.log1p((Date.parse(target.cutoff) - Date.parse(latest.at))/86400000) : null,
    log_prior_hurdle_starts: Math.log1p(prior.length),
    latest_hurdle_pulled_up: latest?.resultStatus === "pulled_up" ? 1 : 0,
    latest_hurdle_fell_unseated: latest && ["fell", "unseated", "unseated_rider"].includes(latest.resultStatus ?? "") ? 1 : 0,
    hurdle_comment_jump_error_recent: Number(jumpError)*decay,
    hurdle_comment_finish_recent: Number(strong)*decay,
    hurdle_comment_weakened_recent: Number(weakened)*decay,
    age: finite(target.age), weight_lbs: finite(target.weightLbs),
    hurdle_speed_field_percentile: null, or_field_percentile: null,
  };
  return { raw, provenance: {
    priorHurdleStarts: prior.length, priorRunnerIds: prior.map(r => r.runnerId),
    last3RunnerIds: last3.map(r => r.runnerId), speedRunnerIds: last3.filter(r => finite(r.speed) !== null).map(r => r.runnerId),
    commentRunnerId: commentRun?.runnerId ?? null, commentAgeDays: commentAge, commentText: commentRun?.comment ?? null,
    trainer: { ...target.trainer }, jockey: { ...target.jockey }, cutoff: target.cutoff,
  } };
}
export function buildHurdleV3Field(inputs: readonly { target: HurdleV3Target; history: readonly HurdleV3Prior[] }[]) {
  if (inputs.length < 2 || new Set(inputs.map(i => i.target.runnerId)).size !== inputs.length ||
      new Set(inputs.map(i => i.target.raceId)).size !== 1 || new Set(inputs.map(i => i.target.cutoff)).size !== 1) throw new Error("Invalid Hurdle V3 field");
  const rows = inputs.map(i => ({ runnerId: i.target.runnerId, ...buildHurdleV3Runner(i.target, i.history) }));
  for (const [parent, field] of [["official_rating", "or_field_percentile"], ["best_l3_hurdle_speed", "hurdle_speed_field_percentile"]] as const) {
    const known = rows.map(r => r.raw[parent]).filter((n): n is number => n !== null);
    for (const r of rows) { const value = r.raw[parent]; r.raw[field] = value === null || known.length < 2 ? null : 1 - known.filter(n => n > value).length / (known.length - 1); }
  }
  return rows;
}
