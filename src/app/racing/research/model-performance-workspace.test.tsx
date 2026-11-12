import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PerformanceTable } from "./model-performance-workspace";
import { summarizeModel } from "@/lib/racing/research-model-comparison";

test("performance table distinguishes unmeasured metrics from zero performance", () => {
  const html = renderToStaticMarkup(<PerformanceTable rows={[{ label: "No coverage", ...summarizeModel([]) }]} />);
  for (const label of ["Qualifying runners", "Races", "Settled", "Actual SP ROI", "Expected wins", "A/E", "Missing benchmark"]) assert.ok(html.includes(label));
  assert.ok(html.includes("—")); assert.ok(!html.includes("NaN")); assert.ok(!html.includes("Infinity"));
});
test("comparison workspace stays read-only and original actions remain under advanced filters", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("./model-performance-workspace.tsx", import.meta.url), "utf8");
  for (const title of ["A. Evidence and model selection", "B. Population and historical periods", "C. Selection criteria", "D. Performance summary", "E. Automatic performance breakdowns", "F. Robustness and advanced filters"]) assert.ok(workspace.includes(title));
  assert.ok(page.indexOf("<ModelPerformanceWorkspace") < page.indexOf("<ResearchWorkspace"));
  assert.match(page, /<details[^>]*>[\s\S]*Advanced Filters[\s\S]*<ResearchWorkspace[\s\S]*<SavedRulesSection savedRules=\{savedRules\} \/>[\s\S]*<\/details>/);
  assert.doesNotMatch(workspace, /saveResearchRuleAction|writeFile|createDbConnection|freezeResearch|validateHoldout/);
  assert.match(workspace, /exploratory \/ previously used evidence/);
});
