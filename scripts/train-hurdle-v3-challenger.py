"""2025-only challenger development. Writes a draft, never production or a forward ledger.

Requires NumPy. Run the separate evaluator only AFTER sealing the selected draft.
"""
import argparse
import hashlib
import json
import math
import os
import pathlib
import resource
from datetime import datetime, timezone

# Keep numerical work on this 16 GB machine sequential.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np

CORE = ["official_rating", "latest_hurdle_speed", "best_l3_hurdle_speed", "average_l3_hurdle_speed",
        "trainer_starter_win_rate", "log_trainer_starters", "jockey_starter_win_rate", "log_jockey_starters",
        "completed_last3_hurdle_fraction", "official_rating_missing", "hurdle_history_missing",
        "hurdle_speed_missing_with_history", "trainer_history_missing", "jockey_history_missing"]
SECONDARY = {
    "recency": ["log_days_since_hurdle"], "experience": ["log_prior_hurdle_starts"],
    "latest_failure": ["latest_hurdle_pulled_up", "latest_hurdle_fell_unseated"],
    "comments": ["hurdle_comment_jump_error_recent", "hurdle_comment_finish_recent", "hurdle_comment_weakened_recent"],
    "age": ["age"], "weight": ["weight_lbs"], "speed_context": ["hurdle_speed_field_percentile"],
    "or_context": ["or_field_percentile"],
}
L2_GRID = [.01, .1, 1.]

def memory_mb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    mb = rss / (1024 * 1024) if os.uname().sysname == "Darwin" else rss / 1024
    if mb > 4096:
        raise MemoryError("Hurdle V3 stop: process exceeded 4 GiB")
    return round(mb)

def load_races(dataset, historical_only=True):
    rows=[]
    with open(dataset) as source:
        for line in source:
            r=json.loads(line)
            if not historical_only or r["kind"] == "historical":
                rows.append(r)
    memory_mb()
    return rows

def raw_matrix(races, names):
    return np.array([[p["raw"][n] for n in names] for r in races for p in r["runners"]], dtype=float)

def preprocess(races, names):
    x=raw_matrix(races,names)
    means=np.array([np.mean(c[np.isfinite(c)]) if np.isfinite(c).any() else 0 for c in x.T])
    assert np.isfinite(x).any(axis=0).all(), "Cannot train an entirely unobserved feature"
    filled=np.where(np.isfinite(x),x,means)
    scales=np.std(filled,axis=0)
    scales=np.where(scales > 1e-6, scales, 1.)
    return means,scales,(filled-means)/scales

def design(races,names,means,scales):
    x=raw_matrix(races,names)
    return (np.where(np.isfinite(x),x,means)-means)/scales

def structure(races):
    starts=np.cumsum([0]+[len(r["runners"]) for r in races])[:-1]
    sizes=np.array([len(r["runners"]) for r in races])
    y=np.concatenate([np.array([p["winner"] for p in r["runners"]],float) for r in races])
    counts=np.add.reduceat(y,starts)
    assert (counts>0).all()
    y=y/np.repeat(counts,sizes)
    return starts,sizes,y

def softmax(z,starts,sizes):
    e=np.exp(z-np.repeat(np.maximum.reduceat(z,starts),sizes))
    return e/np.repeat(np.add.reduceat(e,starts),sizes)

