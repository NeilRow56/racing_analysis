import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WinterResearchDashboard } from "./dashboard";
import { summarizeWinterResearch, WINTER_QUESTIONS } from "@/lib/racing/winter-research";

test("winter dashboard renders fixed statuses, research sections and explicit denominator/coverage notes", () => {
  const summary = summarizeWinterResearch([], []), before = structuredClone(summary);
  const html = renderToStaticMarkup(<WinterResearchDashboard summary={summary} quarantined={3} />);
  for (const label of ["Winter Research · 2026/27", "AW", "HURDLE", "CHASE", "KEEP", "INVESTIGATE", "VISUAL ONLY", "DESCRIPTIVE ONLY",
    "RECENT BLOCK", "SPEED RELIABILITY", "RANK", "RACE TYPE", "OR POSITION", "CHASE CHRONOLOGY", "AW fixed review halves",
    "Best L3 Speed rank missing", "WINTER RESEARCH QUESTIONS", "Price n", "Captured-price ROI", "HIGH A/M (n)", "MEDIUM/LOW A/M (n)",
    "separate complete-market Value books", "Recency unclassified", "Unclassified reliability", "3 primary books excluded"]) assert.ok(html.includes(label), label);
  assert.match(html, /HIGH \/ MEDIUM\/LOW Speed reliability is unavailable for Hurdle/);
  assert.match(html, /Research questions, not filters/);
  for (const [label, question] of WINTER_QUESTIONS) { assert.ok(html.includes(label)); assert.ok(html.includes(question)); }
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<form|<button|type="checkbox"|NaN|Infinity/);
  assert.deepEqual(summary, before);
});
