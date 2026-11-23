import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyTissueGeneration, loadTissueGeneration, summarizeTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { ChaseActiveResearch } from "./chase-active-research";
import { DevelopmentReports } from "./development-reports";
import { ResearchPageLayout } from "./research-page-layout";
import { TissuePerformance } from "./tissue-performance";
import { profitMoney, profitPercent } from "./aw-profitability";
import { GET as getDevelopmentReport } from "./reports/[report]/route";

const date = "2026-11-22";
function view(archiveLoaded = false, historyLoaded = false) {
  return renderToStaticMarkup(<ResearchPageLayout date={date} archiveLoaded={archiveLoaded} historyLoaded={historyLoaded}
    daily={<p>Daily AW totals</p>} tissue={<TissuePerformance generation={emptyTissueGeneration()} />}
    active={<ChaseActiveResearch generation={emptyTissueGeneration()} />}
    historical={<><DevelopmentReports />{historyLoaded && <ChaseActiveResearch generation={emptyTissueGeneration()} historicalOnly />}</>}
    secondary={<p>Secondary figures</p>}>
    <p>Archived records</p>
  </ResearchPageLayout>);
}

test("daily profitability and date controls lead the five research areas", () => {
  const html = view();
  const areas = ["daily-profitability", "tissue-performance", "active-research-heading", "historical-research", "archived-research"];
  assert.deepEqual(areas.map(id => html.indexOf(`id="${id}"`)).sort((a, b) => a - b), areas.map(id => html.indexOf(`id="${id}"`)));
  for (const id of areas) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /type="date"[^>]*name="date"[^>]*value="2026-11-22"/);
  assert.match(html, /type="submit">Refresh/);
  assert.match(html, /href="\/racing\/today"/);
  assert.match(html, /href="\/racing\/research"/);
});

test("historical and archived research are collapsed and independently accessible", async () => {
  const normal = view();
  for (const id of ["secondary-monitoring", "historical-research", "archived-research"]) {
    assert.doesNotMatch(normal.match(new RegExp(`<details[^>]*id="${id}"[^>]*>`))![0], /\bopen\b/);
  }
  assert.match(normal, /date=2026-11-22&amp;archive=1#archived-research/);
  assert.match(normal, /date=2026-11-22&amp;history=1#historical-research/);
  assert.doesNotMatch(normal, /Archived records|Chronological validation/);
  assert.match(view(true), /<details open="" id="archived-research"/);
  assert.match(view(true), /Archived records/);
  assert.match(view(false, true), /<details open="" id="historical-research"/);
  assert.match(view(false, true), /Chronological validation/);
  assert.match(normal, /Winter Tissue archive/);
  assert.match(normal, /No-Hoper and market support register/);
  const request = new Request("http://localhost");
  const report = await getDevelopmentReport(request, { params: Promise.resolve({ report: "aw-profitability-development-register" }) });
  assert.equal(report.status, 200);
  assert.match(await report.text(), /AW_MARKET_SUPPORT_V1/);
  assert.equal((await getDevelopmentReport(request, { params: Promise.resolve({ report: "../README" }) })).status, 404);
});

test("Tissue headline uses the same recorded cohort, returns and stakes as the detailed tables", async () => {
  const generation = await loadTissueGeneration();
  const html = renderToStaticMarkup(<TissuePerformance generation={generation} />);
  const headline = html.split("</table>")[0];
  const tableRows = [...headline.matchAll(/<tr[^>]*><th scope="row"[^>]*>([^<]+)<\/th>(.*?)<\/tr>/g)];
  const names = { TURF: "Turf", AW: "All Weather", HURDLE: "Hurdle", CHASE: "Chase" };
  for (const { rank, rows } of summarizeTissueGeneration(generation).filter(r => r.rank !== "TOP_2")) {
    for (const row of rows) {
      if (row.family === "ALL") continue;
      const label = names[row.family];
      const cells = tableRows.filter(([, name]) => name === label).map(([, , cells]) =>
        [...cells.matchAll(/<td[^>]*>([^<]+)<\/td>/g)].map(match => match[1])).find(c => c[0] === `T${rank}`);
      assert.deepEqual(cells, [`T${rank}`, String(row.settled), String(row.winners), String(row.priceN),
        profitMoney(row.profitLoss), profitPercent(row.roi), row.actualModelExpected?.toFixed(2) ?? "—"]);
    }
  }
  assert.match(html, /captured bookmaker prices/);
  assert.match(html, /TISSUE TOP 2/);
  const source = await readFile("src/app/racing/research/forward-value/forward-value-page.tsx", "utf8");
  for (const component of ["TissueProspectiveSummary", "TissueValueMonitoring", "TurfTissueValueSection", "AwTissueValueSection", "JumpTissueValueSection"]) {
    assert.ok(source.includes(`<${component}`));
  }
});
