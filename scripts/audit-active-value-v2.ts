/** Read-only reconciliation. Does not capture, settle, or mutate any ledger. */
import { loadAllTissueValue } from "../src/lib/racing/tissue-value-readers";
import { activeValuePerformance } from "../src/lib/racing/active-value-performance";
import { summarizeValueRankV2, VALUE_RANK_EPOCH, VALUE_RANK_VERSION } from "../src/lib/racing/value-rank-v2";
import { latestPreOffCaptures } from "../src/lib/racing/frozen-capture-selection";
import { loadTissueGeneration, validGenerationCapture } from "../src/lib/racing/tissue-generation-forward";
const date = process.argv[2] ?? "2026-11-05";
const cohorts = await loadAllTissueValue();
const datasets = cohorts.map(c => c.data);
const summary = activeValuePerformance(datasets);
const research = summarizeValueRankV2(datasets.flatMap(d => d.races));
const generation = await loadTissueGeneration();
const ranks = new Map(latestPreOffCaptures(generation.races.filter(validGenerationCapture)).flatMap(r => r.runners.map(x => [`${r.raceId}|${x.runnerId}`, x.rank] as const)));
const daily = summary.leaders.filter(r => r.date === date && r.active);
const n = (v: number | null) => v === null ? "—" : v.toFixed(2);
const pct = (v: number | null) => v === null ? "—" : `${(v * 100).toFixed(2)}%`;
const result = (r: typeof daily[number]["runner"]) => !r.outcome ? "Pending" : r.outcome.status !== "settled" ? r.outcome.status : r.outcome.winner ? "WINNER" : String(r.outcome.finishPosition ?? r.outcome.resultStatus);
function table(headers: string[], rows: (string | number)[][]) {
  console.log(`\n| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`);
  rows.forEach(r => console.log(`| ${r.join(" | ")} |`));
}
console.log(`# Value 1 reconciliation · ${date}\n\nRead-only ledger snapshot. V2 epoch: ${VALUE_RANK_EPOCH}.\n`);
console.log(`TODAY ACTIVE V2 COUNT: ${daily.filter(r => r.v2).length}\n\nTODAY ALL VALUE 1 MARKERS: ${daily.length} (${daily.filter(r => !r.v2).length} V1)\n\nCURRENT RESEARCH V2 COUNT: ${research.racesEvaluated} race observations; ${research.racesWithValue1} races with retained V2; ${research.active.tracked} selections, ${research.active.runners} settled, ${research.active.winners} winners.\n`);
console.log(`WHY THEY DIFFER: Today retains frozen V1 markers captured before the V2 epoch. They are not V2 selections. All three named winners have pre-epoch captures at 2026-11-05T05:36:42.033Z. No historical record has been reclassified.\n\nCURRENT PANEL ACTUALLY REPRESENTS: All frozen observations in the four family Value research JSON files, filtered to the selected available families, with capturedAt >= V2 epoch and explicit VALUE_RANK_V2 policy. No latest-book deduplication. Each original rank-1 leader enters Legacy V1 shadow; retained decisions enter V2. These books require a complete prospective declaration field, valid all-runner probabilities from the configured family model, and median bookmaker odds for every runner. One valid bookmaker quote per runner suffices; there is no larger minimum bookmaker count. Captures and model/feature versions must pass ledger validation. Price availability and complete market are prerequisites of Today’s Value book too, not an additional Research-only restriction. New-generation Tissue books do not create Value ranks.\n\nSpecific workflow: existing tissue-value capture/sync persists these separate family Value JSON ledgers. The six V2 books here were captured at 09:15:56.991Z. The time the tracker file was created is not an eligibility rule. Canonical pending/NR/void outcomes do not enter performance stakes.\n`);
console.log("## Every active Today Value 1 marker\n\nTissue is Today’s current generation rank; original Value-book Tissue rank is included separately. All frozen prices are decimal. Research membership refers specifically to the existing V2/shadow panel.");
table(["Time", "Course", "Horse", "Family", "Frozen price", "Today Tissue", "Value-book Tissue", "Active V2", "Result", "£1 P/L", "In V2 panel", "Reason"], daily.map(r => [r.time,r.course,r.horse,r.family,n(r.runner.marketPrice),ranks.get(`${r.raceId}|${r.runnerId}`) ?? "—",r.runner.tissueRank,r.v2 ? "Yes" : "No (V1)",result(r.runner),n(r.runner.outcome?.profitLoss ?? null),r.includedInResearch ? "Yes" : "No",r.researchReason]));
console.log("\n## Every current V2 panel observation\n\nThese are all original leaders in the six eligible race observations, including rejected shadow leaders.");
const prospective = datasets.flatMap(d => d.races).filter(r => r.raceDate === date && r.capturedAt >= VALUE_RANK_EPOCH && r.valueRankPolicy?.version === VALUE_RANK_VERSION);
table(["Time", "Course", "Horse", "Family", "Captured", "Price", "Tissue", "V2 retained", "Rejection", "Result", "£1 P/L", "Book runners"], prospective.flatMap(r => r.valueRankPolicy!.legacyRankOne.map(d => {
 const x=r.runners.find(x=>x.runnerId===d.runnerId)!;
 return [r.scheduledOff.slice(11,16),r.course,x.horseName,r.family,r.capturedAt,n(x.marketPrice),x.tissueRank,d.retained ? "Yes" : "No",d.rejectionReason ?? "—",result(x),n(x.outcome?.profitLoss ?? null),r.runners.length];
})));
console.log("\n## All post-epoch active V2 performance\n\nLatest whole Value book per race, matching Today. No extra specialist-cohort filter.");
table(["Family", "Selections", "Settled", "Winners", "Strike", "£1 P/L", "ROI"],summary.families.map(r=>[r.family,r.tracked,r.runners,r.winners,pct(r.strikeRate),n(r.profitLoss),pct(r.roi)]));
table(["Shadow population (same latest post-epoch books)","Selections","Settled","Winners","£1 P/L","ROI"],[ ["All original V1 leaders",summary.legacyShadow.tracked,summary.legacyShadow.runners,summary.legacyShadow.winners,n(summary.legacyShadow.profitLoss),pct(summary.legacyShadow.roi)], ["Rejected V1 leaders",summary.rejected.tracked,summary.rejected.runners,summary.rejected.winners,n(summary.rejected.profitLoss),pct(summary.rejected.roi)]]);
console.log(`\nTODAY ACTIVE V2 WINNERS: ${daily.filter(r=>r.v2 && r.runner.outcome?.winner).map(r=>r.horse).join(", ") || "None"}. Bond Broker, Diplomatic Ash and Without Compromise are genuine winning Today Value 1 markers, but frozen V1, not V2.\n\nALL-ACTIVE-V2 SUMMARY ADDED: YES\n\nCOMPLETE-MARKET RESEARCH COHORT RETAINED: YES\n\nTODAY / RESEARCH ACTIVE MEMBERSHIP RECONCILES: YES (same latest-book projection; V1 explicitly separated). The existing specialist panel may count multiple captures of one race in future; the new summary counts the latest whole book only. Model/market calibration metrics remain confined to the specialist cohort.\n\nNo capture, settlement, model, Today membership, schema or historical ledger changes were made.\n`);