def fit(races,names,l2):
    means,scales,x=preprocess(races,names)
    starts,sizes,y=structure(races);nr=len(races);pdim=len(names)
    penalty=np.array([4. if n=="age" or n.startswith("hurdle_comment_") else 1. for n in names])
    bounded=np.array([n.endswith("_missing") or "_missing_with_history" in n for n in names])
    w=np.zeros(pdim)
    def objective(v,derivatives=False):
        z=x@v;p=softmax(z,starts,sizes)
        value=float(-np.sum(y*np.log(np.maximum(p,1e-300)))/nr+.5*l2*np.sum(penalty*v*v))
        if not derivatives:return value
        g=x.T@(p-y)/nr+l2*penalty*v
        h=(x.T@(x*p[:,None]))/nr
        xp=np.add.reduceat(x*p[:,None],starts,axis=0)
        h-=xp.T@xp/nr
        h+=np.diag(l2*penalty)
        return value,g,h
    converged=False
    for iteration in range(100):
        value,g,h=objective(w,True)
        active=bounded&(w>=-1e-12)&(g<0)
        pg=g.copy();pg[active]=0
        if np.max(abs(pg))<1e-8:
            converged=True;break
        free=~active;step=np.zeros(pdim);step[free]=-np.linalg.solve(h[np.ix_(free,free)],g[free])
        accepted=False
        for fallback in [False,True]:
            if fallback:step=-pg/np.diag(h)
            alpha=1.
            for _ in range(35):
                proposed=w+alpha*step;proposed[bounded]=np.minimum(proposed[bounded],0)
                displacement=proposed-w
                if g@displacement<0 and objective(proposed)<=value+1e-4*(g@displacement):
                    w=proposed;accepted=True;break
                alpha*=.5
            if accepted:break
        if not accepted:
            if np.max(abs(pg))<1e-6:converged=True;break
            raise RuntimeError("Projected Newton line search did not converge")
    if not converged:
        _,g,_=objective(w,True);g[bounded&(w>=-1e-12)&(g<0)]=0
        converged=np.max(abs(g))<1e-6
    if not converged:raise RuntimeError("Projected Newton convergence tolerance not met")
    assert (w[bounded]<=1e-12).all()
    memory_mb()
    return {"names":names,"means":means.tolist(),"scales":scales.tolist(),"weights":w.tolist(),
            "l2":l2,"penaltyMultipliers":penalty.tolist(),"nonPositiveFeatures":[n for n,b in zip(names,bounded) if b],
            "iterations":iteration+1,"converged":True}

def predict(races,model):
    x=design(races,model["names"],np.array(model["means"]),np.array(model["scales"]))
    starts,sizes,y=structure(races);z=x@np.array(model["weights"]);p=softmax(z,starts,sizes)
    return x,z,p,starts,sizes,y

