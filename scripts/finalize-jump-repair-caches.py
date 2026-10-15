"""Preserve research populations and refresh only Jump rows in mixed caches."""
import hashlib
import json
import os
from pathlib import Path

ROOT = Path("data/research/backtest-cache")
BASELINE = Path("/tmp/jump-repair-baseline-cache")
MATCHED = Path("/tmp/jump-repair-clean-matched-cache")
results = []
for year in ("2025", "2026"):
    name = f"backtest_features_v4-sporting_life-jump-{year}-01-01-{year}-12-31"
    baseline = BASELINE / name
    current = ROOT / name
    manifest = json.loads((current / "manifest.json").read_text())
    assert manifest["jumpWinningTimeGuardVersion"] == "jump_winning_time_guard_v1"
    features = {r["targetRunnerId"]: r for r in map(json.loads, (current / "features.ndjson").open())}
    outcomes = {r["targetRunnerId"]: r for r in map(json.loads, (current / "outcomes.ndjson").open())}
    supplemental = json.loads(Path("/tmp/jump-repair-mixed-cache-supplemental.json").read_text())
    mixed_features = {**features, **{r["features"]["targetRunnerId"]: r["features"] for r in supplemental}}
    old = list(map(json.loads, (baseline / "features.ndjson").open()))
    old_outcomes = list(map(json.loads, (baseline / "outcomes.ndjson").open()))
    assert all(r["targetRunnerId"] in features for r in old)
    # Hold settlement constant as well as the runner population for before/after research.
    assert all(all(outcomes[r["targetRunnerId"]].get(k) == v for k, v in r.items()) for r in old_outcomes)
    matched = MATCHED / name
    matched.mkdir(parents=True, exist_ok=True)
    with (matched / "features.ndjson").open("w") as out:
        for r in old:
            out.write(json.dumps(features[r["targetRunnerId"]], separators=(",", ":")) + "\n")
    (matched / "outcomes.ndjson").write_bytes((baseline / "outcomes.ndjson").read_bytes())
    matched_manifest = {**manifest, "rowCount": len(old)}
    (matched / "manifest.json").write_text(json.dumps(matched_manifest, indent=2) + "\n")
    results.append({"family": "jump", "year": year, "rebuiltRows": len(features), "matchedRows": len(old),
                    "changedMatchedRows": sum(features[r["targetRunnerId"]] != r for r in old), "directory": str(current)})
    all_dir = ROOT / f"backtest_features_v4-sporting_life-all-{year}-01-01-{year}-12-31"
    if not all_dir.exists():
        continue
    all_manifest = json.loads((all_dir / "manifest.json").read_text())
    old_manifest = json.loads(json.dumps(all_manifest))
    outcome_hash = hashlib.sha256((all_dir / "outcomes.ndjson").read_bytes()).hexdigest()
    temp = all_dir / "features.ndjson.jump-repair-tmp"
    changed_before = []
    jump_rows = 0
    with temp.open("w") as out:
        for line in (all_dir / "features.ndjson").open():
            r = json.loads(line)
            if r.get("raceCode") != "jump":
                out.write(line)
                continue
            jump_rows += 1
            replacement = mixed_features[r["targetRunnerId"]]
            if replacement == r:
                out.write(line)
            else:
                changed_before.append(r)
                out.write(json.dumps(replacement, separators=(",", ":")) + "\n")
    backup = Path(f"/tmp/jump-repair-all-cache-{year}-before.json")
    if not backup.exists():
        backup.write_text(json.dumps({"manifest": old_manifest, "changedJumpRows": changed_before, "outcomesHash": outcome_hash}) + "\n")
    os.replace(temp, all_dir / "features.ndjson")
    all_manifest.pop("invalidatedBySourceCorrection", None)
    all_manifest["jumpWinningTimeGuardVersion"] = manifest["jumpWinningTimeGuardVersion"]
    all_manifest["generatedAt"] = manifest["generatedAt"]
    (all_dir / "manifest.json").write_text(json.dumps(all_manifest, indent=2) + "\n")
    assert hashlib.sha256((all_dir / "outcomes.ndjson").read_bytes()).hexdigest() == outcome_hash
    results.append({"family": "all", "year": year, "jumpRowsRefreshed": jump_rows, "changedJumpRows": len(changed_before), "otherFamilyRowsAndOutcomesPreserved": True, "directory": str(all_dir)})
Path("/tmp/jump-winning-time-cache-rebuilds.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
