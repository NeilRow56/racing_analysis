"""Read-only Chase coefficient and frozen-input counterfactual audit; no fitting."""
import hashlib
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/research"
FILES = ["jump-tissue-model-v1.json", "chase-shadow-v1-frozen.json",
         "tissue-generation-2026-11-chase.json", "jump-tissue-forward-v1.json",
         "tissue-generation-development-2026-11.json", "tissue-generation-forward-2026-11.json",
         "tissue-generation-chase-promotion-2026-11.json"]
loaded = {name: json.loads((DATA / name).read_text()) for name in FILES}
old = loaded[FILES[0]]["model"]
new = loaded[FILES[1]]["model"]
generation = loaded[FILES[2]]
assert old["names"] == new["names"]
start = old["names"].index("prior_comment_count")
assert start == 36 and len(old["names"]) == 79
assert new == generation["baseModel"]
assert all(w == 0 for w in generation["adjustment"]["weights"])


def part(model, vector, indices):
    return sum(model["weights"][i] * (vector[i] - model["means"][i]) /
               model["scales"][i] for i in indices)


def probabilities(logits):
    exp = [math.exp(x - max(logits)) for x in logits]
    return [x / sum(exp) for x in exp]


def audit(races, stored_model):
    counts = {"races": 0, "runners": 0, "changed_t1": 0, "old_t1_to_new_t2": 0,
              "comment_delta_positive_for_new_t1": 0, "comment_delta_dominant": 0,
              "restore_old_comments_restores_old_t1": 0,
              "new_comments_alone_demote_old_t1": 0,
              "numeric_change_alone_demotes_old_t1": 0}
    swaps, effects = [], []
    metrics = {k: {"races": 0, "top1_winners": 0, "top2_winners": 0, "losses": []}
               for k in ["old", "new", "new_numeric_old_comments", "old_numeric_new_comments"]}
    max_error = 0
    excluded = 0
    for race in races:
        rows = race["runners"]
        if len(rows) < 2 or any(len(x.get("modelInputs", [])) != 79 for x in rows):
            excluded += 1
            continue
        counts["races"] += 1
        counts["runners"] += len(rows)
        on, oc, nn, nc = [], [], [], []
        for row in rows:
            v = row["modelInputs"]
            on.append(part(old, v, range(start)))
            oc.append(part(old, v, range(start, 79)))
            nn.append(part(new, v, range(start)))
            nc.append(part(new, v, range(start, 79)))
        logits = {"old": [a+b for a,b in zip(on,oc)], "new": [a+b for a,b in zip(nn,nc)],
                  "new_numeric_old_comments": [a+b for a,b in zip(nn,oc)],
                  "old_numeric_new_comments": [a+b for a,b in zip(on,nc)]}
        orders = {k: sorted(range(len(rows)), key=lambda i: (-v[i], rows[i]["runnerId"]))
                  for k,v in logits.items()}
        probs = {k: probabilities(v) for k,v in logits.items()}
        assert all(abs(sum(p)-1) < 1e-12 for p in probs.values())
        if stored_model:
            max_error = max(max_error, max(abs(p - row["probability"]) for p,row in zip(probs[stored_model],rows)))
        outcomes = [x.get("outcome") for x in rows]
        settled = (all(o is not None and o.get("status", "settled") == "settled" and
                       o.get("resultStatus") not in ["non_runner", "void"] for o in outcomes)
                   and sum(bool(o and o.get("winner", o.get("won", False))) for o in outcomes) == 1)
        winner = next((i for i,o in enumerate(outcomes) if o and o.get("winner",o.get("won",False))), None)
        if settled:
            for k,order in orders.items():
                m = metrics[k]
                m["races"] += 1
                m["top1_winners"] += int(order[0] == winner)
                m["top2_winners"] += int(winner in order[:2])
                m["losses"].append(-math.log(max(probs[k][winner], 1e-12)))
        for group,a,b in [("numeric",on,nn),("comments",oc,nc)]:
            effects.append({"group": group, "old": statistics.pstdev(a), "new": statistics.pstdev(b),
                            "delta": statistics.pstdev([y-x for x,y in zip(a,b)])})
        a,b = orders["old"][0],orders["new"][0]
        counts["changed_t1"] += int(a != b)
        if a == b or orders["new"].index(a) != 1:
            continue
        cd = (nc[b]-nc[a])-(oc[b]-oc[a])
        nd = (nn[b]-nn[a])-(on[b]-on[a])
        assert math.isclose(cd+nd, (logits["new"][b]-logits["new"][a]) -
                            (logits["old"][b]-logits["old"][a]), abs_tol=1e-12)
        restored = orders["new_numeric_old_comments"][0] == a
        comments_alone = orders["old_numeric_new_comments"][0] != a
        numeric_alone = orders["new_numeric_old_comments"][0] != a
        counts["old_t1_to_new_t2"] += 1
        counts["comment_delta_positive_for_new_t1"] += int(cd > 0)
        counts["comment_delta_dominant"] += int(cd > 0 and abs(cd) > abs(nd))
        counts["restore_old_comments_restores_old_t1"] += int(restored)
        counts["new_comments_alone_demote_old_t1"] += int(comments_alone)
        counts["numeric_change_alone_demotes_old_t1"] += int(numeric_alone)
        swaps.append({"raceId":race["raceId"], "date":race["raceDate"], "course":race["course"],
                      "old_t1": rows[a]["horseName"], "new_t1":rows[b]["horseName"],
                      "old_margin": logits["old"][b]-logits["old"][a],
                      "new_margin": logits["new"][b]-logits["new"][a],
                      "comment_delta": cd, "numeric_delta":nd, "restores_old_t1":restored,
                      "settled":settled, "old_t1_won": a == winner if settled else None,
                      "new_t1_won": b == winner if settled else None})
    for m in metrics.values():
        m["log_loss"] = statistics.mean(m.pop("losses")) if m["races"] else None
    assert max_error < 1e-12
    return {"counts": counts, "excluded": excluded, "stored_probability_max_error":max_error,
            "metrics":metrics, "mean_within_race_logit_sd": {g:{k:statistics.mean(x[k] for x in effects if x["group"]==g)
            for k in ["old","new","delta"]} for g in ["numeric","comments"]}, "demotions":swaps}


archive = [r for r in loaded[FILES[3]]["races"] if r["subtype"] == "Chase" and
           r.get("recordedPreRace") and r.get("predictionCoverage") == 1 and not r.get("excludedReason")]
dev = [r for r in loaded[FILES[4]]["races"] if r["family"] == "CHASE"]
post = [r for r in loaded[FILES[5]]["races"] if r["family"] == "CHASE"]
coefficients = [{"feature": n, "old_effective": old["weights"][i]/old["scales"][i],
                 "new_effective": new["weights"][i]/new["scales"][i]}
                for i,n in enumerate(old["names"]) if i >= start]
reference = loaded[FILES[6]]
print(json.dumps({"source_hashes":{f:hashlib.sha256((DATA/f).read_bytes()).hexdigest() for f in FILES},
                  "shadow_equals_active_base":True, "active_adjustment_zero":True,
                  "comment_coefficients":coefficients, "protocol":loaded[FILES[1]]["protocol"],
                  "archive":audit(archive,"old"), "development":audit(dev,"old"), "post_epoch":audit(post,"new"),
                  "promotion_reference":{k:reference[k] for k in ["old","shadow","quarters"]}}, indent=2))
