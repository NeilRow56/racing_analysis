import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CANDIDATE_IDS,
  FAMILIES,
  featureNamesFor,
  type CandidateId,
  type FamilyId,
} from "./diagnose-jump-aw-residual-model-stage4";

describe("Jump/AW residual model stage 4 setup", () => {
  test("keeps the stage scoped to Jump and AW only", () => {
    assert.deepEqual(FAMILIES, ["jump", "aw"]);
    assert.ok(!FAMILIES.includes("turf" as FamilyId));
  });

  test("uses the fixed small R0-R5 candidate set", () => {
    assert.deepEqual(CANDIDATE_IDS, ["R0", "R1", "R2", "R3", "R4", "R5"]);
  });

  test("does not leak residual features into the market-only baseline", () => {
    assert.deepEqual(featureNamesFor("R0", "jump"), []);
    assert.deepEqual(featureNamesFor("R0", "aw"), []);
  });

  test("keeps Tissue and rating incremental tests separate", () => {
    for (const family of FAMILIES) {
      const r2 = featureNamesFor("R2", family);
      const r3 = featureNamesFor("R3", family);
      assert.ok(r2.includes("tissue_probability"));
      assert.ok(!r2.includes("rating_score"));
      assert.ok(r3.includes("rating_score"));
      assert.ok(!r3.includes("tissue_probability"));
    }
  });

  test("adds family-specific context only after core numeric candidates", () => {
    const contextualCandidates: CandidateId[] = ["R4", "R5"];
    for (const family of FAMILIES) {
      assert.ok(!featureNamesFor("R1", family).includes("weakening_proxy"));
      for (const candidate of contextualCandidates) {
        assert.ok(featureNamesFor(candidate, family).includes("weakening_proxy"));
      }
    }
    assert.ok(featureNamesFor("R4", "jump").includes("hurdle_subtype"));
    assert.ok(featureNamesFor("R4", "jump").includes("chase_subtype"));
    assert.ok(featureNamesFor("R4", "aw").includes("draw"));
    assert.ok(featureNamesFor("R4", "aw").includes("course_context"));
  });
});
