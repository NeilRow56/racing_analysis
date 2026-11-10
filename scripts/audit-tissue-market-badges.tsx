import { renderToStaticMarkup } from "react-dom/server";
import { loadTissueGeneration, attachTissueGeneration } from "../src/lib/racing/tissue-generation-forward";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { loadValueForward } from "../src/lib/racing/tissue-value-forward";
import { VALUE_COHORTS } from "../src/lib/racing/tissue-value-config";
import { frozenValueIndex } from "../src/lib/racing/tissue-value-view";
import { FrozenValueRankCell } from "../src/app/racing/today/tissue-cells";
import type { TodayMeeting } from "../src/lib/racing/todays-racing";

// Read-only replay of the audit's frozen T1/T2 books; no live odds or writes.
const date = process.argv[2] ?? "2026-11-10";
const data = await loadTissueGeneration();
const values = frozenValueIndex(await Promise.all(VALUE_COHORTS.map(c => loadValueForward(c))));
const counts = { positive: 0, neutral: 0, negative: 0, fallback: 0 };
const rows = [];
for (const book of latestPreOffCaptures(data.races).filter(r => r.raceDate === date)) {
  for (const row of book.runners.filter(r => r.rank <= 2)) {
    const meetings = [{ races: [{ raceId: book.raceId, raceDateTime: new Date(book.scheduledOff), runners: [{ runnerId: row.runnerId }] }] }] as TodayMeeting[];
    const active = attachTissueGeneration(meetings, data)[0].races[0].runners[0].activeTissue!;
    if (process.argv.includes("--legacy")) {
      delete active.marketProbability; delete active.completeMarket; delete active.bookIdentity; delete active.marketSource;
    }
    const html = renderToStaticMarkup(<FrozenValueRankCell runner={{ activeTissue: active, tissueGenerationActive: true, tissueValue: values.get(`${book.raceId}|${row.runnerId}`) }} kind="tissueRank" />);
    const state = (html.match(/data-tissue-market-state="(positive|neutral|negative)"/)?.[1] ?? "fallback") as keyof typeof counts;
    counts[state]++;
    rows.push({ raceId: book.raceId, horse: row.horseName, rank: row.rank, tissue: row.probability, market: active.marketProbability ?? null, edgePp: active.marketProbability == null ? null : (row.probability - active.marketProbability) * 100, capturedAt: book.capturedAt, bookIdentity: active.bookIdentity, complete: book.completeMarket, state });
  }
}
console.log(JSON.stringify({ date, counts, rows }, null, 2));
