import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluateJumpExploratory, JUMP_EXPLORATORY_LABEL, JUMP_EXPLORATORY_SOURCE, JUMP_EXPLORATORY_WARNING, parseExploratoryOptions } from "@/lib/racing/jump-exploratory-research";
import { JumpExploratoryResults } from "./jump-exploratory-workspace";
import { ResearchSourceSelect } from "./research-source-select";

function html(query = "", message = "") {
  const result = evaluateJumpExploratory([], parseExploratoryOptions(new URLSearchParams(query)));
  return renderToStaticMarkup(<JumpExploratoryResults result={result} sourceId="isolated-fixture" buildDate="2026-11-11T16:56:04.829Z" comparison={null} comparisonMessage={message} />);
}
test("source selector preserves historical default and requires explicit exploratory selection", () => {
  const defaults = renderToStaticMarkup(<ResearchSourceSelect />), selected = renderToStaticMarkup(<ResearchSourceSelect exploratory />);
  assert.match(defaults, /value="historical" selected=""/);
  assert.ok(defaults.includes(JUMP_EXPLORATORY_LABEL));
  assert.ok(selected.includes(`value="${JUMP_EXPLORATORY_SOURCE}" selected=""`));
});
test("exploratory results prominently label reconstructed provenance, source and actual coverage", () => {
  const rendered = html("jumpFeature=latestSpeedRating");
  assert.ok(rendered.includes(JUMP_EXPLORATORY_WARNING));
  for (const label of ["isolated-fixture", "2026-11-11T16:56:04.829Z", "canonical_settlement_v3", "usable settled observations", "Feature exclusion reasons", "Settlement exclusion reasons", "Partial diagnostic rank", "Rank unavailable races", "Selected observations missing a valid benchmark", "Unavailable", "Saving and freezing rules is disabled"]) assert.ok(rendered.includes(label), label);
  assert.match(rendered, /Original declared field size<input[^>]+disabled=""/);
  assert.doesNotMatch(rendered, /NaN|Infinity|name="rule"|saveResearchRuleAction|Save &amp; freeze/);
  assert.ok(rendered.includes("No A/E is calculated for incomplete fields"));
});
test("incompatible 2025 rating comparisons explain absent equivalent eligibility evidence", () => {
  assert.ok(html("jumpFeature=bestSpeedLast3&jumpCompare2025=yes", "2025 comparison unavailable: compatible rating sidecar absent.").includes("compatible rating sidecar absent"));
});
test("candidate mode branches before default readers and excludes advanced/save actions", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("./model-performance-workspace.tsx", import.meta.url), "utf8");
  const controlled = readFileSync(new URL("./jump-exploratory-workspace.tsx", import.meta.url), "utf8");
  assert.ok(workspace.indexOf("if (isJumpExploratorySource(params))") < workspace.indexOf("await loadResearchModelSources(family)"));
  assert.match(page, /data = exploratory \? null : await loadResearchData/);
  assert.match(page, /savedRules = exploratory \? \[\] : await loadSavedRules/);
  assert.match(page, /\{!exploratory \? <details[\s\S]*<SavedRulesSection savedRules=\{savedRules\} \/>[\s\S]*<\/details> : null\}/);
  assert.doesNotMatch(controlled, /saveResearchRuleAction|writeFile|createDbConnection|evaluateResearchRule|cachedModelObservations|normalizedSpMarkets/);
  assert.match(controlled, /await readIsolatedJumpCandidate\(\)/);
  assert.match(controlled, /year: "2025", family: "jump"/);
  assert.doesNotMatch(controlled, /year: "2026"/);
});
