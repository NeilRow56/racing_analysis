import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { collectionEpochReport } from "@/lib/racing/prospective-epoch-report";
import { ProspectiveEpochDisclosure } from "./prospective-epoch-disclosure";
import { ProspectiveEpochResearch } from "./prospective-epoch-monitor";

test("epoch disclosure defaults closed, shows live counts and preserves every original detail", async () => {
  const report = await collectionEpochReport();
  const original = renderToStaticMarkup(await ProspectiveEpochResearch());
  const html = renderToStaticMarkup(await ProspectiveEpochDisclosure());
  const summary = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
  assert.ok(summary);
  assert.match(html, /<details class="group"><summary/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.ok(summary.includes("Prospective collection epochs"));
  assert.ok(summary.includes(`${report.sourceStatus} — Positive/Neutral: ${report.counts.positiveNeutral} | Hurdle V3 Shadow: ${report.counts.shadow} | Market Edge: ${report.counts.marketEdge}`));
  assert.match(summary, /<svg aria-hidden="true"[^>]*group-open:rotate-90/);
  assert.match(html, /focus-visible:outline-2/);
  assert.doesNotMatch(summary, /role="button"|tabindex="-1"|aria-expanded=/);

  // Compare the entire original body, including all cohort rows, values, ledger references and scrolling wrapper.
  const originalBody = original.slice(original.indexOf("</h3>") + "</h3>".length, original.lastIndexOf("</section>"));
  const disclosureBody = html.slice(html.indexOf("</summary>") + "</summary>".length, html.lastIndexOf("</details>"));
  assert.equal(disclosureBody, originalBody);
  assert.match(disclosureBody, /overflow-x-auto/);
  assert.match(disclosureBody, /ORIGINAL_V1/);
  for (const epoch of Object.values(report.epochs)) {
    assert.ok(disclosureBody.includes(epoch.id));
    assert.ok(disclosureBody.includes(epoch.ledger));
  }
  assert.match(disclosureBody, /Historical backfill: none/);
  assert.match(disclosureBody, /Collection semantics:/);
  assert.match(disclosureBody, /Settlement:/);
});

test("page uses the disclosure without changing the pinned monitor or adding client state", async () => {
  const page = await readFile("src/app/racing/research/forward-value/forward-value-page.tsx", "utf8");
  const source = await readFile("src/app/racing/research/forward-value/prospective-epoch-disclosure.tsx", "utf8");
  assert.match(page, /ProspectiveEpochDisclosure as ProspectiveEpochResearch.*from "\.\/prospective-epoch-disclosure"/);
  assert.equal(source.match(/await collectionEpochReport\(\)/g)?.length, 1);
  assert.doesNotMatch(source, /use client|useState|useEffect|onClick|onKeyDown/);
});
