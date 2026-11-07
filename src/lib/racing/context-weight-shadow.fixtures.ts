import { readFile } from "node:fs/promises";
import { CONTEXT_SHADOW_EPOCH, type ContextShadowFamily } from "./context-weight-shadow-config";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { buildContextWeightShadow, emptyContextWeightShadow } from "./context-weight-shadow-forward";
import type { GenerationRace } from "./tissue-generation-forward";
import type { predictContextWeightShadow } from "./context-weight-shadow-model";
import type { TodayMeeting, TodayRace } from "./todays-racing";

export const shadowModels = await loadTissueGenerationModels();
export const historicalShadowCases = (JSON.parse(await readFile(new URL("./__fixtures__/context-weight-shadow-regression.json", import.meta.url), "utf8")) as {
  cases: Array<{ family: ContextShadowFamily; book: GenerationRace; expected: ReturnType<typeof predictContextWeightShadow> }> }).cases;
export const shadowNow = new Date(Date.parse(CONTEXT_SHADOW_EPOCH) + 86400_000);
export function liveShadowBook(family: ContextShadowFamily = "AW", priced = false): GenerationRace {
  const book = structuredClone(historicalShadowCases.find(c => c.family === family)!.book);
  book.capturedAt = shadowNow.toISOString(); book.featureCutoffAt = book.capturedAt; book.raceDate = book.capturedAt.slice(0, 10);
  book.scheduledOff = new Date(shadowNow.getTime() + 7200_000).toISOString();
  if (priced) {
    book.completeMarket = true;
    book.runners.forEach((r, i) => { r.capturedPrice = 3 + i; r.quotes = [{ bookmakerId: 1, bookmakerName: "Fixture bookmaker", fractionalOdds: null, decimalOdds: 3 + i }]; });
  }
  return book;
}
export function liveShadowData(family: ContextShadowFamily = "AW", priced = false) {
  const book = liveShadowBook(family, priced), observation = buildContextWeightShadow(book, shadowModels[family], shadowNow)!;
  if (!observation) throw new Error("Invalid test shadow fixture");
  return { ...emptyContextWeightShadow(), observations: [observation] };
}
export function shadowResult(book: GenerationRace): TodayRace {
  return { raceId: book.raceId, raceName: "Fixture Handicap", raceType: "Flat", raceTypeCode: null,
    surface: book.family === "AW" ? "ALLWEATHER" : "Turf", going: book.family === "AW" ? "Standard" : "Good",
    raceDateTime: new Date(book.scheduledOff), actualRunnerCount: book.runners.length,
    runners: book.runners.map((r, i) => ({ runnerId: r.runnerId, horseId: r.horseId, resultStatus: "finished", finishingPosition: i + 1,
      activeTissue: { family: book.family, capturedAt: book.capturedAt, modelVersion: book.modelVersion, rank: r.rank, probability: r.probability } })),
  } as TodayRace;
}
export function shadowMeetings(book: GenerationRace): TodayMeeting[] {
  const race = shadowResult(book); race.runners.forEach(r => { r.resultStatus = null; r.finishingPosition = null; });
  return [{ courseName: book.course, races: [race] } as TodayMeeting];
}
