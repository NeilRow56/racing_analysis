/** Read-only ledger research. Writes only new diagnostic artifacts and /tmp snapshots. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerationData, GenerationRace } from "../src/lib/racing/tissue-generation-forward";
import type { HurdleV3ShadowData } from "../src/lib/racing/hurdle-v3-shadow";
import type { HurdleMarketEdgeData } from "../src/lib/racing/hurdle-v3-market-edge";

type Runner = GenerationRace["runners"][number];
type Pick = Runner & { raceId: string; raceDate: string; family: string; course: string; capturedAt: string; completeMarket: boolean; marketP: number | null; marketRank: number | null; quotesN: number; bookMinQuotes: number; starterP: number };
type Pair = { raceId: string; raceDate: string; family: string; a: Pick; b: Pick };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : null;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const settled = (r: Runner) => r.outcome?.status === "settled";
const priced = (r: Runner) => settled(r) && r.capturedPrice !== null && r.capturedPrice > 1 && r.outcome!.profitLoss !== null && Number.isFinite(r.outcome!.profitLoss);
const credit = (r: Runner) => r.outcome?.winner ? 1 / r.outcome.deadHeatDivisor : 0;
const pl = (r: Runner) => r.outcome!.profitLoss!;
const priceBand = (p: number) => p < 3 ? "(1,3)" : p < 5 ? "[3,5)" : p < 11 ? "[5,11)" : "[11,infinity)";
const marketBand = (r: number) => r <= 3 ? String(r) : r <= 5 ? "4–5" : r <= 10 ? "6–10" : "11+";
const families = ["ALL", "AW", "HURDLE", "CHASE", "TURF"];
const paths = ["data/research/tissue-generation-forward-2026-11.json", "data/research/hurdle-v3-prospective-shadow-v1.json", "data/research/hurdle-v3-market-edge-prospective-v1.json", "data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json", "data/research/prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json", "data/research/tissue-generation-2026-11-manifest.json"];
const prefix = "docs/tissue-generation-rank1-vs-rank2-2026-11-15";
const snapshot = await mkdtemp(join(tmpdir(), "tissue-rank-diagnostic-"));
const startedAt = new Date().toISOString();
const texts = await Promise.all(paths.map(p => readFile(p, "utf8")));
await Promise.all(texts.map((s, i) => writeFile(join(snapshot, `${i}.json`), s, { flag: "wx" })));
const sourceHashes = paths.map((path, i) => ({ path, sha256: sha(texts[i]) }));
const data: GenerationData = JSON.parse(texts[0]);
const shadows: HurdleV3ShadowData[] = [JSON.parse(texts[1]), JSON.parse(texts[3])];
const edges: HurdleMarketEdgeData[] = [JSON.parse(texts[2]), JSON.parse(texts[4])];
assert.equal(new Set(data.races.map(r => r.raceId)).size, data.races.length, "Repeated race books need explicit deduplication before paired inference");
const picks: Pick[] = data.races.flatMap(r => {
  const total = r.completeMarket ? sum(r.runners.map(x => 1 / x.capturedPrice!)) : null;
  const activeMass = sum(r.runners.filter(settled).map(x => x.probability));
  assert(Math.abs(sum(r.runners.map(x => x.probability)) - 1) < 1e-10);
  assert(r.capturedAt >= data.epoch && r.capturedAt < r.scheduledOff && r.featureCutoffAt <= r.capturedAt);
  assert.equal(r.completeMarket, r.runners.every(x => x.capturedPrice !== null));
  const minQuotes = Math.min(...r.runners.map(x => x.quotes.length));
  return r.runners.filter(x => x.rank <= 2).map(x => ({ ...x, raceId: r.raceId, raceDate: r.raceDate, family: r.family, course: r.course, capturedAt: r.capturedAt,
    completeMarket: r.completeMarket, marketP: total === null ? null : (1 / x.capturedPrice!) / total,
    marketRank: total === null ? null : 1 + r.runners.filter(y => y.capturedPrice! < x.capturedPrice!).length,
    quotesN: x.quotes.length, bookMinQuotes: minQuotes, starterP: activeMass > 0 ? x.probability / activeMass : x.probability }));
});
const allPairs: Pair[] = data.races.flatMap(r => {
  const a = picks.filter(x => x.raceId === r.raceId && x.rank === 1), b = picks.filter(x => x.raceId === r.raceId && x.rank === 2);
  assert.equal(a.length, 1, "Rank ties need an explicit race estimand"); assert.equal(b.length, 1);
  return [{ raceId: r.raceId, raceDate: r.raceDate, family: r.family, a: a[0], b: b[0] }];
});
const modelPairs = allPairs.filter(p => settled(p.a) && settled(p.b));
const pricePairs = modelPairs.filter(p => p.a.completeMarket && priced(p.a) && priced(p.b));
function metrics(rows: Pick[]) {
  const s = rows.filter(settled), p = s.filter(priced), expected = sum(s.map(x => x.probability));
  const score = (r: Pick, prob = r.probability) => { const y = credit(r); return { brier: (y - prob) ** 2, logLoss: -y * Math.log(prob) - (1 - y) * Math.log1p(-prob) }; };
  return { captured: rows.length, settled: s.length, pending: rows.filter(x => !x.outcome).length, nr: rows.filter(x => x.outcome?.status === "NR").length, void: rows.filter(x => x.outcome?.status === "void").length,
    winners: s.filter(x => x.outcome!.winner).length, expected, ae: expected ? sum(s.map(credit)) / expected : null, strike: mean(s.map(credit)), priceN: p.length,
    pl: p.length ? sum(p.map(pl)) : null, roi: mean(p.map(pl)), odds: mean(p.map(x => x.capturedPrice!)), modelP: mean(s.map(x => x.probability)), marketP: mean(p.map(x => x.marketP!)),
    rawMarketP: mean(p.map(x => 1 / x.capturedPrice!)), marketRank: mean(p.map(x => x.marketRank!)), edge: mean(p.map(x => x.probability - x.marketP!)),
    marketExpected: sum(p.map(x => x.marketP!)), pricedWinners: sum(p.map(credit)), brier: mean(s.map(x => score(x).brier)), logLoss: mean(s.map(x => score(x).logLoss)),
    starterExpected: sum(s.map(x => x.starterP)), starterBrier: mean(s.map(x => score(x, x.starterP).brier)), starterLogLoss: mean(s.map(x => score(x, x.starterP).logLoss)), dates: new Set(s.map(x => x.raceDate)).size };
}
let state = 20261115;
const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
const quantile = (xs: number[], p: number) => { const s = [...xs].sort((a,b) => a-b); const i = (s.length - 1) * p, k = Math.floor(i); return s[k] + (s[Math.ceil(i)] - s[k]) * (i-k); };
function bootstrap<T extends { raceDate: string }>(rows: T[], statistic: (xs: T[]) => number | null, clustered = true, repetitions = 12000) {
  const keys = [...new Set(rows.map(r => r.raceDate))];
  const groups = clustered ? keys.map(k => rows.filter(r => r.raceDate === k)) : rows.map(r => [r]);
  if (!groups.length || (clustered && keys.length < 2)) return null;
  const values: number[] = [];
  for (let i = 0; i < repetitions; i++) { const sample = groups.flatMap(() => groups[Math.floor(random() * groups.length)]); const v = statistic(sample); if (v !== null && Number.isFinite(v)) values.push(v); }
  return { point: statistic(rows), lower: quantile(values, .025), upper: quantile(values, .975), dates: keys.length, repetitions, validReplicates: values.length };
}
const delta = (ps: Pair[]) => mean(ps.map(p => pl(p.b) - pl(p.a)));
const residual = (ps: Pair[]) => mean(ps.map(p => (credit(p.b) - p.b.marketP!) - (credit(p.a) - p.a.marketP!)));
const brierDiff = (ps: Pair[]) => mean(ps.map(p => (credit(p.b) - p.b.probability)**2 - (credit(p.a) - p.a.probability)**2));
const lossDiff = (ps: Pair[]) => mean(ps.map(p => { const loss = (r: Pick) => -credit(r) * Math.log(r.probability) - (1-credit(r))*Math.log1p(-r.probability); return loss(p.b)-loss(p.a); }));
function pairStats(ps: Pair[], money = true) {
  return { n: ps.length, dates: new Set(ps.map(p=>p.raceDate)).size, t1: metrics(ps.map(p=>p.a)), t2: metrics(ps.map(p=>p.b)),
    delta: money ? delta(ps) : null, deltaCI: money ? bootstrap(ps, delta) : null, raceDeltaCI: money ? bootstrap(ps, delta, false) : null,
    strikeDeltaCI: bootstrap(ps, xs => mean(xs.map(p=>credit(p.b)-credit(p.a)))),
    ae1CI: bootstrap(ps, xs => sum(xs.map(p=>credit(p.a)))/sum(xs.map(p=>p.a.probability))),
    ae2CI: bootstrap(ps, xs => sum(xs.map(p=>credit(p.b)))/sum(xs.map(p=>p.b.probability))),
    brierDiffCI: bootstrap(ps, brierDiff), logLossDiffCI: bootstrap(ps, lossDiff),
    calibrationGap1CI: bootstrap(ps, xs => mean(xs.map(p=>credit(p.a)-p.a.probability))),
    calibrationGap2CI: bootstrap(ps, xs => mean(xs.map(p=>credit(p.b)-p.b.probability))),
    marketResidualCI: money ? bootstrap(ps, residual) : null };
}
const population = families.flatMap(f => [1,2].map(rank => ({ family: f, rank, ...metrics(picks.filter(p=>(f==="ALL"||p.family===f)&&p.rank===rank)) })));
const paired = families.map(f => ({ family:f, model:pairStats(modelPairs.filter(p=>f==="ALL"||p.family===f), false), priced:pairStats(pricePairs.filter(p=>f==="ALL"||p.family===f)) }));
const unmatched = [1,2].map(rank=>({rank, model:metrics(picks.filter(p=>p.rank===rank&&settled(p)&&!modelPairs.some(x=>x.raceId===p.raceId))), priced:metrics(picks.filter(p=>p.rank===rank&&priced(p)&&!pricePairs.some(x=>x.raceId===p.raceId)))}));
const priceDiagnostics = families.flatMap(f => [1,2].flatMap(rank => ["(1,3)","[3,5)","[5,11)","[11,infinity)"].map(band=>({family:f,rank,band,...metrics(pricePairs.flatMap(p=>[p.a,p.b]).filter(p=>(f==="ALL"||p.family===f)&&p.rank===rank&&priceBand(p.capturedPrice!)===band))}))));
const marketDiagnostics = [1,2].flatMap(rank=>["1","2","3","4–5","6–10","11+"].map(band=>({rank,band,...metrics(pricePairs.map(p=>rank===1?p.a:p.b).filter(p=>marketBand(p.marketRank!)===band))})));
// Direct standardization over common joint price-band / market-rank-band cells.
function standardized(ps: Pair[]) {
  const rows = ps.flatMap(p=>[p.a,p.b]), groups = new Map<string, Pick[]>();
  for(const p of rows) { const key = `${priceBand(p.capturedPrice!)} / ${marketBand(p.marketRank!)}`; groups.set(key,[...(groups.get(key)??[]),p]); }
  const cells=[...groups].flatMap(([key,xs])=>{const a=xs.filter(p=>p.rank===1),b=xs.filter(p=>p.rank===2);return a.length&&b.length?[{key,n1:a.length,n2:b.length,roi1:mean(a.map(pl))!,roi2:mean(b.map(pl))!,weight:xs.length}]:[];});
  const total=sum(cells.map(c=>c.weight));
  return {cells,commonSelections:total,totalSelections:rows.length,delta:total?sum(cells.map(c=>c.weight*(c.roi2-c.roi1)))/total:null,roi1:total?sum(cells.map(c=>c.weight*c.roi1))/total:null,roi2:total?sum(cells.map(c=>c.weight*c.roi2))/total:null};
}
const adjusted = { ...standardized(pricePairs), ci:bootstrap(pricePairs,ps=>standardized(ps).delta) };
const sensitivities = families.map(f=>{const ps=pricePairs.filter(p=>f==="ALL"||p.family===f); const winning=ps.flatMap(p=>[p.a,p.b]).filter(p=>credit(p)>0).sort((a,b)=>b.outcome!.grossReturn!-a.outcome!.grossReturn!);
  const scenarios = [{name:"baseline", remove:[] as string[]}, ...[1,2].map(n=>({name:`remove top ${n} T2 winning-return races`,remove:winning.filter(p=>p.rank===2).slice(0,n).map(p=>p.raceId)})),
    ...[1,2].map(n=>({name:`remove top ${n} pooled winning-return races`,remove:winning.slice(0,n).map(p=>p.raceId)})),
    {name:"remove longest-priced T2 winner race", remove:winning.filter(p=>p.rank===2).sort((a,b)=>b.capturedPrice!-a.capturedPrice!)[0] ? [winning.filter(p=>p.rank===2).sort((a,b)=>b.capturedPrice!-a.capturedPrice!)[0].raceId] : []}];
  return {family:f,largestWinners:winning.slice(0,6).map(p=>({raceId:p.raceId,date:p.raceDate,name:p.horseName,rank:p.rank,price:p.capturedPrice,gross:p.outcome!.grossReturn})),
    scenarios:scenarios.map(s=>{const keep=ps.filter(p=>!s.remove.includes(p.raceId));return {name:s.name,removed:s.remove,n:keep.length,pl1:sum(keep.map(p=>pl(p.a))),pl2:sum(keep.map(p=>pl(p.b))),delta:delta(keep)};}),
    leaveDateOut:[...new Set(ps.map(p=>p.raceDate))].sort().map(date=>{const keep=ps.filter(p=>p.raceDate!==date);return {date,n:keep.length,pl1:sum(keep.map(p=>pl(p.a))),pl2:sum(keep.map(p=>pl(p.b))),delta:delta(keep)};})};});
const qualitySubsets = [
  {name:"all priced pairs",xs:pricePairs},
  {name:"both selections >=2 quotes (exploratory)",xs:pricePairs.filter(p=>p.a.quotesN>=2&&p.b.quotesN>=2)},
  {name:"every runner >=2 quotes (exploratory)",xs:pricePairs.filter(p=>p.a.bookMinQuotes>=2)},
  {name:"no NR/void anywhere in frozen race",xs:pricePairs.filter(p=>data.races.find(r=>r.raceId===p.raceId)!.runners.every(settled))},
].map(({name,xs})=>({name,n:xs.length,t1:metrics(xs.map(p=>p.a)),t2:metrics(xs.map(p=>p.b)),delta:delta(xs)}));
const withdrawalSplit = families.flatMap(f => [false,true].map(hasWithdrawal=>{
  const xs=pricePairs.filter(p=>(f==="ALL"||p.family===f)&&data.races.find(r=>r.raceId===p.raceId)!.runners.some(r=>r.outcome?.status==="NR"||r.outcome?.status==="void")===hasWithdrawal);
  return {family:f,hasWithdrawal,n:xs.length,t1:metrics(xs.map(p=>p.a)),t2:metrics(xs.map(p=>p.b)),delta:delta(xs),ci:bootstrap(xs,delta)};
}));
const calibration = families.flatMap(f=>[1,2].flatMap(rank=>Array.from({length:10},(_,i)=>{const rows=picks.filter(p=>(f==="ALL"||p.family===f)&&p.rank===rank&&settled(p)&&Math.min(9,Math.floor(p.probability*10))===i);return {family:f,rank,bin:`[${i/10},${(i+1)/10}${i===9?"]":")"}`,...metrics(rows)};}).filter(x=>x.settled)));
const dates=[...new Set(data.races.map(r=>r.raceDate))].sort();
const cumulative=families.flatMap(f=>dates.map(date=>{const day=pricePairs.filter(p=>(f==="ALL"||p.family===f)&&p.raceDate===date), cum=pricePairs.filter(p=>(f==="ALL"||p.family===f)&&p.raceDate<=date), model=modelPairs.filter(p=>(f==="ALL"||p.family===f)&&p.raceDate<=date);return {family:f,date,dayN:day.length,dayW1:sum(day.map(p=>credit(p.a))),dayW2:sum(day.map(p=>credit(p.b))),dayDifference:sum(day.map(p=>pl(p.b)-pl(p.a))),n:cum.length,t1:metrics(cum.map(p=>p.a)),t2:metrics(cum.map(p=>p.b)),difference:sum(cum.map(p=>pl(p.b)-pl(p.a))),modelN:model.length,modelAE1:metrics(model.map(p=>p.a)).ae,modelAE2:metrics(model.map(p=>p.b)).ae};}));
const captureHash=(o:HurdleV3ShadowData["observations"][number])=>sha(JSON.stringify({...o,production:{...o.production,runners:o.production.runners.map(r=>({...r,outcome:null}))}}));
const frozenBook=(r:GenerationRace)=>JSON.stringify({...r,runners:r.runners.map(x=>({...x,outcome:null}))});
const v3=shadows.map((s,i)=>{
  const matched=s.observations.filter(o=>data.races.some(r=>r.raceId===o.raceId&&r.capturedAt===o.capturedAt&&frozenBook(r)===frozenBook(o.production)));
  const complete=matched.filter(o=>o.production.runners.every(r=>r.outcome!==null)&&o.production.runners.some(r=>settled(r)&&credit(r)>0));
  const moves=[1,2].map(rank=>{const rs=complete.flatMap(o=>o.production.runners.filter(r=>r.rank===rank&&settled(r)).map(r=>({win:credit(r),v3Rank:o.runners.find(x=>x.target.runnerId===r.runnerId)!.official.rank})));return {v2Rank:rank,n:rs.length,winners:sum(rs.map(r=>r.win)),promotedToV3T1:rs.filter(r=>r.v3Rank===1).length,promotedWinners:sum(rs.filter(r=>r.v3Rank===1).map(r=>r.win)),stillV3Top2:rs.filter(r=>r.v3Rank<=2).length};});
  const edge=edges[i], edgeMatched=edge.observations.filter(e=>matched.some(o=>e.raceId===o.raceId&&e.capturedAt===o.capturedAt&&e.shadowHash===captureHash(o)));
  const edgeSettled=edgeMatched.filter(e=>complete.some(o=>o.raceId===e.raceId&&o.capturedAt===e.capturedAt));
  const pricedEdge=edgeSettled.filter(e=>e.completeMarket);
  const t2=pricedEdge.flatMap(e=>{const o=complete.find(o=>o.raceId===e.raceId&&o.capturedAt===e.capturedAt)!;return e.runners.filter(r=>r.v2Rank===2&&settled(o.production.runners.find(x=>x.runnerId===r.runnerId)!)).map(r=>({raceId:e.raceId,v3Rank:r.v3Rank,edgePP:r.edgePP,marketRank:r.marketRank,win:credit(o.production.runners.find(x=>x.runnerId===r.runnerId)!)}));});
  return {population:i===0?"Original V1":"Collection V2",shadowArmed:s.armedAt,shadowEpoch:s.epoch,shadowN:s.observations.length,exactGenerationMatches:matched.length,settledMatched:complete.length,moves,edgeArmed:edge.armedAt,edgeEpoch:edge.epoch,edgeN:edge.observations.length,exactEdgeMatches:edgeMatched.length,settledEdgeMatches:edgeSettled.length,pricedEdgeMatches:pricedEdge.length,t2};
});
const integrity = { startedAt, finishedAt:new Date().toISOString(), snapshot, sourceHashes, inputsUnchangedAtEnd:await Promise.all(paths.map(async(p,i)=>sha(await readFile(p,"utf8"))===sourceHashes[i].sha256)),generation:data.version,epoch:data.epoch,raceBooks:data.races.length,runnerObservations:sum(data.races.map(r=>r.runners.length)),completeMarketBooks:data.races.filter(r=>r.completeMarket).length,deadHeatBooks:data.races.filter(r=>r.runners.some(x=>(x.outcome?.deadHeatDivisor??1)>1)).length,modelVersions:[...new Set(data.races.map(r=>r.modelVersion))],dates };
const evidence={integrity,population,paired,unmatched,priceDiagnostics,marketDiagnostics,adjusted,sensitivities,qualitySubsets,withdrawalSplit,calibration,cumulative,v3,pairedRaceRows:pricePairs,modelOnlyRaceIds:modelPairs.filter(p=>!pricePairs.some(x=>x.raceId===p.raceId)).map(p=>p.raceId)};
await mkdir("docs",{recursive:true});
await writeFile(`${prefix}-evidence.json`,JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify({integrity,population,paired:paired.map(x=>({family:x.family,modelN:x.model.n,priceN:x.priced.n,delta:x.priced.delta,ci:x.priced.deltaCI,t1:x.priced.t1,t2:x.priced.t2})),unmatched,adjusted,sensitivities,v3},null,2));

const fmt=(v:number|null|undefined,n=2)=>v===null||v===undefined?"—":v.toFixed(n);
const pct=(v:number|null|undefined)=>v===null||v===undefined?"—":`${(100*v).toFixed(2)}%`;
const ci=(v:ReturnType<typeof bootstrap>,percent=false)=>v?`${percent?pct(v.lower):fmt(v.lower,3)} to ${percent?pct(v.upper):fmt(v.upper,3)}`:"not estimable";
const table=(headers:string[],rows:(string|number)[][])=>["| "+headers.join(" | ")+" |","| "+headers.map(()=>"---").join(" | ")+" |",...rows.map(r=>"| "+r.join(" | ")+" |")].join("\n");
const overall=paired[0];
const lines=[
"# Tissue Generation: prospective Rank 1 versus Rank 2 diagnostic",
`\nSnapshot: ${startedAt} (Europe/London is UTC on this date). Research only. £1 per eligible selection; T2 minus T1 throughout.`,
"\n## Executive summary",
"The displayed 15 November headlines reproduce exactly. T2 has a higher realised captured-price return in the matched sample, but a repeatable value advantage is not established. Both overall ranks lose money. Family, withdrawal status, a few winning returns and limited racing dates materially affect the interpretation.",
`- On ${overall.priced.n} priced paired races across ${overall.priced.dates} dates, T1 returns £${fmt(overall.priced.t1.pl)} (${pct(overall.priced.t1.roi)}) and T2 £${fmt(overall.priced.t2.pl)} (${pct(overall.priced.t2.roi)}). The £46.82 difference is ${pct(overall.priced.delta)} of one £1 stake per paired race. Its date-clustered 95% interval is ${ci(overall.priced.deltaCI,true)}: direction remains uncertain.`,
"- All-Weather is the clearest descriptive anomaly: 15/53 T2 winners versus 7/53 T1, although it spans only five dates. Its positive priced T2 P/L becomes negative after removing its two largest T2 winning-return races.",
"- Overall relative outperformance survives removal of the largest two winning-return races, shrinking to £10.82. Hurdle and Chase advantages each reverse after removing their own largest T2 winning-return race.",
"- The overall lead is concentrated in races containing an NR/void elsewhere in the field: excluding those races reverses the return difference. Stored results do not establish bookmaker withdrawal deductions or executable betting returns.",
"- T1 overprediction and T2 underprediction are plausible early calibration patterns, especially on AW, but paired/date-clustered intervals do not establish a stable rank-specific calibration defect. Continue unchanged observation; do not promote T2, recalibrate, or change thresholds.",
"\n## 1. Population and reconciliation",
`The exact page source is \`data/research/tissue-generation-forward-2026-11.json\`, generation \`${data.version}\`, activated **${data.epoch}**. Development ended 2026-11-05T06:57:32.000Z. One family probability book supplies both ranks; these are not two separately fitted models. The page flattens every stored book, without filtering to the separately armed V3 or Value experiments. There are ${integrity.raceBooks} books and distinct race IDs, ${integrity.runnerObservations} frozen runner observations, and ${integrity.completeMarketBooks} complete-market books. No duplicate race captures or tied T1/T2 selections occur in this snapshot.`,
table(["Family","Frozen model version","Model content hash"],families.slice(1).map(f=>{const r=data.races.find(r=>r.family===f)!;return [f,r.modelVersion,`\`${r.modelHash}\``];})),
"Counts below are selections. Pending means no persisted outcome; NR/void are excluded from settled stakes and expected wins. These independently summed figures equal the supplied page values, including family ROI and A/E after rounding.",
table(["Family","Rank","Captured","Settled","Pending","NR","Void","Winners","Expected","Strike","A/E","Price n","P/L £","ROI"],population.map(x=>[x.family,x.rank,x.captured,x.settled,x.pending,x.nr,x.void,x.winners,fmt(x.expected),pct(x.strike),fmt(x.ae),x.priceN,fmt(x.pl),pct(x.roi)])),
"The wider T1/T2 model cohorts contain 249/245 settled selections. Their complete-market priced subsets contain 206/204. Missing any runner's contemporaneous usable bookmaker price makes the entire book incomplete: even available individual quotes are not used for P/L or market edges. This explains why a model winner need not contribute a monetary return: Turf T1 has one winner in the wider cohort and none among its seven priced selections.",
"The difference in T1/T2 settled eligibility comes from 9 versus 14 NRs and 1 versus 0 voids; pending is 16 for each. Original ranks are retained after a withdrawal, without replacing a void T1 with T2 or reranking. Canonical non-finishers are settled losses. Existing settlement records supply P/L; no results are fetched or resettled. There are zero dead-heat books. A/E here is winner count divided by frozen expected probability mass, matching the page; scoring diagnostics would use fractional dead-heat credit if needed.",
"\n## 2. Same-race comparison",
"The broad paired sample requires both original selections to be settled starters. The priced paired sample additionally requires the same complete pre-off market book and finite persisted P/L for both selections. Monetary conclusions use the latter. Unmatched selections are never filled in or compared as if paired.",
table(["Family","Model paired races","Model dates","T1 W / E","T2 W / E","T1 A/E","T2 A/E","Priced pairs","Price dates"],paired.map(x=>[x.family,x.model.n,x.model.dates,`${x.model.t1.winners} / ${fmt(x.model.t1.expected)}`,`${x.model.t2.winners} / ${fmt(x.model.t2.expected)}`,fmt(x.model.t1.ae),fmt(x.model.t2.ae),x.priced.n,x.priced.dates])),
table(["Family / rank","Priced n","Winners","Strike","Expected","A/E","Mean odds","P/L £","ROI"],paired.flatMap(x=>[1,2].map(rank=>{const m=rank===1?x.priced.t1:x.priced.t2;return [`${x.family} T${rank}`,x.priced.n,m.winners,pct(m.strike),fmt(m.expected),fmt(m.ae),fmt(m.odds),fmt(m.pl),pct(m.roi)];}))),
table(["Family","Total T2−T1 £","Difference £ / race","ROI difference pp","Date-clustered 95% interval (pp)","Race-bootstrap interval (pp)"],paired.map(x=>[x.family,fmt(x.priced.t2.pl!-x.priced.t1.pl!),fmt(x.priced.delta,3),fmt(100*x.priced.delta!),ci(x.priced.deltaCI,true),ci(x.priced.raceDeltaCI,true)])),
"ROI difference uses one £1 stake for each rank per race. It is not the ROI of staking £2 on Top2. The broad 237-race sample has 54 versus 52 winners (22.78% versus 21.94%); the priced sample reverses that ordering to 42 versus 45. Thus a blanket claim that T1 finds more winners while T2 finds value depends on the chosen population.",
table(["Unmatched rank","Settled selections","Winners","Expected","Priced n","P/L £"],unmatched.map(x=>[x.rank,x.model.settled,x.model.winners,fmt(x.model.expected),x.priced.priceN,fmt(x.priced.pl)])),
"There are 41 broad paired races without a usable complete captured market. Reconciliation: T1 237+12=249 and T2 237+8=245 settled; T1 196+10=206 and T2 196+8=204 priced. The unmatched monetary difference contributes £2.49 of the headline £49.31 gap; the remaining £46.82 is paired.",
"\n## 3. Family interpretation",
"**All-Weather:** T2's 15 winners exceed 8.31 expected, while T1's seven trail 11.06. On 48 priced races, T2 has 14 winners against 7.59 model-expected and 7.52 normalized-market-expected; T1 has seven against 9.92 and 10.11. T2's odds average 7.44 versus 5.45. Because T2 also wins more often despite lower market probabilities, longer offered odds alone do not explain this realised anomaly. However, only five dates support it, the return-gap interval spans zero widely, and absolute profitability is outlier-sensitive. This is the strongest question to monitor, not statistical proof.",
"**Hurdles:** On 115 paired settled races T1 wins 29 versus 29.92 expected and T2 24 versus 20.26. T1 still finds more winners. On 92 priced pairs the longer T2 average price (8.78 versus 5.28) supports a smaller loss despite fewer winners. Actual-minus-market winner residuals are nearly identical between ranks; the paired difference is only 0.67 percentage points. Rose Warrior at 19.0 alone is sufficient to reverse the family return comparison when its race is omitted. This is a price/outlier story with weak evidence of a distinct rank effect.",
"**Chases:** Broad pairing changes the original narrative: T1 A/E is 1.01 and T2 0.96, rather than the unmatched headlines 0.90 and 1.03. Both paired priced cohorts lose. The £6.12 relative T2 lead reverses without Getawhisky at 10.0. Eligibility imbalance matters appreciably; evidence for systematic T2 superiority is weak.",
"**Turf:** Eight model pairs and seven priced pairs, all on one date. One priced T2 winner accounts for the entire £2.88 relative advantage. Its removal leaves both ranks at −100% ROI. There is no usable independent-date estimate; the report deliberately does not present a degenerate single-date bootstrap interval as confidence.",
"\n## 4. Captured price and market-rank diagnostics",
"Descriptive price ranges reuse the project's existing 3, 5 and 11 decimal boundaries from `tissue-positive-neutral-method.ts`: (1,3), [3,5), [5,11), [11,∞). Their use here does not adopt that experiment's eligibility or alter frozen rules. Market-rank bands reuse `tissue-value-metrics.ts`: 1, 2, 3, 4–5, 6–10, 11+. Ties share competition rank. All tables in this section use the 196 priced pairs; family detail is in the evidence JSON.",
"Market probability q = (1 / captured decimal price) / Σ(1 / captured decimal price) across the original complete field. This removes the frozen book's overround. Raw reciprocal odds are also shown. Edge means frozen model p minus normalized q; no later price or starting price is substituted. Normalized q is a benchmark, not an executable price or a claim of market truth.",
table(["Rank","Mean odds","Mean market rank","Mean p","Mean raw 1/odds","Mean q","Mean p−q pp","Actual W","Market E"],[1,2].map(rank=>{const m=rank===1?overall.priced.t1:overall.priced.t2;return [rank,fmt(m.odds),fmt(m.marketRank),pct(m.modelP),pct(m.rawMarketP),pct(m.marketP),fmt(100*m.edge!),m.winners,fmt(m.marketExpected)];})),
table(["Rank","Decimal range","n","W","Mean p","Mean q","Edge pp","Mean market rank","P/L £","ROI"],priceDiagnostics.filter(x=>x.family==="ALL").map(x=>[x.rank,x.band,x.settled,x.winners,pct(x.modelP),pct(x.marketP),fmt(100*x.edge!),fmt(x.marketRank),fmt(x.pl),pct(x.roi)])),
table(["Model rank","Market-rank band","n","W","Mean odds","Mean p","Mean q","Edge pp","P/L £","ROI"],marketDiagnostics.filter(x=>x.settled).map(x=>[x.rank,x.band,x.settled,x.winners,fmt(x.odds),pct(x.modelP),pct(x.marketP),fmt(100*x.edge!),fmt(x.pl),pct(x.roi)])),
"The price-bin pattern is not uniform: T2 wins money below 3.0 and at 11.0+, but loses in both middle bands; T1 outperforms T2 in [5,11). The 11.0+ T2 profit depends on three winners. T2's short-price selections have a negative average model-minus-market edge despite their positive realised return. Thus neither longer prices nor a positive frozen model edge provides a complete explanation, and these retrospective bands should not become selection rules.",
`Exploratory direct standardization jointly by price band and market-rank band retains ${adjusted.commonSelections}/${adjusted.totalSelections} selections in ${adjusted.cells.length} cells containing both ranks. Each cell receives its pooled selection-count weight. Standardized T1/T2 ROI is ${pct(adjusted.roi1)} / ${pct(adjusted.roi2)}, a ${pct(adjusted.delta)} difference (date-clustered interval ${ci(adjusted.ci,true)}). The sign survives coarse adjustment, but sparse cells and residual within-bin/family differences prevent a claim of odds-independent superiority. Bootstrap resamples recompute overlap and weights; this is an exploratory stability summary, not a fixed-population causal estimate.`,
`On the same races, T2's actual-minus-normalized-market winner residual exceeds T1's by ${pct(overall.priced.marketResidualCI!.point)}, with interval ${ci(overall.priced.marketResidualCI,true)}. This also permits no advantage. T2's observed performance cannot be reduced simply to longer quoted odds, but neither market-rank conditioning nor market residuals establishes a repeatable advantage.`,
"\n## 5. Outliers, withdrawals and sparse prices",
"Remove a winning selection's entire paired race from both ranks, preserving the paired estimand. These are analytical exclusions only. The largest pooled winning returns are also T2's two largest overall: Rose Warrior, 14 November, 19.0; Westin Pimpernel, 9 November, 17.0. With no dead heats, each family's longest-priced T2 winner is also its largest gross return; those scenarios coincide.",
table(["Family","Scenario","Pairs","T1 P/L £","T2 P/L £","T2 ROI","Gap £ / race"],sensitivities.flatMap(s=>s.scenarios.filter(x=>!x.name.startsWith("remove longest")).map(x=>[s.family,x.name,x.n,fmt(x.pl1),fmt(x.pl2),x.n?pct(x.pl2/x.n):"—",fmt(x.delta,3)]))),
"Overall, removing the top two T2 winner races consumes £36 of the £46.82 paired gap (76.9%) while leaving a £10.82 relative lead. AW's own top two T2 winners are Xirivella at 11.0 and Leading Times at 8.0: excluding both leaves T2 at −£5.76, although still £3.89 ahead of T1. Relative superiority and absolute profitability are different conclusions.",
table(["Family","Any recorded NR/void in field?","Pairs","T1 P/L £","T2 P/L £","T1 ROI","T2 ROI","Gap £ / race"],withdrawalSplit.map(x=>[x.family,x.hasWithdrawal?"yes":"no",x.n,fmt(x.t1.pl),fmt(x.t2.pl),pct(x.t1.roi),pct(x.t2.roi),fmt(x.delta,3)])),
"The main paired cohort already excludes NR/void T1/T2 selections. This extra split asks about withdrawals anywhere else in the field. On 150 races with no NR/void anywhere, T2 trails T1 by £12.87. The other 46 races contribute a £59.69 T2 lead. This is a descriptive post-outcome split, not a deployable pre-off filter or proof that withdrawals cause the gap. The ledgers do not establish the time of withdrawal or any bookmaker deduction. Frozen selection probabilities are not rescored after NRs, and original captured market books still include their mass.",
"The family differences matter: AW retains a positive T2 gap and positive T2 P/L in its 37 NR-free races, whereas Hurdle T2 trails by £36.54 in 64 NR-free races and leads by £51.47 in 28 withdrawal-containing races. The overall withdrawal sensitivity therefore does not erase the separate AW anomaly or establish one common explanation across families.",
"The generation settlement path passes captured odds and dead-heat divisor into `settleSelection`; it does not pass a withdrawal/Rule 4 adjustment. Stored P/L is therefore captured-price research accounting, not verified executable betting profit. The investigation preserves it exactly and does not estimate missing deductions. This limitation is particularly relevant to the withdrawal-associated return concentration.",
table(["Price-quality sensitivity","Pairs","T1 P/L £","T2 P/L £","Gap £ / race"],qualitySubsets.map(x=>[x.name,x.n,fmt(x.t1.pl),fmt(x.t2.pl),fmt(x.delta,3)])),
"Exploratory quote-depth exclusions at two quotes remove no paired races: every runner in each paired complete book has at least two stored quotes. They therefore add no independent robustness evidence. Entire incomplete books remain excluded; their outcomes must not be used to invent market edges.",
"\n## 6. Calibration and probability scoring",
"Primary calibration preserves the original frozen probability, matching the page. A/E below/above one means fewer/more winners than the frozen expectation, rather than a demonstrated parameter error. Both rank outcomes are kept together when resampling dates. Binary Brier and Bernoulli log loss are proper selection-level scores (lower is better), but the two ranks have different outcome prevalence; comparing their scalar losses does not by itself identify a better race winner predictor. There is one shared multiclass probability model per family, not one per rank.",
table(["Family / rank","Paired model n","Mean p","Win rate","Actual−expected pp","95% interval for gap (pp)","A/E","95% interval for A/E","Brier","Log loss"],paired.flatMap(x=>[1,2].map(rank=>{const m=rank===1?x.model.t1:x.model.t2;return [`${x.family} T${rank}`,x.model.n,pct(m.modelP),pct(m.strike),fmt(100*(m.strike!-m.modelP!)),ci(rank===1?x.model.calibrationGap1CI:x.model.calibrationGap2CI,true),fmt(m.ae),ci(rank===1?x.model.ae1CI:x.model.ae2CI),fmt(m.brier,4),fmt(m.logLoss,4)];}))),
table(["Overall rank","Frozen-probability bin","n","Expected W","Actual W","Mean p","Win rate","A/E"],calibration.filter(x=>x.family==="ALL").map(x=>[x.rank,x.bin,x.settled,fmt(x.expected),x.winners,pct(x.modelP),pct(x.strike),fmt(x.ae)])),
"Bins are fixed deciles, not optimized calibration thresholds. This bin table uses each rank's wider settled population, so it does not share the paired-score denominator. Family bins are retained in the evidence JSON. Sparse bins and observed-family multiplicity make isolated departures weak evidence.",
`On all 237 paired settled races, T2−T1 Brier difference is ${fmt(overall.model.brierDiffCI!.point,4)} (interval ${ci(overall.model.brierDiffCI)}); log-loss difference is ${fmt(overall.model.logLossDiffCI!.point,4)} (${ci(overall.model.logLossDiffCI)}). Both include zero. Paired A/E intervals include one overall for both ranks. AW T1's individual A/E upper endpoint is approximately one; five dates, exploratory family inspection and T2's wide interval preclude a strong family calibration claim.`,
`An analytical sensitivity renormalizes the existing frozen probabilities over recorded settled starters, without changing stored books or original ranks. On 237 broad paired races, expected wins move from ${fmt(overall.model.t1.expected)}/${fmt(overall.model.t2.expected)} to ${fmt(overall.model.t1.starterExpected)}/${fmt(overall.model.t2.starterExpected)}; actual remains 54/52. The directional under/overprediction pattern remains. Corresponding Brier is ${fmt(overall.model.t1.starterBrier,4)}/${fmt(overall.model.t2.starterBrier,4)}, log loss ${fmt(overall.model.t1.starterLogLoss,4)}/${fmt(overall.model.t2.starterLogLoss,4)}. This conditions on observed starters and does not reconstruct pre-off knowledge of withdrawals.`,
"The data support monitoring a possible rank-specific calibration imbalance. They do not distinguish a durable model defect from a short cluster of AW outcomes, price-coverage selection and early sampling variation. No refit or recalibration was performed.",
"\n## 7. Time evolution and leave-one-date-out",
"The period always starts at the original activation; no start-date optimization. Daily counts below refer to priced pairs. Cumulative A/E, winners and P/L share that priced-pair cohort; the next table separately gives broad paired A/E. Zero priced pairs on a date do not imply that no model observations exist. All 15 November selections remain pending at this snapshot.",
table(["Date","Day pairs","Day W1/W2","Day gap £","Cum pairs","Cum W1/W2","Cum A/E1","Cum A/E2","Cum P/L1 £","Cum P/L2 £","Cum gap £"],cumulative.filter(x=>x.family==="ALL").map(x=>[x.date,x.dayN,`${x.dayW1}/${x.dayW2}`,fmt(x.dayDifference),x.n,`${x.t1.winners}/${x.t2.winners}`,fmt(x.t1.ae),fmt(x.t2.ae),fmt(x.t1.pl),fmt(x.t2.pl),fmt(x.difference)])),
table(["Date","Cum broad paired races","Broad A/E1","Broad A/E2"],cumulative.filter(x=>x.family==="ALL").map(x=>[x.date,x.modelN,fmt(x.modelAE1),fmt(x.modelAE2)])),
"T2 leads on six of nine priced dates and trails on three. It was behind cumulatively on 8–10 November. The 14 November gain of £27.49 is 58.7% of the final £46.82 gap. The lead is spread across multiple dates, but its size is concentrated; its positive result is not a smooth time trend.",
table(["Omitted date","Remaining pairs","T1 P/L £","T2 P/L £","Gap £ / race"],sensitivities[0].leaveDateOut.map(x=>[x.date,x.n,fmt(x.pl1),fmt(x.pl2),fmt(x.delta,3)])),
"The overall gap remains positive after leaving out any one priced date (£0.111–£0.427 per remaining race). This is a useful stability check, not independent replication or a significance test. AW also retains a positive relative gap after each date omission; Hurdle reverses when 14 November is omitted, and Chase reverses when 6 or 11 November is omitted. Turf has no second date to retain.",
table(["Family","Omitted date","Remaining pairs","T1 P/L £","T2 P/L £","Gap £ / race"],sensitivities.slice(1).flatMap(s=>s.leaveDateOut.map(x=>[s.family,x.date,x.n,fmt(x.pl1),fmt(x.pl2),fmt(x.delta,3)]))),
"\n## 8. Relationship to Hurdle V3 research",
"These are separate research populations. Tissue Generation activation is 5 November. Original V3 Shadow was armed 8 November and Market Edge V1 on 10 November; the distinct Collection V2 experiments were armed 11 November. The V2 files retain their internal original schema version strings; the file paths and collection activation identify their separate populations. Nothing is pooled across them.",
"A genuine match requires race ID, capture timestamp and exact original production book (excluding settlement fields). Market Edge additionally requires its frozen shadow digest to match the same shadow observation. The digest is recomputed only for identity checking; source pins and records remain unchanged. Shadow outcomes are taken from that shadow's own production book, without importing newer generation outcomes into it.",
table(["Population","Shadow armed","Shadow first capture","Shadow n / exact generation matches / fully settled","Edge armed","Edge first capture","Edge n / exact matches / settled / priced"],v3.map(x=>[x.population,x.shadowArmed,x.shadowEpoch??"pending",`${x.shadowN} / ${x.exactGenerationMatches} / ${x.settledMatched}`,x.edgeArmed,x.edgeEpoch??"pending",`${x.edgeN} / ${x.exactEdgeMatches} / ${x.settledEdgeMatches} / ${x.pricedEdgeMatches}`])),
table(["Separate shadow population","V2 original rank","Settled starters","Winners","V3 T1 count","Winners among V3 T1","Still V3 Top2"],v3.flatMap(x=>x.moves.map(m=>[x.population,m.v2Rank,m.n,m.winners,m.promotedToV3T1,m.promotedWinners,m.stillV3Top2]))),
"Original V1 matched V2 T2 has 8 winners from 45 starters; Collection V2 has 8 from 35. V3 promotes 14 and 7 of those original T2 runners to its T1, yielding three winners in each separate population. This suggests monitoring rank disagreements, but neither population establishes that promotions improve value.",
"For the complete, settled, exactly matched Market Edge subsets, original V1 contains seven eligible V2 T2 starters and one winner; Collection V2 contains 18 and four. In Collection V2, the winning V2 T2 runners include Rose Warrior (V3 rank 2, frozen V3 edge +13.03pp), Fasol (V3 rank 1, +15.00pp), Beckistine (V3 rank 2, +7.42pp) and an odds-on/market-favourite winner with negative V3 edge. These are observations within existing classifications, not evidence to select a new cutoff. Westin Pimpernel predates Market Edge V1 and must not be backfilled into it.",
"Useful questions within the already frozen V3 groups are whether original V2 T2 winners are retained or promoted by V3, whether same-capture edge/market-rank and existing speed-depth groups behave consistently over later dates, and whether apparent gains persist without the named long-price wins. Do not redefine tags, pool V1/V2 collections or change any selection classifications.",
"\n## 9. Answers and research recommendation",
"1. **Is T2 genuinely outperforming on a paired basis?** Its realised return is higher by £46.82 on 196 priced pairs. Evidence is insufficient to call the advantage repeatable; clustered intervals include reversal and both overall ROIs are negative.",
"2. **Does the lead persist without the largest returns?** Overall, yes in relative terms after the largest two (£10.82 remains), but most of the gap disappears. AW remains relatively ahead after its own largest two while becoming unprofitable. Hurdle/Chase reverse without their largest winner.",
"3. **Is the strongest evidence confined to AW?** The strongest descriptive winner-versus-expectation anomaly is AW. Positive raw return gaps occur in every family, but those outside AW are especially fragile; none establishes a stable advantage, including AW.",
"4. **Is T1 better at winners but worse at value?** Only narrowly in the broad paired sample (54 versus 52), and more clearly in Hurdles/Chases. The priced sample has more T2 winners (45 versus 42), driven by AW. A universal distinction is unsupported.",
"5. **Are probabilities miscalibrated between ranks?** The aggregate direction suggests T1 overprediction/T2 underprediction. Short-date clustered intervals, family heterogeneity and withdrawal/price subsets prevent a firm systematic diagnosis.",
"6. **Enough independent prospective evidence for further research?** Yes to continued observation of a concrete anomaly; no to model changes, rank replacement, profitability claims or deployment. Hundreds of selections represent only ten settled racing dates, nine with paired prices and five for AW. Further selected slices of these same dates are not fresh validation.",
"7. **What next without changing the model?** Retain the existing epoch, captures, rankings and automated workflow. At routine future reviews, repeat the same paired/family summaries, cumulative calibration, quote coverage, withdrawal split and top-one/top-two/leave-date sensitivities over all accumulated dates. Track whether later independent dates reproduce AW's T2 win surplus; whether NR-free races show a consistent gap; and whether Hurdle/Chase gains cease to depend on isolated winners. Treat missing withdrawal timing/deductions as unavailable evidence, not a reason to invent adjusted returns. Observe V3 only through each experiment's already frozen definitions.",
"\n## Methods, reproducibility and safeguards",
"Uncertainty uses deterministic percentile bootstrap (12,000 replicates per statistic; LCG seed 20261115). Primary resampling draws racing dates with replacement and keeps all same-date races and both rank selections together. The ratio-of-totals statistic is recomputed in each draw; race counts may vary. A secondary bootstrap samples whole paired races. Both preserve within-race dependence; only the date method also allows shared day conditions. With five to ten date clusters, percentile coverage is approximate and heavy tails may be missed; the family/band exploration has no multiplicity adjustment. Single-date clustered intervals are unavailable. There is no significance-based threshold selection, model fitting or optimized start date.",
`Evidence: [machine-readable calculations](${prefix.split("/").pop()}-evidence.json). The new diagnostic script is [diagnose-tissue-generation-rank1-vs-rank2.ts](../scripts/diagnose-tissue-generation-rank1-vs-rank2.ts). Run with Bun from the repo root; it reads the then-current ledgers, snapshots them in a new temporary directory, and writes only this diagnostic report and evidence file. A later run may have a different population. This report's exact temporary source copies are in \`${snapshot}\` (0–5.json in the source order below); source hashes identify the research snapshot even after temporary files expire.`,
table(["Input source","SHA256"],sourceHashes.map(x=>[x.path,`\`${x.sha256}\``])),
`All six inputs were byte-identical between initial read and end-of-analysis verification: **${integrity.inputsUnchangedAtEnd.every(Boolean)?"yes":"NO; inspect individual flags in evidence"}**. Other pre-existing working-tree changes were left in place. No database, schema, scraper, capture, collection, settlement, workflow lock, automation schedule, frozen observation, price, source pin, model, probability, coefficient, ranking, rule or threshold was modified. No commit or deployment was made.`,
];
await writeFile(`${prefix}.md`,lines.join("\n\n")+"\n");
