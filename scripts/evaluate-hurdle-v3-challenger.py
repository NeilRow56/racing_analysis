"""Evaluation only: load the sealed 2025-selected challenger, never fit or modify it."""
import argparse
import collections
import hashlib
import json
import math
import pathlib
import statistics
import numpy as np
from importlib.util import module_from_spec, spec_from_file_location

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--directory",default="/tmp/hurdle-v3-rebuild");parser.add_argument("--model",default="data/research/hurdle-tissue-v3-challenger.json");args=parser.parse_args();p=pathlib.Path(args.directory)
    spec=spec_from_file_location("hurdle_v3_training",pathlib.Path(__file__).with_name("train-hurdle-v3-challenger.py"))
    if spec is None or spec.loader is None:raise ImportError("Cannot load Hurdle V3 scoring helpers")
    training=module_from_spec(spec);spec.loader.exec_module(training)
    artifact=json.load(open(args.model));assert artifact["status"]=="challenger_not_promoted" and artifact["trainingPeriod"]["to"]=="2025-12-31"
    original_bytes=pathlib.Path(args.model).read_bytes();model=artifact["model"];names=model["names"];w=np.array(model["weights"]);mu=np.array(model["means"]);sc=np.array(model["scales"])
    races=training.load_races(p/"dataset.ndjson",False);historical=[r for r in races if r["kind"]=="historical"]
    assert set(artifact["fitRaceIds"])=={r["id"]for r in historical if r["year"]=="2025"}
    assert not set(artifact["fitRaceIds"])&{r["id"]for r in races if r["year"]!="2025"}
    v2=json.load(open("data/research/tissue-generation-2026-11-hurdle.json"));n2=v2["baseModel"]["names"]+v2["adjustment"]["names"]
    def group(n):
        if n.endswith("_missing") or "_missing_with_history"in n:return "Missingness"
        if "comment"in n or n.startswith(("last_","last3_")):return "Comments"
        if "trainer"in n:return "Trainer"
        if "jockey"in n:return "Jockey"
        if n=="official_rating":return "OR"
        if "speed_rank"in n or "speed_field_percentile"in n:return "Speed context"
        if "speed"in n:return "Raw Speed"
        if n in["completed_last3_fraction","completed_last3_hurdle_fraction"]:return "Completion"
        if n in["recent_non_completion","latest_pulled_up","latest_hurdle_pulled_up","latest_hurdle_fell_unseated"]:return "Latest failure"
        if "days_since"in n:return "Recency"
        if n in["log_prior_jump_starts","log_prior_hurdle_starts"]:return "Experience"
        if n=="age":return "Age"
        if n in["weight_lbs"]:return "Weight"
        return "Other context"
    groups=sorted({group(n)for n in n2+names});outputs=[]
    for r in races:
        raw=np.array([[v["raw"][n]for n in names]for v in r["runners"]],float);filled=np.where(np.isfinite(raw),raw,mu);C=w*(filled-mu)/sc;z=C.sum(1);e=np.exp(z-z.max());probs=e/e.sum()
        order=sorted(range(len(z)),key=lambda i:(-z[i],r["runners"][i]["id"]));old=sorted(range(len(z)),key=lambda i:(r["runners"][i]["v2Rank"],r["runners"][i]["id"]))
        cc2=np.array([v["v2Contributions"]for v in r["runners"]]);cg2={g:cc2[:,[i for i,n in enumerate(n2)if group(n)==g]].sum(1)for g in groups};cg3={g:C[:,[i for i,n in enumerate(names)if group(n)==g]].sum(1)for g in groups}
        assert max(abs(sum(cg3.values())-z))<1e-12
        compare=(old[0],order[0])if old[0]!=order[0]else(old[1],order[1])
        a,b=compare;delta={g:float((cg3[g][b]-cg3[g][a])-(cg2[g][b]-cg2[g][a]))for g in groups}
        driver=max(delta,key=delta.get)if a!=b else "No Top2 identity change"
        winner_ids=[i for i,v in enumerate(r["runners"])if v["winner"]]
        row={"id":r["id"],"date":r["date"],"year":r["year"],"course":r["course"],"time":r["scheduledTime"],"kind":r["kind"],"cutoff":r["cutoff"],"off":r["off"],"source":r["source"],
             "v2T1":r["runners"][old[0]]["horse"],"v2T2":r["runners"][old[1]]["horse"],"v3T1":r["runners"][order[0]]["horse"],"v3T2":r["runners"][order[1]]["horse"],
             "sameT1":old[0]==order[0],"sameT2":old[1]==order[1],"sameTop2":set(old[:2])==set(order[:2]),"mainDriver":driver,"driverDelta":delta,
             "winners":" / ".join(r["runners"][i]["horse"]for i in winner_ids)or"UNRESOLVED",
             "v2WinnerRank":statistics.mean(old.index(i)+1 for i in winner_ids)if winner_ids else None,
             "v3WinnerRank":statistics.mean(order.index(i)+1 for i in winner_ids)if winner_ids else None,
             "v2T1Probability":r["runners"][old[0]]["v2Probability"],"v3T1Probability":float(probs[order[0]]),
             "clean":all(v["outcomeStatus"]=="settled"for v in r["runners"])and bool(winner_ids),"runners":[]}
        for i,v in enumerate(r["runners"]):
            missing=[j for j,n in enumerate(names)if n in model["nonPositiveFeatures"]];package=float(sum(v["raw"][names[j]]*w[j]/sc[j]for j in missing));assert package<=1e-12
            row["runners"].append({"id":v["id"],"horse":v["horse"],"winner":v["winner"],"status":v["outcomeStatus"],"raw":v["raw"],"provenance":v["provenance"],
                "v2Inputs":v["v2Inputs"],"v2Contributions":v["v2Contributions"],"v2Logit":v["v2Score"],"v2Probability":v["v2Probability"],"v2Rank":v["v2Rank"],
                "v3Contributions":C[i].tolist(),"v3Logit":float(z[i]),"v3Probability":float(probs[i]),"v3Rank":order.index(i)+1,
                "v2Groups":{g:float(cg2[g][i])for g in groups},"v3Groups":{g:float(cg3[g][i])for g in groups},"netMissingPackage":package})
        outputs.append(row)
    def quality(rows,version):
        ll=[];bs=[];ranks=[];bins=np.zeros((10,3));t1=t2=top2=0;n=0
        for r in rows:
            rr=r["runners"];prob=np.array([p[version+"Probability"]for p in rr]);win=np.array([bool(p["winner"])for p in rr]);assert win.any();y=win/win.sum();ll.append(float(-sum(y*np.log(np.maximum(prob,1e-300)))));bs.append(float(sum((prob-y)**2)));rank=[p[version+"Rank"]for p in rr if p["winner"]];ranks.append(statistics.mean(rank));t1+=1 in rank;t2+=2 in rank;top2+=min(rank)<=2;n+=len(rr)
            for v,a in zip(prob,y):bins[min(9,int(v*10))]+=[1,v,a]
        return {"races":len(rows),"runners":n,"logLoss":statistics.mean(ll),"brier":statistics.mean(bs),"ece":float(sum(abs(bins[:,1]-bins[:,2]))/n),"top1":int(t1),"t2":int(t2),"top2":int(top2),"meanWinnerRank":statistics.mean(ranks),"bins":bins.tolist(),"losses":ll}
    perf=[];orderings=[];align=[];missing=[];drivers=[]
    for year in["2025","2026","COMBINED SECONDARY"]:
        rr=[r for r in outputs if r["kind"]=="historical"and(year=="COMBINED SECONDARY"or r["year"]==year)]
        q2,q3=quality(rr,"v2"),quality(rr,"v3");delta=np.array(q3.pop("losses"))-np.array(q2.pop("losses"));se=float(delta.std(ddof=1)/math.sqrt(len(delta)));dm=float(delta.mean())
        perf.append({"period":year,"v2":q2,"v3":q3,"deltaLogLoss":dm,"deltaLossLow":dm-1.96*se,"deltaLossHigh":dm+1.96*se})
        orderings.append({"period":year,"races":len(rr),"sameT1":sum(r["sameT1"]for r in rr),"sameT2":sum(r["sameT2"]for r in rr),"sameTop2":sum(r["sameTop2"]for r in rr),"changedT1":sum(not r["sameT1"]for r in rr),"changedT2":sum(not r["sameT2"]for r in rr)})
        flat=[v for r in rr for v in r["runners"]];wins=np.array([v["winner"]for v in flat]);counts=np.array([v["netMissingPackage"]for v in flat]);
        for cohort,mask in[("Winners",wins),("Non-winners",~wins),("All runners",np.ones(len(flat),bool))]:missing.append({"period":year,"cohort":cohort,"N":int(mask.sum()),"meanNetPackage":float(counts[mask].mean()),"medianNetPackage":float(np.median(counts[mask])),"minNetPackage":float(counts[mask].min()),"maxNetPackage":float(counts[mask].max()),"positiveNetPackages":int(sum(counts[mask]>1e-12))})
        for g in groups:
            driverrows=[r for r in rr if not r["sameT1"]or not r["sameT2"]];drivers.append({"period":year,"group":g,"changedRaceDriverCount":sum(r["mainDriver"]==g for r in driverrows)})
        for i,n in enumerate(names):
            raw=np.array([v["raw"][n]for v in flat],float);c=np.array([v["v3Contributions"][i]for v in flat]);fd=[];cd=[]
            for r in rr:
                vals=np.array([v["raw"][n]for v in r["runners"]],float);cs=[v["v3Contributions"][i]for v in r["runners"]]
                for j,v in enumerate(r["runners"]):
                    if v["winner"]:
                        if np.isfinite(vals[j])and np.isfinite(vals).sum()>=2:fd.append(float(vals[j]-np.nanmean(vals)))
                        cd.append(cs[j]-statistics.mean(cs))
            mean=lambda v:float(np.mean(v[np.isfinite(v)]))if np.isfinite(v).any()else None
            align.append({"period":year,"feature":n,"group":group(n),"weight":float(w[i]),"slope":float(w[i]/sc[i]),"winnerRawMean":mean(raw[wins]),"nonWinnerRawMean":mean(raw[~wins]),"winnerMinusFieldRaw":statistics.mean(fd)if fd else None,"winnerContribution":float(c[wins].mean()),"nonWinnerContribution":float(c[~wins].mean()),"winnerFieldContribution":statistics.mean(cd)})
    for a in align:
        years=[next(v for v in align if v["period"]==y and v["feature"]==a["feature"])["winnerMinusFieldRaw"]for y in["2025","2026"]]
        a["historicalDirection"]="UNSTABLE"if None not in years and years[0]*years[1]<0 else"Higher for winners"if(a["winnerMinusFieldRaw"]or 0)>0 else"Lower for winners"
        a["alignment"]="UNSTABLE"if a["historicalDirection"]=="UNSTABLE"else"ALIGNED"if a["slope"]*(a["winnerMinusFieldRaw"]or 0)>0 else"QUESTIONABLE"if abs(a["weight"])<.03 else"OPPOSITE"
    # Group-level composite direction: compare score advantage, not a fictitious raw unit.
    group_alignment=[]
    for year in["2025","2026","COMBINED SECONDARY"]:
        rr=[r for r in outputs if r["kind"]=="historical"and(year=="COMBINED SECONDARY"or r["year"]==year)];flat=[v for r in rr for v in r["runners"]]
        for g in groups:
            winners=[v["v3Groups"][g]for v in flat if v["winner"]];losers=[v["v3Groups"][g]for v in flat if not v["winner"]]
            gap=[v["v3Groups"][g]-statistics.mean(t["v3Groups"][g]for t in r["runners"])for r in rr for v in r["runners"]if v["winner"]]
            group_alignment.append({"period":year,"group":g,"winnerContribution":statistics.mean(winners),"nonWinnerContribution":statistics.mean(losers),"winnerFieldContribution":statistics.mean(gap)})
    # Missing OR is isolated from total OR, so a flag cannot silently dominate a combined group.
    or_flag_drivers=collections.Counter();largest_v3=collections.Counter()
    for r in outputs:
        if r["kind"]!="historical":continue
        rr=sorted(r["runners"],key=lambda v:v["v3Rank"]);a,b=rr[:2];gaps={g:a["v3Groups"][g]-b["v3Groups"][g]for g in groups};largest_v3[max(gaps,key=gaps.get)]+=1
        single=[a["v3Contributions"][i]-b["v3Contributions"][i]for i in range(len(names))]
        best=int(np.argmax(single));
        if names[best]=="official_rating_missing":or_flag_drivers[r["year"]]+=1
    avatar=next(r for r in outputs if r["kind"]=="avatar_diagnostic")
    prospective=[r for r in outputs if r["kind"]=="november_diagnostic"]
    decision="B. V3 FIXES SEMANTICS BUT NEEDS MORE DEVELOPMENT"
    if all(q["deltaLogLoss"]<-.001 and q["v3"]["brier"]<=q["v2"]["brier"]for q in perf[:2]):decision="C. V3 IS CLEARLY BETTER AND READY FOR PROSPECTIVE SHADOW"
    result={"model":artifact,"v2Model":v2,"performance":perf,"ordering":orderings,"featureAlignment":align,"groupAlignment":group_alignment,"missingPackages":missing,"changedDrivers":drivers,
            "largestV3T1T2Group":dict(largest_v3),"orMissingLargestIndividualDriver":dict(or_flag_drivers),"races":outputs,"prospective":prospective,"avatar":avatar,
            "classification":decision,"recommendation":"Keep V2 live; continue separate V3 development; no promotion or prospective capture activated."if decision.startswith("B.")else"Seek separate approval for a prospective-only shadow phase; no production promotion.",
            "fitSource":"2025 only; selected and sealed before 2026/November evaluation","memoryMB":training.memory_mb()}
    (p/"evaluation.json").write_text(json.dumps(result,allow_nan=False));assert pathlib.Path(args.model).read_bytes()==original_bytes
    print(json.dumps({"performance":perf,"ordering":orderings,"avatar":{v["horse"]:{"probability":v["v3Probability"],"rank":v["v3Rank"]}for v in avatar["runners"]if v["horse"]=="Avatar Jet"},"missingORDominantCount":dict(or_flag_drivers),"classification":decision,"rssMB":training.memory_mb()},indent=2))

if __name__=="__main__":main()
