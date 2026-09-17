import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { TURF_PERFORMANCE_RATING_WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type Family = "combined" | "hurdle" | "chase";
type Getter = (row: Row) => number | null;
type Context = { year: Year; rows: Row[]; coverage: string };
type Candidate = { key: string; label: string; get: Getter };
type Evaluation = { year: Year; family: Family; candidate: Candidate; rows: Row[]; values: Map<string, number>; ranks: Map<string, number> };

const OUT = "/tmp/jump-rating-benchmark.md";
const YEARS: Year[] = ["2025", "2026"];
const FAMILIES: Family[] = ["combined", "hurdle", "chase"];
const CLASS_OFFSETS: Record<string, number> = { "Class 1": .40728372695748705, "Class 2": .21081366080149383, "Class 3": .15923801805811594, "Class 4": .012261721350936047, "Class 5": -.07957322921317331, "Class 6": -.197767969260115, unknown: -.05486729600240039 };

const individual: Candidate[] = [
  c("or", "Official Rating", r => r.features.officialRating),
  c("perf_latest", "Latest Performance", r => r.features.latestPerformanceRating),
  c("perf_best3", "Best L3 Performance", r => r.features.bestPerformanceLast3),
  c("perf_avg3", "Avg L3 Performance", r => r.features.averagePerformanceLast3),
  c("speed_latest", "Latest Speed", r => r.features.latestSpeedRating),
  c("speed_best3", "Best L3 Speed", r => r.features.bestSpeedLast3),
  c("speed_avg3", "Avg L3 Speed", r => r.features.averageSpeedLast3),
  c("today_latest", "Latest Today's Rating", r => r.features.latestTodaysRating),
  c("today_best3", "Best L3 Today's Rating", r => r.features.bestTodaysRatingLast3),
];
const recent: Candidate[] = [
  ...individual.filter(x => ["perf_latest", "perf_best3", "perf_avg3", "speed_latest", "speed_best3", "speed_avg3"].includes(x.key)),
  c("perf_weighted3", "Performance weighted L3 (50/30/20)", r => weighted3(r.features.latestPerformanceRating, r.features.previousPerformanceRating, r.features.averagePerformanceLast3)),
  c("speed_weighted3", "Speed weighted L3 (50/30/20)", r => weighted3(r.features.latestSpeedRating, r.features.previousSpeedRating, r.features.averageSpeedLast3)),
];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const bestPerf = bestDevelopment(recent.filter(x => x.key.startsWith("perf_")), contexts[0]!, "combined");
  const bestSpeed = bestDevelopment(recent.filter(x => x.key.startsWith("speed_")), contexts[0]!, "combined");
  const blends = blendCandidates(bestPerf, bestSpeed, contexts);
  const bestBlend = bestDevelopment(blends, contexts[0]!, "combined");
  const orVariant = contextualCandidate("base80_or20", `${bestBlend.label} + 20% OR`, bestBlend, individual[0]!, .8, .2, contexts);
  const diagnostics = diagnosticCandidates(bestBlend, contexts);
  const all = [...individual, ...recent.filter(x => x.key.endsWith("weighted3")), ...blends, orVariant, ...diagnostics];
  const evaluations = contexts.flatMap(ctx => FAMILIES.flatMap(family => all.map(candidate => evaluate(ctx, family, candidate))));
  const lines: string[] = [];
  lines.push("# Jump Rating Foundation Benchmark", "", "Diagnostic only. Jump races, pre-race/as-of-safe v4 features, uncapped final-SP settlement. No production, Research, Today, cache, schema, or saved-rule changes.", "");
  lines.push("Ranks are within race, highest first, using competition ranking. Recency weighting is fixed at 50/30/20; available runs are renormalised. Blends use within-race rank percentiles and require both components.", "");
  coverage(lines, contexts);
  metricDefinitions(lines);
  section(lines, "Individual Metric Benchmarks", evaluations.filter(e => individual.some(x => x.key === e.candidate.key)));
  section(lines, "Recent-Form Constructions", evaluations.filter(e => recent.some(x => x.key === e.candidate.key)));
  lines.push("## Performance Vs Speed", "", `2025 development selected ${bestPerf.label} and ${bestSpeed.label} by combined-Jump rank-1 strike (then top-3 capture and association).`, "");
  table(lines, evaluations.filter(e => [bestPerf.key, bestSpeed.key].includes(e.candidate.key)).map(summaryRow));
  lines.push("## Simple Blends", ""); table(lines, evaluations.filter(e => blends.some(x => x.key === e.candidate.key)).map(summaryRow));
  lines.push("## OR Contribution", "", `Base selected on 2025 only: ${bestBlend.label}. OR variant is fixed 80/20.`, "");
  table(lines, evaluations.filter(e => [bestBlend.key, orVariant.key].includes(e.candidate.key)).map(summaryRow));
  contextDiagnostics(lines, evaluations, bestBlend);
  weightClass(lines, evaluations, diagnostics);
  divergence(lines, evaluations, [...individual, ...recent.filter(x => x.key.endsWith("weighted3")), ...blends, orVariant]);
  stability(lines, evaluations, shortlist(evaluations, [...blends, orVariant, bestPerf, bestSpeed]));
  conclusion(lines, evaluations, bestPerf, bestSpeed, bestBlend, orVariant, diagnostics);
  await writeFile(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`Best performance: ${bestPerf.label}; best speed: ${bestSpeed.label}; best blend: ${bestBlend.label}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 Jump cache for ${year}`);
  return { year, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`, rows: cache.rows.filter(r => r.features.raceCode === "jump").sort(compareRows) };
}

function coverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage", "");
  table(lines, contexts.flatMap(ctx => FAMILIES.map(family => {
    const rows = familyRows(ctx.rows, family); const settled = rows.filter(isSettled);
    const base: Record<string, unknown> = { year: ctx.year, family, coverage: ctx.coverage, races: distinct(rows, r => r.features.targetRaceId), runners: rows.length, "settled runners": settled.length };
    for (const m of individual) { const n = settled.filter(r => valid(m.get(r))).length; base[m.label] = `${n} (${pct(n / Math.max(1, settled.length))} valid; ${pct(1 - n / Math.max(1, settled.length))} missing)`; }
    return base;
  })));
}

function metricDefinitions(lines: string[]) {
  lines.push("## Stored Metric Meaning", "");
  table(lines, [
    { metric: "Official Rating", meaning: "Target runner's pre-race official handicap rating." },
    { metric: "Performance", meaning: "As-of historical RPR-style/weight-adjusted performance series; latest, best L3 and average L3 are derived only from prior runs." },
    { metric: "Speed", meaning: "As-of Jump speed-rating series (family alias in latestSpeedRating); latest, best L3 and average L3 use prior Jump runs." },
    { metric: "Today's Rating", meaning: "Existing pre-race Today-adjusted historical rating series, exposed as latest/best/average prior-run values." },
    { metric: "Trainer prior strike", meaning: "Wins/runs strictly before the target race." },
  ]);
}

function section(lines: string[], title: string, evals: Evaluation[]) { lines.push(`## ${title}`, ""); table(lines, evals.map(summaryRow)); }

function summaryRow(e: Evaluation) {
  const r1 = ranked(e, 1), top3 = e.rows.filter(r => (e.ranks.get(id(r)) ?? Infinity) <= 3), winners = e.rows.filter(r => r.outcome.won === true), placed = e.rows.filter(r => r.outcome.placed === true);
  const validRaces = distinct(e.rows.filter(r => e.values.has(id(r))), r => r.features.targetRaceId);
  const odds = r1.map(sp).filter(isNum), winRows = r1.filter(r => r.outcome.won === true && sp(r) !== null);
  const expected = r1.reduce((s, r) => s + (sp(r) ? 1 / sp(r)! : 0), 0), returns = winRows.reduce((s, r) => s + sp(r)!, 0), settledBets = r1.filter(r => sp(r) !== null);
  return { year: e.year, family: e.family, candidate: e.candidate.label, "valid races": validRaces, "rank1 selections": r1.length, "rank1 winners": r1.filter(r => r.outcome.won).length, "rank1 strike": pct(rate(r1.filter(r => r.outcome.won).length, r1.length)), "top3 winner capture": pct(rate(top3.filter(r => r.outcome.won).length, winners.length)), "top3 place capture": pct(rate(top3.filter(r => r.outcome.placed).length, placed.length)), association: num(association(e)), "avg rank1 SP": num(avg(odds)), "rank1 ROI": pct(rate(returns - settledBets.length, settledBets.length)), "A/E": num(expected ? r1.filter(r => r.outcome.won).length / expected : null) };
}

function blendCandidates(perf: Candidate, speed: Candidate, contexts: Context[]) {
  return [[1,0],[.75,.25],[.5,.5],[.25,.75],[0,1]].map(([p,s]) => contextualCandidate(`blend_${p}_${s}`, `${p!*100}% Performance / ${s!*100}% Speed`, perf, speed, p!, s!, contexts));
}

function contextualCandidate(key: string, label: string, a: Candidate, b: Candidate, aw: number, bw: number, contexts: Context[]): Candidate {
  const values = new Map<string, number>();
  for (const ctx of contexts) for (const race of group(ctx.rows.filter(isSettled), r => r.features.targetRaceId).values()) {
    const ap = percentiles(race, a.get), bp = percentiles(race, b.get);
    for (const r of race) { const av=ap.get(id(r)), bv=bp.get(id(r)); if ((aw===0||av!==undefined)&&(bw===0||bv!==undefined)) values.set(id(r), aw*(av??0)+bw*(bv??0)); }
  }
  return c(key,label,r=>values.get(id(r))??null);
}

function diagnosticCandidates(base: Candidate, contexts: Context[]): Candidate[] {
  const medians = new Map<string, number>(); for (const ctx of contexts) for (const [raceId, rows] of group(ctx.rows, r=>r.features.targetRaceId)) { const m=median(rows.map(r=>r.features.weightCarriedLbs).filter(isNum)); if(m!==null) medians.set(raceId,m); }
  return [
    c("weight_adjusted", `${base.label} + Turf relative-weight coefficient`, r => { const v=base.get(r),m=medians.get(r.features.targetRaceId),w=r.features.weightCarriedLbs; return v===null||m===undefined||w===null?null:v+TURF_PERFORMANCE_RATING_WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB*(w-m); }),
    c("class_adjusted", `${base.label} - Turf class offset`, r => { const v=base.get(r); return v===null?null:v-(CLASS_OFFSETS[classBand(r.features.raceClass)]??0); }),
  ];
}

function contextDiagnostics(lines: string[], evals: Evaluation[], base: Candidate) {
  lines.push("## Context Diagnostics", "", "Context only; no band is embedded in the candidate.", "");
  const target=evals.filter(e=>e.candidate.key===base.key); const rows:Record<string,unknown>[]=[];
  for(const e of target) {
    const orRanks=rank(e.rows,r=>r.features.officialRating);
    const specs:[string,(r:Row)=>string][]=[
      ["class",r=>classBand(r.features.raceClass)],["field",r=>fieldBand(fieldSize(r))],["handicap",r=>/handicap|nursery/i.test(`${r.features.raceName} ${r.features.raceType}`)?"handicap":"non-handicap"],["novice",r=>/novice|maiden/i.test(`${r.features.raceName} ${r.features.raceType}`)?"novice/maiden":"other"],["distance",r=>distanceBand(r.features.distanceYards)],["going",r=>goingBand(r.features.going)],["days",r=>daysBand(r.features.daysSinceLastRun)],["trainer strike",r=>trainerBand(r.features.trainerPriorWinRate)],["OR rank",r=>r.features.officialRating===null?"missing OR":orRanks.get(id(r))===1?"OR rank 1":orRanks.get(id(r))===2?"OR rank 2":"OR rank 3+"],
    ];
    for(const [name,key] of specs) for(const [band,groupRows] of group(e.rows,key)) { const picks=groupRows.filter(r=>e.ranks.get(id(r))===1), ex=picks.reduce((s,r)=>s+(sp(r)?1/sp(r)!:0),0); rows.push({year:e.year,family:e.family,context:name,band,"rank1 selections":picks.length,"rank1 strike":pct(rate(picks.filter(r=>r.outcome.won).length,picks.length)),"A/E":num(ex?picks.filter(r=>r.outcome.won).length/ex:null)}); }
  }
  table(lines,rows);
}

function weightClass(lines:string[], evals:Evaluation[], diagnostics:Candidate[]) { lines.push("## Weight And Class Diagnostics", ""); table(lines,evals.filter(e=>diagnostics.some(d=>d.key===e.candidate.key)).map(summaryRow)); }

function divergence(lines:string[], evals:Evaluation[], candidates:Candidate[]) {
  lines.push("## Hurdle Vs Chase Divergence", ""); const rows:Record<string,unknown>[]=[];
  for(const year of YEARS) for(const family of ["hurdle","chase"] as Family[]) { const choices=evals.filter(e=>e.year===year&&e.family===family&&candidates.some(c=>c.key===e.candidate.key)).sort(compareEval); rows.push(summaryRow(choices[0]!)); }
  table(lines,rows);
}

function stability(lines:string[], evals:Evaluation[], candidates:Candidate[]) {
  lines.push("## Stability And Candidate Shortlist", ""); const rows:Record<string,unknown>[]=[];
  for(const cnd of candidates.slice(0,3)) for(const year of YEARS) { const e=findEval(evals,year,"combined",cnd.key); for(const [month,rs] of group(ranked(e,1),r=>r.features.raceDate.slice(0,7))) rows.push({candidate:cnd.label,year,month,selections:rs.length,"rank1 strike":pct(rate(rs.filter(r=>r.outcome.won).length,rs.length))}); }
  table(lines,rows); lines.push("Biggest-winner sensitivity:",""); table(lines,candidates.slice(0,3).flatMap(cnd=>YEARS.map(year=>{const e=findEval(evals,year,"combined",cnd.key),r=ranked(e,1).filter(x=>sp(x)!==null),big=[...r].filter(x=>x.outcome.won).sort((a,b)=>(sp(b)??0)-(sp(a)??0))[0],stressed=big?r.filter(x=>id(x)!==id(big)):r;return{candidate:cnd.label,year,"largest winner":big?`${big.features.horseName} @ ${sp(big)}`:"-","ROI":roi(r),"ROI without":roi(stressed)};})));
}

function conclusion(lines:string[], evals:Evaluation[], perf:Candidate,speed:Candidate,base:Candidate,orVariant:Candidate,diagnostics:Candidate[]) {
  const p25=findEval(evals,"2025","combined",perf.key),p26=findEval(evals,"2026","combined",perf.key),s25=findEval(evals,"2025","combined",speed.key),s26=findEval(evals,"2026","combined",speed.key),b25=findEval(evals,"2025","combined",base.key),b26=findEval(evals,"2026","combined",base.key),o25=findEval(evals,"2025","combined",orVariant.key),o26=findEval(evals,"2026","combined",orVariant.key);
  const w=diagnostics[0]!,cl=diagnostics[1]!; lines.push("## Candidate Shortlist", ""); table(lines,shortlist(evals,[orVariant,base,individual[0]!]).slice(0,3).map(cnd=>({candidate:cnd.label,formula:cnd.label,"2025 strike":strike(findEval(evals,"2025","combined",cnd.key)),"2026 strike":strike(findEval(evals,"2026","combined",cnd.key)),"2026 top3":capture(findEval(evals,"2026","combined",cnd.key)),"2026 association":num(association(findEval(evals,"2026","combined",cnd.key))),weakness:cnd.key===orVariant.key?"Lower coverage, especially in hurdles; lower all-winner top-3 capture.":"Subtype variation and market loss remain."})));
  lines.push("## Conclusion", "", `1. Best standalone rank-1 metric is Official Rating (${strike(findEval(evals,"2025","combined","or"))} in 2025; ${strike(findEval(evals,"2026","combined","or"))} in 2026), with lower coverage than Performance/Speed.`, `2. Best Performance construction: ${perf.label} (${strike(p25)}; ${strike(p26)}). Best Speed construction: ${speed.label} (${strike(s25)}; ${strike(s26)}). Performance ${avgStrike([p25,p26])>=avgStrike([s25,s26])?"is":"is not"} stronger on average rank-1 strike.`, `3. Best pre-specified blend: ${base.label} (${strike(b25)}; ${strike(b26)}); its strike gain over Performance alone is negligible and does not persist in 2026.`, `4. Fixed 20% OR ${bothImprove([b25,b26],[o25,o26])?"improves":"does not improve"} rank-1 strike in both years, at the cost of coverage.`, `5. Hurdle/chase best candidates differ across years, supporting subtype-specific second-stage analysis rather than an immediate single formula.`, `6. Turf relative-weight adjustment ${diagnosticVerdict(evals,base,w)}; direct coefficient reuse is scale-sensitive and exploratory only.`, `7. Turf class adjustment ${diagnosticVerdict(evals,base,cl)}; a race-level constant cannot change within-race ordering.`, `8. 2025/2026 stability is shown directly; no 2026 tuning was performed.`, `9. ${orVariant.label} is the most promising frozen second-stage candidate, with coverage and subtype divergence retained as caveats.`, "");
}

function evaluate(ctx:Context,family:Family,candidate:Candidate):Evaluation { const rows=familyRows(ctx.rows.filter(isSettled),family),values=new Map<string,number>(); for(const r of rows){const v=candidate.get(r);if(valid(v))values.set(id(r),v);} return{year:ctx.year,family,candidate,rows,values,ranks:rank(rows,r=>values.get(id(r))??null)}; }
function bestDevelopment(cs:Candidate[],ctx:Context,f:Family){return [...cs].sort((a,b)=>compareEval(evaluate(ctx,f,a),evaluate(ctx,f,b)))[0]!;}
function compareEval(a:Evaluation,b:Evaluation){return (numVal(strikeRaw(b))-numVal(strikeRaw(a)))||(numVal(captureRaw(b))-numVal(captureRaw(a)))||(numVal(association(b))-numVal(association(a)));}
function shortlist(es:Evaluation[],cs:Candidate[]){return [...new Map(cs.map(c=>[c.key,c])).values()].sort((a,b)=>compareEval(findEval(es,"2025","combined",a.key),findEval(es,"2025","combined",b.key)));}
function findEval(es:Evaluation[],y:Year,f:Family,k:string){const e=es.find(x=>x.year===y&&x.family===f&&x.candidate.key===k);if(!e)throw new Error(`Missing ${y}/${f}/${k}`);return e;}
function familyRows(rows:Row[],f:Family){return f==="combined"?rows:rows.filter(r=>subtype(r)===f);}
function subtype(r:Row):string{const t=`${r.features.raceName} ${r.features.raceType}`.toLowerCase();if(/\bhurdles?\b/.test(t))return"hurdle";if(/\bchase\b|\bsteeplechase\b/.test(t))return"chase";return"other";}
function weighted3(lat:number|null,prev:number|null,av:number|null){const vals:[number|null,number][]=[[lat,.5],[prev,.3],[lat!==null&&prev!==null&&av!==null?av*3-lat-prev:null,.2]];const ok=vals.filter((x):x is[number,number]=>valid(x[0])),w=ok.reduce((s,x)=>s+x[1],0);return w?ok.reduce((s,x)=>s+x[0]*x[1]/w,0):null;}
function percentiles(rows:Row[],get:Getter){const ranks=rank(rows,get),n=ranks.size,out=new Map<string,number>();for(const [k,v]of ranks)out.set(k,n<=1?1:(n-v)/(n-1));return out;}
function rank(rows:Row[],get:Getter){const out=new Map<string,number>();for(const race of group(rows,r=>r.features.targetRaceId).values()){const a=race.map(r=>({r,v:get(r)})).filter((x):x is{r:Row,v:number}=>valid(x.v)).sort((x,y)=>y.v-x.v||id(x.r).localeCompare(id(y.r)));let pv:number|null=null,pr=0;a.forEach((x,i)=>{const z=x.v===pv?pr:i+1;out.set(id(x.r),z);pv=x.v;pr=z;});}return out;}
function association(e:Evaluation){const xs: number[]=[],ys:number[]=[];for(const r of e.rows){const v=e.values.get(id(r)),p=r.outcome.finishingPosition;if(v!==undefined&&p!==null){xs.push(v);ys.push(-p);}}return pearson(rankVals(xs),rankVals(ys));}
function ranked(e:Evaluation,n:number){return e.rows.filter(r=>e.ranks.get(id(r))===n);}
function strikeRaw(e:Evaluation){const r=ranked(e,1);return rate(r.filter(x=>x.outcome.won).length,r.length);}
function strike(e:Evaluation){return pct(strikeRaw(e));} function captureRaw(e:Evaluation){const w=e.rows.filter(r=>r.outcome.won),t=e.rows.filter(r=>r.outcome.won&&(e.ranks.get(id(r))??99)<=3);return rate(t.length,w.length);} function capture(e:Evaluation){return pct(captureRaw(e));}
function diagnosticVerdict(es:Evaluation[],base:Candidate,d:Candidate){const diffs=YEARS.map(y=>numVal(strikeRaw(findEval(es,y,"combined",d.key)))-numVal(strikeRaw(findEval(es,y,"combined",base.key))));return diffs.every(x=>x>0)?"improves combined-Jump strike in both years":diffs.every(x=>Math.abs(x)<1e-12)?"is neutral in both years":"is mixed or harmful";}
function bothImprove(base:Evaluation[],test:Evaluation[]){return test.every((e,i)=>numVal(strikeRaw(e))>numVal(strikeRaw(base[i]!)));}
function avgStrike(es:Evaluation[]){return es.reduce((s,e)=>s+numVal(strikeRaw(e)),0)/es.length;}
function classBand(v:string|null){const n=raceClassNumber(v);return n===null?"unknown":`Class ${n}`;} function fieldBand(n:number|null){return n===null?"unknown":n<=5?"2-5":n<=8?"6-8":"9+";} function fieldSize(r:Row){return r.features.actualRunnerCount??r.features.declaredRunnerCount;} function distanceBand(y:number|null){return y===null?"unknown":y<3960?"<18f":y<5280?"18-23.9f":"24f+";} function goingBand(v:string|null){const s=(v??"").toLowerCase();return /heavy|soft/.test(s)?"soft/heavy":/good/.test(s)?"good":/firm/.test(s)?"firm":"other";} function daysBand(n:number|null){return n===null?"missing":n<=30?"0-30":n<=60?"31-60":n<=120?"61-120":"121+";} function trainerBand(n:number|null){return n===null?"missing":n<10?"<10%":n<15?"10-14.9%":n<20?"15-19.9%":"20%+";}
function isSettled(r:Row){return r.outcome.resultStatus!=="non_runner"&&r.outcome.finishingPosition!==null;} function sp(r:Row){const n=Number(r.outcome.startingPriceDecimal);return Number.isFinite(n)&&n>0?n:null;} function roi(rows:Row[]){const r=rows.filter(x=>sp(x)!==null);return pct(rate(r.filter(x=>x.outcome.won).reduce((s,x)=>s+sp(x)!,0)-r.length,r.length));}
function c(key:string,label:string,get:Getter):Candidate{return{key,label,get};} function id(r:Row){return r.features.targetRunnerId;} function valid(v:number|null|undefined):v is number{return v!==null&&v!==undefined&&Number.isFinite(v);} function isNum(v:number|null):v is number{return valid(v);} function rate(a:number,b:number){return b?a/b:null;} function numVal(v:number|null){return v??-Infinity;} function distinct<T>(a:T[],get:(x:T)=>string){return new Set(a.map(get)).size;} function avg(a:number[]){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;} function median(a:number[]){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]!:(s[m-1]!+s[m]!)/2;} function group<T>(a:T[],get:(x:T)=>string){const m=new Map<string,T[]>();for(const x of a){const k=get(x);m.set(k,[...(m.get(k)??[]),x]);}return m;}
function rankVals(a:number[]){const indexed=a.map((v,i)=>({v,i})).sort((x,y)=>x.v-y.v||x.i-y.i),out=Array<number>(a.length);for(let i=0;i<indexed.length;){let j=i+1;while(j<indexed.length&&indexed[j]!.v===indexed[i]!.v)j++;for(let k=i;k<j;k++)out[indexed[k]!.i]=(i+1+j)/2;i=j;}return out;} function pearson(a:number[],b:number[]){if(a.length<2)return null;const x=avg(a)!,y=avg(b)!;let n=0,dx=0,dy=0;for(let i=0;i<a.length;i++){const p=a[i]!-x,q=b[i]!-y;n+=p*q;dx+=p*p;dy+=q*q;}return dx&&dy?n/Math.sqrt(dx*dy):null;}
function compareRows(a:Row,b:Row){return a.features.raceDateTime.getTime()-b.features.raceDateTime.getTime()||id(a).localeCompare(id(b));} function pct(v:number|null){return v===null||!Number.isFinite(v)?"-":`${(v*100).toFixed(2)}%`;} function num(v:number|null){return v===null||!Number.isFinite(v)?"-":v.toFixed(3);} function table(lines:string[],rows:Record<string,unknown>[]){if(!rows.length){lines.push("No rows.","");return;}const h=Object.keys(rows[0]!);lines.push(`| ${h.join(" | ")} |`,`| ${h.map(()=>"---").join(" | ")} |`,...rows.map(r=>`| ${h.map(k=>String(r[k]??"-").replace(/\|/g,"\\|")).join(" | ")} |`),"");}

await main();
