import { cleanAwTissueRace, type AwTissueRace } from "./aw-tissue-forward";
import { cleanShadowValue, isProspectiveShadow, SHADOW_PRICE_STAGES, type ShadowData } from "./aw-tissue-shadow-forward";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, forwardValuePriceSnapshot, isCleanPhase2Observation, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";

export type ShadowOperationalWarning = { code: "NO_CAPTURES" | "PARTIAL_CAPTURES" | "UNPRICED_CHANGED_LEADER" | "PRE_SHADOW_PRICE"; raceIds: string[]; message: string };

export function awShadowOperationalWarnings(
  data: ShadowData, sources: AwTissueRace[], forward: ForwardValueRecord[],
  cards?: { raceDate: string; raceIds: string[] },
): ShadowOperationalWarning[] {
  const warnings: ShadowOperationalWarning[] = [];
  const prospective = data.races.filter(isProspectiveShadow);
  if (cards) {
    const ids = [...new Set(cards.raceIds)];
    const captured = new Set(prospective.filter(r => r.raceDate === cards.raceDate).map(r => r.raceId));
    const missing = ids.filter(id => !captured.has(id));
    if (missing.length) warnings.push({ code: missing.length === ids.length ? "NO_CAPTURES" : "PARTIAL_CAPTURES", raceIds: missing,
      message: `${cards.raceDate}: ${ids.length} AW racecards, ${ids.length - missing.length} paired prospective captures; ${missing.length} missing. Run bun run sync:aw-shadow after the normal AW V1 sync and before off. Missing historical observations will not be backfilled.` });
  }
  for (const race of prospective) {
    const candidate = race.runners.find(r => r.candidateRank === 1), v1 = race.runners.find(r => r.v1Rank === 1);
    if (candidate && v1 && candidate.runnerId !== v1.runnerId && !SHADOW_PRICE_STAGES.some(stage => cleanShadowValue(race, candidate, stage, candidate.candidateProbability))) {
      warnings.push({ code: "UNPRICED_CHANGED_LEADER", raceIds: [race.raceId],
        message: `${race.raceDate} ${race.course} (${race.raceId}): candidate Top-1 ${candidate.horseName} differs from V1 ${v1.horseName}, but has no usable frozen price. Candidate leader value coverage is unavailable; no price is reconstructed.` });
    }
    const excluded = new Set<string>();
    function check(id: string | null, stage: string, price: ForwardValuePriceSnapshot | null | undefined) {
      if (!price || !race.runners.some(r => r.runnerId === id) || price.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION ||
          !Number.isFinite(price.decimalPrice) || price.decimalPrice <= 1 || !Number.isFinite(price.impliedProbability) ||
          Math.abs(price.impliedProbability - 1 / price.decimalPrice) > 1e-12 || !Number.isFinite(Date.parse(price.capturedAt))) return;
      if (Date.parse(price.capturedAt) < Date.parse(race.capturedAt)) excluded.add(`${id}/${stage}`);
    }
    const source = sources.find(r => r.raceId === race.raceId);
    if (source && cleanAwTissueRace(source)) for (const stage of SHADOW_PRICE_STAGES) check(source.top1, stage, source.prices[stage]);
    for (const fv of forward.filter(r => r.raceId === race.raceId && r.family === "aw" && isCleanPhase2Observation(r))) {
      for (const stage of SHADOW_PRICE_STAGES) {
        check(fv.leaderRunnerId, stage, forwardValuePriceSnapshot(fv, stage));
        check(fv.tissueRunnerId, stage, stage === "early" ? fv.tissueEarlyPriceSnapshot : stage === "t180" ? fv.tissueT180PriceSnapshot : fv.tissueT60PriceSnapshot);
      }
    }
    if (excluded.size) warnings.push({ code: "PRE_SHADOW_PRICE", raceIds: [race.raceId],
      message: `${race.raceDate} ${race.course} (${race.raceId}): frozen market snapshots ${[...excluded].join(", ")} predate the shadow prediction and are excluded from shadow value analysis. Probability observation is retained; later qualifying price stages remain usable.` });
  }
  return warnings;
}

export function renderAwShadowOperationalWarnings(warnings: ShadowOperationalWarning[]): string {
  return ["## Operational Coverage (Diagnostic / Forward Validation Only)", "", ...(
    warnings.length ? warnings.map(w => `- ${w.code}: ${w.message}`) : ["No observed coverage warnings. Today's racecards are checked only during sync."]
  ), ""].join("\n");
}