def metrics(races,model):
    x,z,p,starts,sizes,y=predict(races,model);bins=np.zeros((10,3));ranks=[];t1=t2=top2=0
    for r,start,size in zip(races,starts,sizes):
        order=sorted(range(size),key=lambda i:(-z[start+i],r["runners"][i]["id"]))
        wins=[i for i,v in enumerate(r["runners"]) if v["winner"]]
        ranks.append(np.mean([order.index(i)+1 for i in wins]));t1+=order[0] in wins;t2+=order[1] in wins;top2+=any(i in wins for i in order[:2])
    for v,a in zip(p,y):bins[min(9,int(v*10))]+=[1,v,a]
    return {"races":len(races),"runners":len(p),"logLoss":float(-np.sum(y*np.log(np.maximum(p,1e-300)))/len(races)),
            "brier":float(np.sum((p-y)**2)/len(races)),"ece":float(np.sum(abs(bins[:,1]-bins[:,2]))/len(p)),
            "top1":int(t1),"t2":int(t2),"top2":int(top2),"meanWinnerRank":float(np.mean(ranks)),"bins":bins.tolist()}

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--dataset",default="/tmp/hurdle-v3-rebuild/dataset.ndjson");parser.add_argument("--output",default="/tmp/hurdle-v3-rebuild");args=parser.parse_args()
    output=pathlib.Path(args.output).resolve()
    if not str(output).startswith(("/tmp/","/private/tmp/")):raise ValueError("Training draft output must be temporary")
    output.mkdir(parents=True,exist_ok=True)
    all_races=load_races(args.dataset)
    # Do not inspect or score 2026 until the separately sealed artifact exists.
    races=[r for r in all_races if "2025-01-01"<=r["date"]<"2026-01-01"]
    train=[r for r in races if r["date"]<"2025-09-01"]
    validation=[r for r in races if "2025-09-01"<=r["date"]<"2025-11-01"]
    confirmation=[r for r in races if "2025-11-01"<=r["date"]<"2026-01-01"]
    assert min(map(len,[train,validation,confirmation]))>=50
    protocol={"version":"HURDLE_V3_2025_ONLY_SELECTION_V1","fitPeriod":["2025-01-01","2025-12-31"],
              "internalTrain":["2025-01-01","2025-08-31"],"internalValidation":["2025-09-01","2025-10-31"],
              "internalConfirmation":["2025-11-01","2025-12-31"],"laterEvaluation":"2026 pre-epoch; never used for V3 selection",
              "secondaryOrder":list(SECONDARY),"core":CORE,"secondary":SECONDARY,"l2Grid":L2_GRID,
              "groupAcceptance":"Validation loss improves by at least 0.001 and Brier does not worsen; test groups in fixed order.",
              "confirmationGate":"If selected specification loses to core by >0.001 loss or >0.001 Brier on Nov–Dec 2025, fall back to core. Confirmation therefore informs selection, not independent validation.",
              "missingness":"Train-only observed mean imputation; one gate per underlying absence; all missing-flag increments constrained <=0.",
              "ageAndCommentRegularisation":"4x L2 penalty; no market, ROI, November 2026 or full-model V2 coefficients used in fitting.",
              "intercept":"Fixed zero: common race-softmax intercept is not identifiable.","memoryLimitMB":4096,"randomSeed":"none: deterministic zero-start projected Newton"}
    (output/"training-protocol.json").write_text(json.dumps(protocol,indent=2))
    trials=[]
    def choose(names,label):
        candidates=[]
        for l2 in L2_GRID:
            model=fit(train,names,l2);quality=metrics(validation,model)
            candidates.append((quality["logLoss"],-l2,model,quality))
            trials.append({"trial":label,"features":names,"l2":l2,"validation":quality,"iterations":model["iterations"]})
        _,_,model,quality=min(candidates,key=lambda t:(t[0],t[1]))
        return model,quality
    core,core_quality=choose(CORE,"CORE");current,quality=core,core_quality;steps=[]
    for label,addition in SECONDARY.items():
        candidate,q=choose(current["names"]+addition,"ADD "+label)
        accepted=q["logLoss"]<=quality["logLoss"]-.001 and q["brier"]<=quality["brier"]+1e-12
        steps.append({"group":label,"accepted":accepted,"baseValidation":quality,"candidateValidation":q,"candidateL2":candidate["l2"]})
        if accepted:current,quality=candidate,q
        print(json.dumps({"group":label,"accepted":accepted,"validationDelta":q["logLoss"]-steps[-1]["baseValidation"]["logLoss"],"rssMB":memory_mb()}),flush=True)
    selected_confirmation=metrics(confirmation,current);core_confirmation=metrics(confirmation,core)
    fallback=selected_confirmation["logLoss"]>core_confirmation["logLoss"]+.001 or selected_confirmation["brier"]>core_confirmation["brier"]+.001
    chosen=core if fallback else current
    final=fit(races,chosen["names"],chosen["l2"])
    fit_hash=hashlib.sha256(json.dumps([{ "race":r["id"],"date":r["date"],"runners":[{"id":p["id"],"raw":{n:p["raw"][n] for n in final["names"]},"winner":p["winner"]}for p in r["runners"]]}for r in races],separators=(",",":"),sort_keys=True).encode()).hexdigest()
    artifact={"version":"HURDLE_TISSUE_V3_CHALLENGER","family":"HURDLE","status":"challenger_not_promoted",
              "featureSchema":"hurdle_only_canonical_starters_mean_imputed_v1","createdAt":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
              "trainingPeriod":{"from":"2025-01-01","to":"2025-12-31","races":len(races),"runners":sum(len(r["runners"])for r in races)},
              "trainingDataHash":fit_hash,"selectionProtocol":protocol,"fitRaceIds":[r["id"]for r in races],
              "calibration":"race_softmax_temperature_1","intercept":0,"imputation":"observed_training_mean_no_positive_missingness_increment",
              "prospectiveStatus":"not_started_no_backfill","model":final}
    with open(output/"challenger-draft.json","x") as stream:json.dump(artifact,stream,indent=2,allow_nan=False)
    selection={"trainRaces":len(train),"validationRaces":len(validation),"confirmationRaces":len(confirmation),"trials":trials,"steps":steps,
               "coreConfirmation":core_confirmation,"selectedConfirmation":selected_confirmation,"confirmationFallbackToCore":fallback,
               "selectedFeatures":final["names"],"selectedL2":final["l2"],"full2025Refit":metrics(races,final),"no2026EvaluationBeforeFreeze":True,"rssMB":memory_mb()}
    (output/"selection.json").write_text(json.dumps(selection,indent=2,allow_nan=False))
    print(json.dumps({"selectedFeatures":final["names"],"l2":final["l2"],"fallbackToCore":fallback,"2025":selection["full2025Refit"],"rssMB":memory_mb()},indent=2))

if __name__=="__main__":main()
