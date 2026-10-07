import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  jumpAwDetailReportPath,
  parseArgs,
  renderJumpAwDetailReport,
  renderJumpAwTerminalSummary,
} from "./report-forward-value";

describe("Forward Value Jump/AW terminal report", () => {
  const jump = [
    "Jump Tissue / Forward Value (median_bookmaker_v1)",
    "2026-10-07 14:10 Fontwell | Jump Detail Horse | probability 22.00% | median 5.00 | implied 20.00% | edge 2.00pp | best 6.00 | forecast - | quotes 3 | Early 5.00 | T-180 - | T-60 - | final SP -",
    "Jump model agreement: comparable=4 same=3 different=1 both_positive=2 jpr_a_positive_only=1 jump_tissue_positive_only=0 neither=1",
  ].join("\n");
  const aw = [
    "AW Tissue / Forward Value (median_bookmaker_v1)",
    "2026-10-07 18:30 Kempton | AW Detail Horse | probability 18.00% | median 6.00 | implied 16.67% | edge 1.33pp | best 7.00 | forecast - | quotes 4 | Early 6.00 | T-180 - | T-60 - | final SP -",
    "AW model agreement: comparable=5 same=2 different=3 both_positive=1 aw_d_positive_only=1 tissue_positive_only=2 neither=1",
  ].join("\n");
  const report = renderJumpAwDetailReport({ date: "2026-10-07", jump, aw });

  test("default output keeps only Jump and AW aggregate agreement summaries", () => {
    const output = renderJumpAwTerminalSummary(report);

    assert.match(output, /Jump Tissue \/ Forward Value/);
    assert.match(output, /Jump model agreement: comparable=4 same=3 different=1/);
    assert.match(output, /AW Tissue \/ Forward Value/);
    assert.match(output, /AW model agreement: comparable=5 same=2 different=3/);
    assert.doesNotMatch(output, /Jump Detail Horse/);
    assert.doesNotMatch(output, /AW Detail Horse/);
  });

  test("verbose output retains the full race-by-race detail", () => {
    const output = renderJumpAwTerminalSummary(report, { details: true });

    assert.equal(output, report);
    assert.match(output, /Jump Detail Horse/);
    assert.match(output, /AW Detail Horse/);
  });

  test("details flags and report path are stable", () => {
    assert.deepEqual(parseArgs(["summary", "--verbose"]), { command: "summary", positional: [], details: true });
    assert.deepEqual(parseArgs(["summary", "--details"]), { command: "summary", positional: [], details: true });
    assert.equal(jumpAwDetailReportPath("2026-10-07"), "/tmp/forward-value-jump-aw-details-2026-10-07.md");
  });
});
