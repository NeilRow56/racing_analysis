/** Research only. Freeze on 2025, then open the replay in a separate invocation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dateClusterInterval, mean, sum } from "../src/lib/racing/chase-t3-research";
import { normalizeCompleteMarket } from "../src/lib/racing/tissue-value-metrics";
import { raceSoftmax } from "./diagnose-independent-tissue-feasibility";
import { families, type Family, type Race, type ResearchInput, type Runner } from "./extract-retrospective-market-research";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const parseInput = async (path: string) => {
  const text = await readFile(path, "utf8");
  return { input: JSON.parse(text) as ResearchInput, digest: sha(text) };
};
type Pick = Runner & { market: number | null; rankOr: number; rankSpeed: number; rankForm: number; race: Race; x: number[] };
type Book = { race: Race; picks: Pick[]; complete: boolean; marketLog: number[] };
const rank = (value: number | null, field: (number | null)[]) => value === null ? Infinity : 1 + field.filter(x => x !== null && x > value).length;
function midrank(value: number | null, field: (number | null)[]) {
  if (value === null) return 0;
  const observed = field.filter(v => v !== null);
  return observed.length < 2 ? 0 : (observed.filter(v => v < value).length + (observed.filter(v => v === value).length - 1) / 2) / (observed.length - 1) - 0.5;
}
const featureNames = ["OR midrank", "Speed/Form midrank", "Weight midrank", "Age midrank", "Layoff 15–60", "OR missing", "Speed/Form missing", "OR × Speed/Form"];
export function prepare(races: Race[]): Book[] {
  return races.map(race => {
    const market = normalizeCompleteMarket(race.runners.map(r => r.sp));
    const ord = race.runners.map(r => r.or), speed = race.runners.map(r => r.speed);
    const form = race.runners.map(r => r.form), weight = race.runners.map(r => r.weight), age = race.runners.map(r => r.age);
    const picks = race.runners.map((r, i) => {
      const aw = race.family === "AW";
      const p = midrank(r.or, ord), s = midrank(aw ? r.form : r.speed, aw ? form : speed);
      return { ...r, race, market: market?.probabilities[i] ?? null, rankOr: rank(r.or, ord), rankSpeed: rank(r.speed, speed),
        rankForm: rank(r.form, form), x: [p, s, midrank(r.weight, weight), midrank(r.age, age),
          Number(r.layoff !== null && r.layoff >= 15 && r.layoff <= 60), Number(r.or === null),
          Number((aw ? r.form : r.speed) === null), p * s] };
    });
    return { race, picks, complete: market !== null, marketLog: market?.probabilities.map(Math.log) ?? [] };
  });
}

const between = (x: number | null, low: number, high: number) => x !== null && x >= low && x <= high;
const atLeast = (x: number | null, low: number) => x !== null && x >= low;
const rules: { name: string; test: (p: Pick) => boolean; neighbour?: (p: Pick) => boolean }[] = [
  { name: "OR rank 1", test: p => p.rankOr === 1, neighbour: p => p.rankOr <= 2 },
  { name: "Family speed rank 1", test: p => p.rankSpeed === 1, neighbour: p => p.rankSpeed <= 2 },
  { name: "Latest Performance Rating rank 1", test: p => p.rankForm === 1, neighbour: p => p.rankForm <= 2 },
  { name: "OR top 3 and speed top 3", test: p => p.rankOr <= 3 && p.rankSpeed <= 3, neighbour: p => p.rankOr <= 3 && p.rankSpeed <= 4 },
  { name: "Speed rank 1 and OR rank 4+", test: p => p.rankSpeed === 1 && p.rankOr >= 4 && p.or !== null, neighbour: p => p.rankSpeed === 1 && p.rankOr >= 3 && p.or !== null },
  { name: "OR rank 1 and speed rank 4+", test: p => p.rankOr === 1 && p.rankSpeed >= 4 && p.speed !== null, neighbour: p => p.rankOr === 1 && p.rankSpeed >= 3 && p.speed !== null },
  { name: "Speed top 3 and layoff 15–60", test: p => p.rankSpeed <= 3 && between(p.layoff,15,60), neighbour: p => p.rankSpeed <= 3 && between(p.layoff,15,65) },
  { name: "Speed top 3 and layoff 61–120", test: p => p.rankSpeed <= 3 && between(p.layoff,61,120), neighbour: p => p.rankSpeed <= 3 && between(p.layoff,61,125) },
  { name: "OR top 3 and trainer prior rate ≥15%", test: p => p.rankOr <= 3 && atLeast(p.trainerRate,15), neighbour: p => p.rankOr <= 3 && atLeast(p.trainerRate,14) },
  { name: "Speed top 3 and jockey prior rate ≥12%", test: p => p.rankSpeed <= 3 && atLeast(p.jockeyRate,12), neighbour: p => p.rankSpeed <= 3 && atLeast(p.jockeyRate,11) },
  { name: "Handicap, OR down ≥3 lb, speed top 3", test: p => p.race.handicap === "handicap" && atLeast(p.orDrop,3) && p.rankSpeed <= 3, neighbour: p => p.race.handicap === "handicap" && atLeast(p.orDrop,2) && p.rankSpeed <= 3 },
  { name: "Handicap, OR top 3, declared field 2–7", test: p => p.race.handicap === "handicap" && between(p.race.declared,2,7) && p.rankOr <= 3, neighbour: p => p.race.handicap === "handicap" && between(p.race.declared,2,8) && p.rankOr <= 3 },
  { name: "Handicap, speed top 3, declared field 8–11", test: p => p.race.handicap === "handicap" && between(p.race.declared,8,11) && p.rankSpeed <= 3, neighbour: p => p.race.handicap === "handicap" && between(p.race.declared,8,12) && p.rankSpeed <= 3 },
  { name: "Latest Performance Rating top 3 and ≥5 prior runs", test: p => p.rankForm <= 3 && atLeast(p.prior,5), neighbour: p => p.rankForm <= 3 && atLeast(p.prior,4) },
  { name: "Latest speed rank 1 with speed top 3", test: p => p.recent !== null && p.recent === Math.max(...p.race.runners.map(r => r.recent ?? -Infinity)) && p.rankSpeed <= 3, neighbour: p => p.recent !== null && rank(p.recent,p.race.runners.map(r=>r.recent)) <= 2 && p.rankSpeed <= 3 },
  { name: "Performance rank 1 and OR rank 4+", test: p => p.rankForm === 1 && p.rankOr >= 4 && p.or !== null, neighbour: p => p.rankForm === 1 && p.rankOr >= 3 && p.or !== null },
  { name: "Performance top 3 and layoff 15–60", test: p => p.rankForm <= 3 && between(p.layoff,15,60), neighbour: p => p.rankForm <= 3 && between(p.layoff,15,65) },
  { name: "Performance top 3 and both participant rates ≥12%", test: p => p.rankForm <= 3 && atLeast(p.trainerRate,12) && atLeast(p.jockeyRate,12), neighbour: p => p.rankForm <= 3 && atLeast(p.trainerRate,11) && atLeast(p.jockeyRate,11) },
];

type Spec = { name: string; kind: "standalone" | "offset" | "temperature" | "stumps"; penalty: number };
const specs: Spec[] = [
  { name: "Form-only conditional logit", kind: "standalone", penalty: .08 },
  { name: "SP offset L2 .04", kind: "offset", penalty: .04 },
  { name: "SP offset L2 .08", kind: "offset", penalty: .08 },
  { name: "SP offset L2 .16", kind: "offset", penalty: .16 },
  { name: "SP temperature calibration", kind: "temperature", penalty: .08 },
  { name: "SP offset + boosted stumps", kind: "stumps", penalty: 10 },
];
type Stump = { feature: number; cutoff: number; low: number; high: number };
type Fit = { spec: Spec; weights: number[]; stumps: Stump[] };
const dot = (x: number[], w: number[]) => w.reduce((s,v,i)=>s+v*x[i],0);
const candidates = featureNames.flatMap((_,feature) => (feature === 7 ? [-.05,0,.05] : [-.2,0,.2,.5]).map(cutoff => ({feature,cutoff})));
const trainSteps = 160;
const stumpSteps = 12;
function probabilities(book: Book, fit: Fit) {
  const { spec, weights, stumps } = fit;
  return raceSoftmax(book.picks.map((p,i) => {
    const market = book.marketLog[i];
    if (spec.kind === "temperature") return market * (1+weights[0]);
    const shift = spec.kind === "stumps" ? sum(stumps.map(s=>p.x[s.feature]<=s.cutoff?s.low:s.high)) : dot(p.x,weights);
    return spec.kind === "standalone" ? shift : market+shift;
  }));
}
function fitModel(books: Book[], spec: Spec): Fit {
  assert(books.length > 0 && books.every(b=>b.complete));
  const fit: Fit = { spec, weights: spec.kind === "stumps" ? [] : Array<number>(spec.kind === "temperature" ? 1 : featureNames.length).fill(0), stumps: [] };
  if (spec.kind === "stumps") {
    for (let step=0;step<stumpSteps;step++) {
      const residuals = books.map(book => probabilities(book,fit).map((p,i)=>({ g:book.picks[i].credit-p, h:p*(1-p) })));
      let best: (Stump & { gain: number }) | null = null;
      for (const {feature,cutoff} of candidates) {
        let lowG=0,lowH=0,highG=0,highH=0,lowN=0,highN=0;
        for (const [j,book] of books.entries()) for (const [i,p] of book.picks.entries()) {
          const {g,h}=residuals[j][i];
          if(p.x[feature]<=cutoff) {lowG+=g;lowH+=h;lowN++;} else {highG+=g;highH+=h;highN++;}
        }
        if(Math.min(lowN,highN)<150) continue;
        const gain=lowG**2/(lowH+spec.penalty)+highG**2/(highH+spec.penalty)-(lowG+highG)**2/(lowH+highH+spec.penalty);
        const clip = (v: number) => .25*Math.min(.5,Math.max(-.5,v));
        if (best === null || gain > best.gain) best={feature,cutoff,low:clip(lowG/(lowH+spec.penalty)),high:clip(highG/(highH+spec.penalty)),gain};
      }
      if (!best || best.gain <= 0) break;
      const { feature,cutoff,low,high }=best;
      fit.stumps.push({feature,cutoff,low,high});
    }
    return fit;
  }
  for (let step=0;step<trainSteps;step++) {
    const grad = fit.weights.map(v=>spec.penalty*v);
    for (const book of books) {
      const pred=probabilities(book,fit);
      for (const [i,p] of book.picks.entries()) {
        const error=(pred[i]-p.credit)/books.length;
        if(spec.kind==="temperature") grad[0]+=error*book.marketLog[i];
        else for(let k=0;k<grad.length;k++) grad[k]+=error*p.x[k];
      }
    }
    fit.weights=fit.weights.map((v,i)=>v-.55*grad[i]);
    if(spec.kind==="temperature") fit.weights[0]=Math.max(-.75,Math.min(1,fit.weights[0]));
  }
  return fit;
}

type Metrics = ReturnType<typeof money>;
const distinct = <T>(xs: T[]) => new Set(xs).size;
function money(picks: Pick[]) {
  const priced=picks.filter(p=>p.pnl!==null), covered=picks.filter(p=>p.market!==null);
  const wins=picks.filter(p=>p.credit>0).length, expected=sum(covered.map(p=>p.market!));
  const actual=sum(covered.map(p=>p.credit));
  const total=priced.length ? sum(priced.map(p=>p.pnl!)) : null;
  return { n:picks.length, races:distinct(picks.map(p=>p.race.id)), dates:distinct(picks.map(p=>p.race.date)), wins, strike:picks.length?wins/picks.length:null,
    marketN:covered.length, expected:covered.length?expected:null, actual, ae:expected?actual/expected:null,
    stakes:priced.length, odds:mean(priced.map(p=>p.sp!)), profit:total, roi:total===null?null:total/priced.length };
}
function robust(picks: Pick[]) {
  const priced = picks.filter(p=>p.pnl!==null);
  const benchmark = picks.filter(p=>p.market!==null);
  const groups=[...Map.groupBy(priced,p=>p.race.id).values()].filter(ps=>ps.some(p=>p.credit>0))
    .map(ps=>({ id:ps[0].race.id, date:ps[0].race.date, course:ps[0].race.course, gross:sum(ps.map(p=>p.pnl!+1)), stakes:ps.length }))
    .sort((a,b)=>b.gross-a.gross||a.id.localeCompare(b.id)).slice(0,2);
  const drops=[1,2].map(n=>groups.length<n?null:money(picks.filter(p=>!groups.slice(0,n).some(g=>g.id===p.race.id))));
  const gross=sum(priced.map(p=>p.pnl!+1));
  return { groups, drops, share:gross ? sum(groups.map(g=>g.gross))/gross : null,
    ae:dateClusterInterval(benchmark.map(p=>({ date:p.race.date,value:p.credit,denominator:p.market! }))),
    roi:dateClusterInterval(priced.map(p=>({ date:p.race.date,value:p.pnl!,denominator:1 }))) };
}
function quality(books: Book[], score: (b: Book)=>number[]) {
  const bins = Array.from({length:10},()=>({n:0,expected:0,actual:0}));
  let loss=0,brier=0,top3=0;
  const best: Pick[]=[];
  const lossByDate: {date:string; value:number; denominator:number}[]=[];
  for(const book of books) {
    const pred=score(book);
    assert(pred.length===book.picks.length && pred.every(p=>p>0 && p<=1) && Math.abs(sum(pred)-1)<1e-8);
    const marketLoss=book.picks.reduce((s,p,i)=>s-p.credit*book.marketLog[i],0);
    let raceLoss=0;
    for(const [i,p] of book.picks.entries()) {
      const prob=pred[i];
      raceLoss-=p.credit*Math.log(prob);
      brier+=(prob-p.credit)**2;
      const bin=bins[Math.min(9,Math.floor(prob*10))];
      bin.n++;
      bin.expected+=prob;
      bin.actual+=p.credit;
    }
    loss+=raceLoss;
    lossByDate.push({date:book.race.date,value:raceLoss-marketLoss+4,denominator:1});
    const order=pred.map((_,i)=>i).sort((a,b)=>pred[b]-pred[a]||book.picks[a].id.localeCompare(book.picks[b].id));
    best.push(book.picks[order[0]]);
    top3+=Number(order.slice(0,3).some(i=>book.picks[i].credit>0));
  }
  const n=books.length;
  const rawInterval=dateClusterInterval(lossByDate);
  return { n, loss:n?loss/n:null, brier:n?brier/n:null, calibration:n?sum(bins.map(b=>Math.abs(b.expected-b.actual)))/sum(bins.map(b=>b.n)):null,
    top3:n?top3/n:null, top1:money(best), sensitivity:robust(best), delta:rawInterval?.map(x=>x-4) ?? null };
}
const marketScore = (b: Book) => b.picks.map(p=>p.market!);
const tissueScore = (b: Book) => b.picks.map(p=>p.tissue!);
const quarter = (date:string) => "Q"+Math.ceil(Number(date.slice(5,7))/3);
const prices = (sp: number | null) => sp === null ? "Missing" : sp<3 ? "<3" : sp<5 ? "3–<5" : sp<11 ? "5–<11" : sp<21 ? "11–<21" : "21+";
const field = (n: number) => n<8?"2–7":n<12?"8–11":"12+";
const ruleId = (index:number) => "R"+String(index+1).padStart(2,"0");
type RuleRecord={family:Family; index:number; discovery:Metrics};
const preferred=(records:RuleRecord[])=>[...records].filter(r=>r.discovery.stakes>=200&&r.discovery.marketN>=150&&r.discovery.dates>=60)
  .sort((a,b)=>(b.discovery.roi??-Infinity)-(a.discovery.roi??-Infinity)||a.index-b.index)[0];
type Freeze = {
  input: string; config: string; analysisScript: string; models: {family:Family; fits:Fit[]; walk:{fold:string;n:number;score:{name:string;loss:number|null}[]}[]}[];
  rules: RuleRecord[]; finalists: {family:Family;index:number}[];
};
const configHash = sha(JSON.stringify({ specs, featureNames, candidates, trainSteps, stumpSteps,
  rules:rules.map(r=>[r.name,r.test.toString(),r.neighbour?.toString()]) }));
const scriptPath="scripts/retrospective-market-research.ts";
const scriptHash=()=>readFile(scriptPath, "utf8").then(sha);
function plainLoss(books: Book[], pred: (b: Book)=>number[]) {
  return mean(books.map(b=>{const p=pred(b);return -sum(b.picks.map((r,i)=>r.credit*Math.log(p[i])));}));
}
async function freeze(path: string) {
  const {input,digest}=await parseInput(path);
  assert(input.races.every(r=>r.date.startsWith("2025")));
  const books=prepare(input.races);
  const records=families.flatMap(family=>{
    const picks=books.filter(b=>b.race.family===family).flatMap(b=>b.picks);
    return rules.map((rule,index)=>({family,index,discovery:money(picks.filter(rule.test))}));
  });
  const finalists=families.flatMap(family=>{
    const best=preferred(records.filter(x=>x.family===family));
    return best ? [{family,index:best.index}] : [];
  });
  const models=families.map(family=>{
    const matched=books.filter(b=>b.race.family===family&&b.complete);
    const fits=specs.map(spec=>fitModel(matched,spec));
    const walk=["Q2","Q3","Q4"].flatMap(fold=>{
      const before=matched.filter(b=>quarter(b.race.date)<fold), after=matched.filter(b=>quarter(b.race.date)===fold);
      if(before.length<100||after.length<30) return [];
      const score=[{name:"Final-SP market",loss:plainLoss(after,marketScore)},...specs.map(spec=>{
        const fit=fitModel(before,spec);
        return {name:spec.name,loss:plainLoss(after,b=>probabilities(b,fit))};
      })];
      return [{fold,n:after.length,score}];
    });
    return {family,fits,walk};
  });
  const result:Freeze={ input:digest,config:configHash,analysisScript:await scriptHash(),models,rules:records,finalists };
  console.log(JSON.stringify(result,null,2));
}

const d=(n:number|null,places=2)=>n===null?"—":n.toFixed(places);
const pct=(n:number|null)=>n===null?"—":`${(100*n).toFixed(2)}%`;
const ci=(x:readonly number[]|null, format=d)=>x?`${format(x[0])} to ${format(x[1])}`:"—";
const out=(s:string)=>process.stdout.write(s+"\n\n");
const md=(cols:string[],rows:(number|string)[][])=>[cols,cols.map(()=> "---"),...rows]
  .map(row=>`| ${row.map(v=>String(v).replaceAll("|","\\|")).join(" | ")} |`).join("\n");
const cash=(m:Metrics|null)=>m?`${d(m.profit)} / ${pct(m.roi)} (${m.stakes})`:"—";
const summaryCols=["Races / dates","Selections","Winners","Strike","Market n","Market E","Market A/E","SP stakes","Mean SP","P/L £","ROI"];
const moneyCells=(m:Metrics)=>[`${m.races} / ${m.dates}`,m.n,m.wins,pct(m.strike),m.marketN,d(m.expected),d(m.ae,3),m.stakes,d(m.odds),d(m.profit),pct(m.roi)];
const style="Market A/E uses fractional dead-heat credits on market-covered selections. Wins and strike count horses with a winning result flag. A £1 SP stake requires valid canonical v3 settlement and a decimal SP greater than one. These denominators are reported separately.";
function qualityTable(label:string,books:Book[],fits:Fit[], tissue:boolean, quote=false) {
  if (!books.length) return;
  const models=[{name:quote?"Captured-quote market":"Final-SP market",predict:marketScore},
    ...(tissue?[{name:"Frozen Tissue",predict:tissueScore}]:[]),
    ...fits.map(fit=>({name:quote?fit.spec.name.replaceAll("SP","Quote"):fit.spec.name,predict:(b:Book)=>probabilities(b,fit)}))];
  const rows=models.map(({name,predict})=>({name,q:quality(books,predict)}));
  out(`### ${label} (${books.length} races)\n\n${md(["Model","Log loss","Brier","Calibration error","Δ log loss vs market [95% interval]","Top 1","Top 3","Top-1 A/E","Top-1 £ / ROI (stakes)","Without largest £ / ROI (stakes)","Without two £ / ROI (stakes)"],
    rows.map(({name,q},i)=>[name,d(q.loss,5),d(q.brier,5),pct(q.calibration),i?`${d(q.loss!-rows[0].q.loss!,5)} [${ci(q.delta,x=>d(x,5))}]`:"—",
      pct(q.top1.strike),pct(q.top3),d(q.top1.ae,3),cash(q.top1),cash(q.sensitivity.drops[0]),cash(q.sensitivity.drops[1])]))}`);
}
function modelTopPicks(books: Book[], fit: Fit) {
  return books.map(book=>{
    const p=probabilities(book,fit);
    const ranked=p.map((_,i)=>i).sort((a,b)=>p[b]-p[a]||book.picks[a].id.localeCompare(book.picks[b].id));
    return book.picks[ranked[0]];
  });
}
function breakdown(rows:Pick[],group:(p:Pick)=>string) {
  return [...Map.groupBy(rows,group)].sort(([a],[b])=>a.localeCompare(b)).map(([k,picks])=>[k,...moneyCells(money(picks))]);
}
function concentration(rows:Pick[],group:(p:Pick)=>string) {
  const ranked=[...Map.groupBy(rows,group)].map(([k,picks])=>{
    const gross=sum(picks.filter(p=>p.pnl!==null).map(p=>p.pnl!+1));
    return {k,gross,m:money(picks)};
  }).sort((a,b)=>b.gross-a.gross||a.k.localeCompare(b.k));
  const total=sum(ranked.map(r=>r.gross));
  return ranked.slice(0,5).map(r=>[r.k,r.m.n,r.m.wins,d(r.gross),pct(total?r.gross/total:null),d(r.m.profit),pct(r.m.roi)]);
}
function campaign(label:string,rows:Pick[]) {
  const r=robust(rows);
  const groupings=[
    ["Month",(p:Pick)=>p.race.date.slice(0,7)],["Quarter",(p:Pick)=>quarter(p.race.date)],
    ["Final decimal SP",(p:Pick)=>prices(p.sp)],["Proved starter count",(p:Pick)=>field(p.race.runners.length)],
  ] as const;
  out(`<details>\n<summary>${label}</summary>\n\n${r.groups.map(g=>`- Winning race \`${g.id}\` on ${g.date} at ${g.course}, £${d(g.gross)} gross over ${g.stakes} selected stakes.`).join("\n")}
\n${groupings.map(([heading,group])=>md([heading,...summaryCols],breakdown(rows,group))).join("\n\n")}
\n${[["Course",(p:Pick)=>p.race.course],["Trainer",(p:Pick)=>p.trainer??"Unknown"]] .map(([heading,group])=>md([heading as string,"Selections","Wins","Gross £","Share of gross","P/L £","ROI"],concentration(rows,group as (p:Pick)=>string))).join("\n\n")}
\n</details>`);
}
function tissueDisagreement(books:Book[]) {
  const result = [];
  for (const book of books) {
    const picks=[...book.picks].sort((a,b)=>b.tissue!-a.tissue!||a.id.localeCompare(b.id));
    const top=picks[0];
    const fav=[...picks].sort((a,b)=>b.market!-a.market!||a.id.localeCompare(b.id))[0];
    result.push({group:top.id===fav.id?"T1 agrees with market top slot":"T1 differs from market top slot",p:top});
    if(top.or!==null)result.push({group:top.rankOr===1?"T1 agrees with OR rank 1":"T1 disagrees with OR rank 1",p:top});
    if(top.speed!==null)result.push({group:top.rankSpeed===1?"T1 agrees with family speed rank 1":"T1 disagrees with family speed rank 1",p:top});
    if(picks[2]&&book.race.family==="CHASE")result.push({group:"Chase T3 (all covered)",p:picks[2]});
  }
  return [...Map.groupBy(result,r=>r.group)].map(([group,rows])=>[group,...moneyCells(money(rows.map(r=>r.p)))]);
}
async function report(discoveryPath:string,freezePath:string,replayPath:string) {
  const [{input:discovery,digest},{input:replay},frozenText]=await Promise.all([parseInput(discoveryPath),parseInput(replayPath),readFile(freezePath, "utf8")]);
  const frozen:Freeze=JSON.parse(frozenText);
  assert.equal(frozen.input,digest);
  assert.equal(frozen.config,configHash);
  assert.equal(frozen.analysisScript,await scriptHash());
  assert(replay.races.every(r=>r.date.startsWith("2026")));
  const discoveryIds=new Set(discovery.races.map(r=>r.id));
  assert(replay.races.every(r=>!discoveryIds.has(r.id)) && replay.generation.every(r=>!discoveryIds.has(r.id)));
  const sourceBooks=prepare(discovery.races), replayBooks=prepare(replay.races), genBooks=prepare(replay.generation);
  const studies = frozen.finalists.flatMap(({family,index})=>[["2025",sourceBooks],["2026",replayBooks]].map(([year,books])=>{
    const rule=rules[index];
    const pool=(books as Book[]).filter(b=>b.race.family===family).flatMap(b=>b.picks);
    const picks=pool.filter(rule.test);
    return {family,index,year:year as string,picks,m:money(picks),r:robust(picks),near:money(pool.filter(rule.neighbour!))};
  }));
  const winners = frozen.rules.filter(r=>(r.discovery.roi??0)>0);
  const topMoney = [...frozen.rules].sort((a,b)=>(b.discovery.roi??-Infinity)-(a.discovery.roi??-Infinity))[0];
  const top2025=[...studies].filter(r=>r.year==="2025").sort((a,b)=>(b.m.roi??-Infinity)-(a.m.roi??-Infinity))[0];
  const top2026=studies.find(r=>r.year==="2026"&&r.family===top2025.family)!;
  out(`# Retrospective racing market discovery

## A. Executive conclusion

<!-- narrative -->

The largest ROI among the four 2025 finalists was **${top2025.family} ${ruleId(top2025.index)} (${rules[top2025.index].name}), ${pct(top2025.m.roi)} from ${top2025.m.stakes} priced selections**. The same frozen rule replayed at **${pct(top2026.m.roi)} from ${top2026.m.stakes} stakes** in previously explored 2026. Canonical market A/E was ${d(top2025.m.ae,3)} and ${d(top2026.m.ae,3)}. Across the full 72-rule search, including rules below the finalist evidence floor, the raw best was ${topMoney.family} ${ruleId(topMoney.index)} at ${pct(topMoney.discovery.roi)} from ${topMoney.discovery.stakes} stakes. ${winners.length} of 72 candidates recorded positive 2025 P/L.`);

  out(`## B. Data coverage and provenance

The live local PostgreSQL endpoint refused the read-only connection. The study reads the existing Sporting Life database exports, pinned isolated 2026 Jump cache, and local source result payloads. The current SQL schema and historical feature builder provide the field inventory. There was no rebuild, network scrape, live database write or data backfill.

| Provenance | Available evidence and treatment |
| --- | --- |
| A. Proven pre-off | Latest accepted November Tissue generation books freeze scheduled off, capture timestamp, input vectors, model/version, and complete captured median-bookmaker quotes. The loader verifies capture before scheduled off and feature cutoff before capture. Eligible captures are shown separately. |
| B. Reconstructed before target | Cached date and scheduled time, family/type, course, class, distance, going, declared count, handicap classification, age, weight, official rating, prior speed and Performance Rating, prior runs, layoff and official-rating change. Prior numerical form requires a latest run date strictly before the target calendar date. Within-race ranks are derived among eventual starters and may differ from pre-off ranks. Declarations and provider publication time lack complete historical snapshots. |
| B. Participant history | Trainer and jockey rates are reconstructed from earlier scheduled races. Earlier races on the same date can contribute. Their actual publication times are unavailable, so these rules have greater timing risk. The fitted models exclude both participant rates. |
| C. Post-race | Final SP, finishing position, non-finisher code, winning time, true starter count and final outcomes. Settlement and starter completeness use these fields. Only the explicit market-offset and temperature diagnostics condition on normalized final SP, which is a retrospective baseline and cannot establish a deployable strategy. Absolute actual field size, target result, winning time and final SP do not enter standalone selection features or simple rules. |
| D. Missing or unreliable | No comparable earlier pre-off market book or timestamped Tissue vector history across the four families. Course/class/going exist but are reconstructed. Prior class movement lacks a consistently pinned as-of input in these exports, so the rules use a drop in official rating as a separate, available dimension. Raw result pages may contain future entries or embedded histories, which are excluded entirely. |

The 2025 caches use v4 historical features. 2026 Chase and Hurdle use the isolated Jump cache to 14 October with independent full-result identity proof and the updated time guard. Other races require a unique local final-result match by date, normalized course and race name, one-to-one whole horse roster, distinct provider ride IDs, agreement on places and non-runners, and starter total equal to the source result. Result-only evidence is attached in memory. This offline join lacks the source-ID bridge available for isolated Jump. Unresolved and void races, duplicate or unproved joins, one-runner fields and inconsistent dead heats are excluded. The canonical dead-heat divisor determines gross return. Market probabilities are normalized inverse prices over the complete verified starter field.

${md(["Year","Family","Exported races","Exported runner records","Proved races","Excluded races","Coverage"],
  [["2025",discovery,sourceBooks],["2026",replay,replayBooks]].flatMap(([y,data,books])=>{
    const sample=data as ResearchInput, bs=books as Book[];
    return sample.inventory.map(i=>{
      const subset=bs.filter(b=>b.race.family===i.family);
      return [y as string,i.family,i.races,i.rows,subset.length,i.races-subset.length,`${subset[0]?.race.date??"—"} through ${subset.at(-1)?.race.date??"—"}`];
    });
  }))}

${md(["Year","Eligibility exclusion","Races"],[["2025",discovery],["2026",replay]].flatMap(([y,data])=>Object.entries((data as ResearchInput).audit).sort()
  .map(([reason,n])=>[y as string,reason,n])))}

<details>
<summary>Field availability by export</summary>

${md(["Year","Family","Feature","Present","Runner records","Coverage"],[["2025",discovery],["2026",replay]].flatMap(([y,data])=>(data as ResearchInput).inventory
    .flatMap(i=>Object.entries(i.coverage).map(([feature,n])=>[y as string,i.family,feature,n,i.rows,pct(n/i.rows)]))))}

</details>`);

  out(`## C. Market and Tissue baselines

Coverage below uses the proved historical fields. Winner count can exceed race count when there is a dead heat. Probability scores require a complete market and use race-mean win log loss, race-mean summed multiclass Brier and runner-weighted absolute calibration error over ten equal-width bins. Existing Tissue is compared in Section G wherever frozen data match. Earlier cross-family historical Tissue coverage is unavailable.

${md(["Family","Year","Races","Starters","Winners","SP n","SP coverage","Market races","Market runners","Log loss","Brier","Calibration error","Market favourite capture"],
  families.flatMap(family=>[["2025",sourceBooks],["2026",replayBooks]].map(([year,books])=>{
    const bs=(books as Book[]).filter(b=>b.race.family===family), picks=bs.flatMap(b=>b.picks), q=quality(bs.filter(b=>b.complete),marketScore);
    const m=money(picks);
    return [family,year as string,bs.length,m.n,m.wins,m.stakes,pct(m.stakes/m.n),q.n,m.marketN,d(q.loss,5),d(q.brier,5),pct(q.calibration),pct(q.top1.strike)];
  })))}`);

  out(`## D. Search methodology

- 18 fixed rule definitions × four families = **72 configurations**. All were evaluated against known 2025 results, so every figure labelled discovery is **in-sample/backfitted**. Rule thresholds were written before scoring the grid. Existing historical analysis informed the variables and cutoffs (OR, speed, participant rates, layoff and form). Only rule/family finalism and fitted coefficients or tree splits were selected from study outcomes. A rule keeps all tied competition ranks. No selection uses an SP threshold to enter a rule.
- The best 2025 ROI within each family qualified with at least 200 priced stakes, 150 complete-market selections and 60 distinct race dates. The minimums control very small samples. The four selected rules, their predetermined one-step neighbours, all six fitted model configurations per family, and the input/configuration hashes were frozen before the 2026 file was opened. The neighbours are sensitivity checks and were never eligible for promotion. The full candidate table retains failures.
- Six probability configurations × four families = **24 full 2025 fits**. Whole races and dates are also kept intact for expanding-quarter validation. There are ${sum(frozen.models.map(m=>m.walk.length))} eligible held-quarter evaluations per configuration grid (${6*sum(frozen.models.map(m=>m.walk.length))} additional fits). The holdout quarters use earlier whole dates only. 2026 results are an already explored cross-year replay and never change parameters or the ranking used to choose finalists. No model configuration is selected using 2026.
- The standalone model estimates a softmax over eight interpretable features using race-mean likelihood and L2 .08. The three offset sensitivities add the same feature score to log normalized market probability at L2 .04/.08/.16. The market-only calibration fits a penalized temperature. Features are race-relative midranks for OR, best recent speed (AW uses latest Performance Rating as a shared capture-compatible proxy), weight and age, a 15–60 day layoff indicator, two missing flags and an OR × speed/form interaction. Midranks are centred, ties share a midrank, and missing values take the centre. The model uses no course or trainer IDs, actual field-count feature or participant rates.
- The nonlinear model adds at most 12 depth-one trees to the market offset, testing 31 predefined feature/cutpoint pairs per round. It uses fractional winner residuals and bounded second-order leaf updates with L2 10, shrinkage .25, minimum 150 runners in each leaf and capped leaf increments. No extra tree depth, seed, feature or iteration grid was searched. Full-race softmax keeps the scores coherent. Both the linear and nonlinear market-relative forms require market prices for scoring.
- Comparison intervals use 2,000 deterministic race-date cluster bootstrap draws. They capture sampling variation within the evaluated population. They do not account for the search or repeated prior use of 2026. SP returns are uncapped arithmetic at quoted historical settlement and do not include commissions or execution friction.

${style}`);

  out(`## E. All 2025 discovery rules

All candidates appear in fixed order. Original thresholds and the single neighbour for each shortlisted rule are fully specified in the script. This table includes rules with zero coverage.

${md(["ID","Family","Definition",...summaryCols],frozen.rules.map(r=>[ruleId(r.index),r.family,rules[r.index].name,...moneyCells(r.discovery)]))}`);

  out(`## F. Frozen rule replay

${md(["Family","Rule","Period",...summaryCols],studies.map(s=>[s.family,ruleId(s.index),s.year==="2025"?"2025 discovery":"2026 fixed replay",...moneyCells(s.m)]))}

${md(["Family","Rule","Period","Market A/E 95%","ROI 95%","Top two share of winning gross","After largest £ / ROI (stakes)","After two £ / ROI (stakes)","Fixed neighbour £ / ROI (stakes)","Neighbour market A/E"],
    studies.map(s=>[s.family,ruleId(s.index),s.year,ci(s.r.ae),ci(s.r.roi,pct),pct(s.r.share),cash(s.r.drops[0]),cash(s.r.drops[1]),cash(s.near),d(s.near.ae,3)]))}

Each expandable table gives month, quarter, fixed price bands, verified field-size bands and the five largest contributors by gross return for course and trainer. The 2026 window varies by family. Returns and A/E on a given date are estimates from a small number of races.`);

  for(const s of studies)campaign(`${s.family} ${ruleId(s.index)} • ${s.year}`,s.picks);

  out(`### Additional profitable 2025 rules

These are every other positive in-sample rule. The two removal columns deduct all selected stakes in the omitted winning races, which can include losing bets from those same races.

${md(["Family","Rule","Original £ / ROI (stakes)","Top two gross share","After largest","After two","A/E 95%"],winners.filter(r=>!frozen.finalists.some(f=>f.family===r.family&&f.index===r.index))
    .map(r=>{
      const picks=sourceBooks.filter(b=>b.race.family===r.family).flatMap(b=>b.picks.filter(rules[r.index].test));
      const e=robust(picks);
      return [r.family,ruleId(r.index),cash(r.discovery),pct(e.share),cash(e.drops[0]),cash(e.drops[1]),ci(e.ae)];
    }))}`);

  out(`## G. Probability and ranking comparison

Lower log loss, Brier and calibration error are better. Negative Δ log loss favours the candidate. Winner-ranking accuracy uses a runner-ID tie break and Top 3 counts a race once. Monetary results here select the top runner by the model. The historical market models consume final SP, so their Top-1 returns are retrospective benchmarks. November uses archived pre-off captured quotes in the offset, evaluation and returns. It is a small, already monitored sample with potential feature-distribution changes. For AW the model uses Performance Rating in both periods because the frozen AW vectors do not carry the family-specific speed series.

${md(["Family","Held quarter","Races",...["Final-SP market",...specs.map(s=>s.name)]],
    frozen.models.flatMap(m=>m.walk.map(w=>[m.family,w.fold,w.n,...w.score.map(s=>d(s.loss,5))])))}
`);
  for(const m of frozen.models) {
    for(const [year,books] of [["2025 in-sample",sourceBooks],["2026 fixed replay",replayBooks]] as const) {
      qualityTable(`${m.family} ${year}`,books.filter(b=>b.race.family===m.family&&b.complete),m.fits,false);
    }
    const exact=replayBooks.filter(b=>b.race.family===m.family&&b.complete&&b.picks.every(p=>p.tissue!==undefined));
    qualityTable(`${m.family} 2026 matched promotion reference`,exact,m.fits,true);
    const capture=genBooks.filter(b=>b.race.family===m.family&&b.complete);
    qualityTable(`${m.family} November frozen capture comparison`,capture,m.fits,true,true);
  }

  out(`### Model money concentration

The expandable tables cover every probability configuration with positive in-sample Top-1 SP P/L and its fixed 2026 replay. Market-conditioned selections depend on retrospective prices in these tables.`);
  let profitableModelCount=0;
  for(const m of frozen.models) for(const fit of m.fits) {
    const history=(books: Book[])=>modelTopPicks(books.filter(b=>b.race.family===m.family&&b.complete),fit);
    const train=history(sourceBooks);
    if((money(train).profit??0)<=0)continue;
    profitableModelCount++;
    campaign(`${m.family} ${fit.spec.name} • 2025`,train);
    campaign(`${m.family} ${fit.spec.name} • 2026`,history(replayBooks));
  }
  if(!profitableModelCount)out("No probability configuration recorded positive 2025 Top-1 SP P/L.");

  out(`## H. Tissue disagreement

These descriptive cells are formed only in books with frozen Tissue and a complete market. A runner can appear in more than one agreement comparison. Odds rank here is a benchmark characteristic. Chase T3 is one fixed comparison. AW's archived pre-off vectors do not expose the same AW speed input, so its speed cell is unavailable.`);
  for(const [label,books] of [["2026 historical Chase",replayBooks],["November captured quotes",genBooks]] as const) {
    const rows=families.flatMap(family=>tissueDisagreement(books.filter(b=>b.race.family===family&&b.complete&&b.picks.every(p=>p.tissue!==undefined)))
      .map(r=>[family,...r]));
    out(`### ${label}\n\n${md(["Family","Tissue group",...summaryCols],rows)}`);
  }

  out(`## I. Research Filters

The existing filters support race family, jump subtype, handicap, current race class, distance and field size, runner layoff, historical exposures, participant rates, official-rating and speed/performance ranks, and some OR-relative comparisons. Check competition ranks and the full-runner population when mapping a rule. Filter field size can prefer cached actual count, whereas this experiment uses declared count where size is an input. The family-specific speed series and previous-run OR comparator need the precise research definitions to reproduce these results. Market offset, temperature, the nonlinear score, history availability checks and model disagreement cannot be represented by a simple saved form threshold.

The existing saved Chase, Jump handicap and Turf trainer + TPR filters were reproduced in a separate canonical comparison using their exact saved definitions. This run used those results as context and did not read or update saved records. [Existing cross-year replay](research-filter-cross-year-2026-11-18.md)

<!-- hypotheses -->

## J. Reproduction and integrity

\`\`\`sh
bun scripts/extract-retrospective-market-research.ts 2025 > /tmp/retrospective-2025.json
bun scripts/retrospective-market-research.ts fit /tmp/retrospective-2025.json > /tmp/retrospective-market-freeze.json
bun scripts/extract-retrospective-market-research.ts 2026 > /tmp/retrospective-2026.json
bun scripts/retrospective-market-research.ts report /tmp/retrospective-2025.json /tmp/retrospective-market-freeze.json /tmp/retrospective-2026.json
\`\`\`

The fit command consumes only the 2025 export. The report command checks its SHA-256, the experiment specification hash and the analysis-script hash against the frozen artifact. The historical and prospective files are input only. Lower counts or changed inputs produce a different source fingerprint. November is evaluated separately as a frozen-vector comparability check.

- Experiment configuration SHA-256 \`${frozen.config}\`
- Analysis script SHA-256 \`${frozen.analysisScript}\`
- 2025 sampled input SHA-256 \`${digest}\`
- Frozen 2025 rules and parameters SHA-256 \`${sha(frozenText)}\`
- 2025 raw settlement proof digest \`${discovery.rawDigest}\` across ${discovery.rawBooks} rechecked payloads
- 2026 raw settlement proof digest \`${replay.rawDigest}\` across ${replay.rawBooks} rechecked payloads

<details>
<summary>Cache and frozen input hashes</summary>

${md(["Path","SHA-256"],Object.entries({...discovery.hashes,...replay.hashes}).sort().map(([file,hash])=>[`\`${file}\``,`\`${hash}\``]))}

</details>`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode,first,second,third]=process.argv.slice(2);
  if(mode==="fit"&&first)await freeze(first);
  else if(mode==="report"&&first&&second&&third)await report(first,second,third);
  else throw new Error("Usage: fit INPUT | report DISCOVERY FREEZE REPLAY");
}
